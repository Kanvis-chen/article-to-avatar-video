import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const LAYOUT_OVERRIDES_VERSION = "1" as const;

// Browser-safe runtime shared by persisted HyperFrames overrides and Kanvis live preview.
// It applies only the changed text range so existing <em>, .mark and other inline VFX markup survives typo fixes.
export const EDITABLE_TEXT_RUNTIME_SOURCE = String.raw`
  const kanvisOriginalTextMarkup=new WeakMap();
  function kanvisCompactText(value){return String(value==null?"":value).replace(/\s+/g," ").trim()}
  function kanvisTextPoint(root,offset){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node=walker.nextNode(),consumed=0,last=null;
    while(node){
      last=node;
      const length=(node.nodeValue||"").length;
      if(offset<=consumed+length)return {node:node,offset:Math.max(0,offset-consumed)};
      consumed+=length;
      node=walker.nextNode();
    }
    return last?{node:last,offset:(last.nodeValue||"").length}:{node:root,offset:root.childNodes.length};
  }
  function kanvisTextFragment(value){
    const fragment=document.createDocumentFragment();
    String(value).split(/\r?\n/).forEach(function(part,index){
      if(index)fragment.appendChild(document.createElement("br"));
      if(part)fragment.appendChild(document.createTextNode(part));
    });
    return fragment;
  }
  function kanvisSetEditableText(target,value){
    if(!target)return;
    let original=kanvisOriginalTextMarkup.get(target);
    if(!original){original={html:target.innerHTML,text:target.textContent||""};kanvisOriginalTextMarkup.set(target,original)}
    const next=String(value==null?"":value);
    target.innerHTML=original.html;
    if(kanvisCompactText(next)===kanvisCompactText(original.text))return;
    const previous=target.textContent||"";
    let prefix=0;
    while(prefix<previous.length&&prefix<next.length&&previous[prefix]===next[prefix])prefix++;
    let suffix=0;
    while(suffix<previous.length-prefix&&suffix<next.length-prefix&&previous[previous.length-1-suffix]===next[next.length-1-suffix])suffix++;
    const start=kanvisTextPoint(target,prefix);
    const end=kanvisTextPoint(target,previous.length-suffix);
    const range=document.createRange();
    range.setStart(start.node,start.offset);
    range.setEnd(end.node,end.offset);
    range.deleteContents();
    const replacement=next.slice(prefix,next.length-suffix);
    if(replacement)range.insertNode(kanvisTextFragment(replacement));
  }
  function kanvisSafeLayerId(value){return String(value==null?"":value).replace(/[^a-zA-Z0-9._-]/g,"")}
  function kanvisLayerTarget(id){return document.querySelector('[data-editable-layer="'+kanvisSafeLayerId(id)+'"]')}
  function kanvisRenameClone(root,sourceId,nextId){
    const source=kanvisSafeLayerId(sourceId),next=kanvisSafeLayerId(nextId);
    const nodes=[root].concat(Array.from(root.querySelectorAll("[data-editable-layer],[data-editable-text],[data-card-id]")));
    nodes.forEach(function(node){
      if(node.dataset.editableLayer===source)node.dataset.editableLayer=next;
      if(node.dataset.editableText===source)node.dataset.editableText=next;
      if(node.dataset.cardId===source)node.dataset.cardId=next;
    });
    if(root.id)root.id=root.id+"--"+next;
  }
  function kanvisResolveLayerTarget(layer){
    let target=kanvisLayerTarget(layer.id);
    if(target||!layer.sourceLayerId)return target;
    const sourceTarget=kanvisLayerTarget(layer.sourceLayerId);
    if(!sourceTarget)return null;
    const sourceClip=sourceTarget.matches(".clip")?sourceTarget:sourceTarget.closest(".clip");
    if(!sourceClip||!sourceClip.parentNode)return null;
    const clone=sourceClip.cloneNode(true);
    kanvisRenameClone(clone,layer.sourceLayerId,layer.id);
    clone.dataset.kanvisDerivedLayer=kanvisSafeLayerId(layer.id);
    if(clone.classList.contains("card-host"))clone.style.opacity="1";
    sourceClip.parentNode.insertBefore(clone,sourceClip.nextSibling);
    target=kanvisLayerTarget(layer.id);
    return target;
  }
  function kanvisApplyLayerOverride(layer,fps){
    const target=kanvisResolveLayerTarget(layer);
    if(!target)return;
    const clip=target.matches(".clip")?target:target.closest(".clip");
    if(clip&&Number.isFinite(layer.startFrame)&&Number.isFinite(layer.durationFrames)){
      clip.dataset.start=String(layer.startFrame/fps);
      clip.dataset.duration=String(layer.durationFrames/fps);
      if(Number.isFinite(layer.mediaStartFrame))clip.dataset.mediaStart=String(layer.mediaStartFrame/fps);
    }
    target.style.inset="auto";
    target.style.left=layer.x+"px";target.style.top=layer.y+"px";
    target.style.width=layer.width+"px";target.style.height=layer.height+"px";
    target.style.transform="rotate("+layer.rotation+"deg)";
    target.style.opacity=String(layer.opacity);target.style.display=layer.visible?"":"none";
    const text=document.querySelector('[data-editable-text="'+kanvisSafeLayerId(layer.id)+'"]');
    if(text&&typeof layer.text==="string")kanvisSetEditableText(text,layer.text);
  }
  function kanvisApplyLayoutOverrides(payload){
    if(!payload||!Array.isArray(payload.layers))return;
    const stage=document.querySelector("[data-composition-id]");
    const fps=Math.max(1,Number(stage&&stage.dataset.fps)||30);
    payload.layers.forEach(function(layer){kanvisApplyLayerOverride(layer,fps)});
  }
`;

export type LayoutOverrideLayer = {
  id: string; sourceLayerId?: string | undefined; x: number; y: number; width: number; height: number; rotation: number;
  opacity: number; visible: boolean; startFrame?: number | undefined; durationFrames?: number | undefined;
  mediaStartFrame?: number | undefined; text?: string | undefined;
};

export type LayoutOverrides = {
  schemaVersion: typeof LAYOUT_OVERRIDES_VERSION;
  editRevision: number;
  layers: LayoutOverrideLayer[];
};

function assertRelativeControlledTarget(target: string): string {
  if (!target || path.isAbsolute(target) || target.includes("\0")) {
    throw new Error("Layout override target must be a project-relative path.");
  }
  const normalized = target.replace(/\\/g, "/");
  if (normalized !== ".visualhyper/layout-overrides.json") {
    throw new Error("Layout overrides may only be written to .visualhyper/layout-overrides.json.");
  }
  return normalized;
}

export function compileLayoutOverrides(input: { editRevision: number; layers: LayoutOverrideLayer[] }): LayoutOverrides {
  return {
    schemaVersion: LAYOUT_OVERRIDES_VERSION,
    editRevision: input.editRevision,
    layers: input.layers.map(({ id, sourceLayerId, x, y, width, height, rotation, opacity, visible, startFrame, durationFrames, mediaStartFrame, text }) => ({
      id, ...(sourceLayerId === undefined ? {} : { sourceLayerId }), x, y, width, height, rotation, opacity, visible,
      ...(startFrame === undefined ? {} : { startFrame }), ...(durationFrames === undefined ? {} : { durationFrames }),
      ...(mediaStartFrame === undefined ? {} : { mediaStartFrame }),
      ...(text === undefined ? {} : { text }),
    })),
  };
}

export async function writeLayoutOverrides(input: {
  projectDir: string;
  target: string;
  editRevision: number;
  layers: LayoutOverrideLayer[];
}): Promise<string> {
  const projectDir = path.resolve(input.projectDir);
  const target = assertRelativeControlledTarget(input.target);
  const outputFile = path.resolve(projectDir, target);
  if (path.relative(projectDir, outputFile).startsWith("..")) throw new Error("Layout override target is outside the engine project.");
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temporary = `${outputFile}.${process.pid}.${Date.now()}.tmp`;
  const compiled = compileLayoutOverrides(input);
  await writeFile(temporary, `${JSON.stringify(compiled, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, outputFile);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  const scriptFile = path.resolve(projectDir, ".visualhyper", "layout-overrides.js");
  const scriptTemporary = `${scriptFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(scriptTemporary, `(function(){"use strict";${EDITABLE_TEXT_RUNTIME_SOURCE}\nwindow.__KANVIS_SET_EDITABLE_TEXT__=kanvisSetEditableText;window.__KANVIS_APPLY_LAYOUT_OVERRIDES__=kanvisApplyLayoutOverrides;window.__KANVIS_LAYOUT_OVERRIDES__=${JSON.stringify(compiled)};kanvisApplyLayoutOverrides(window.__KANVIS_LAYOUT_OVERRIDES__);})();\n`, { encoding: "utf8", flag: "wx" });
  try {
    await rename(scriptTemporary, scriptFile);
  } catch (error) {
    await unlink(scriptTemporary).catch(() => undefined);
    throw error;
  }
  return outputFile;
}
