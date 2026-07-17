import { useEffect, useRef, useState } from "react";

import type { EditableLayer, EditableLayerPatch, VisualArtifact } from "@visualhyper/core";

import { hasTextDraftChanged, isTextEditCancelShortcut, isTextEditSaveShortcut } from "./text-editing";

export function ArtifactInspector({ artifact, layer, onDraft, onCommit }: {
  artifact: VisualArtifact;
  layer: EditableLayer | undefined;
  onDraft: (layerId: string, patch: EditableLayerPatch) => void;
  onCommit: (layerId: string, patch: EditableLayerPatch) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<EditableLayer | undefined>(layer);
  const [textDraft, setTextDraft] = useState(layer?.text ?? "");
  const [textDirty, setTextDirty] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const draftRef = useRef<EditableLayer | undefined>(layer);
  const textDraftRef = useRef(layer?.text ?? "");
  const originalTextRef = useRef(layer?.text ?? "");
  const textDirtyRef = useRef(false);
  const editingNumber = useRef(false);
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;

  useEffect(() => {
    if (!editingNumber.current) {
      draftRef.current = layer;
      setDraft(layer);
    }
    if (!textDirtyRef.current) {
      const next = layer?.text ?? "";
      originalTextRef.current = next;
      textDraftRef.current = next;
      setTextDraft(next);
      setTextDirty(false);
    }
  }, [layer]);
  useEffect(() => () => {
    if (layer && textDirtyRef.current) onDraftRef.current(layer.id, { text: originalTextRef.current });
  }, [layer?.id]);

  if (!layer || !draft) return <div className="artifact-no-parameters"><strong>选择一个画面图层</strong><span>然后调整大小、位置和文案。</span></div>;
  const can = (property: EditableLayer["allowedEdits"][number]) => layer.allowedEdits.includes(property);
  const updateDraft = (next: EditableLayer) => { draftRef.current = next; setDraft(next); };
  const numberField = (label: string, property: "x" | "y" | "width" | "height" | "rotation" | "opacity", step = 1) => (
    <label className="artifact-layer-field"><span>{label}</span><input disabled={!can(property)} step={step} type="number" value={draft[property]} onFocus={() => { editingNumber.current = true; }} onChange={(event) => updateDraft({ ...draftRef.current!, [property]: Number(event.target.value) })} onBlur={() => { editingNumber.current = false; void onCommit(layer.id, { [property]: draftRef.current![property] }); }} /></label>
  );
  const cancelText = () => {
    const original = layer.text ?? originalTextRef.current;
    originalTextRef.current = original;
    textDraftRef.current = original;
    textDirtyRef.current = false;
    setTextDraft(original);
    setTextDirty(false);
    onDraft(layer.id, { text: original });
  };
  const saveText = async () => {
    if (!textDirty || savingText) return;
    const next = textDraftRef.current;
    setSavingText(true);
    const saved = await onCommit(layer.id, { text: next });
    setSavingText(false);
    if (!saved) return;
    originalTextRef.current = next;
    textDirtyRef.current = false;
    setTextDirty(false);
  };

  return <div className="artifact-layer-inspector">
    <div className="artifact-layer-title"><strong>{layer.name ?? layer.id}</strong><small>{layer.kind}</small></div>
    <div className="artifact-layer-grid">{numberField("X", "x")}{numberField("Y", "y")}{numberField("宽", "width")}{numberField("高", "height")}{numberField("旋转", "rotation", .1)}{numberField("透明度", "opacity", .05)}</div>
    <div className="artifact-layer-time"><span>开始 {(layer.startFrame / (artifact.canvas?.fps ?? 30)).toFixed(2)}s</span><span>持续 {(layer.durationFrames / (artifact.canvas?.fps ?? 30)).toFixed(2)}s</span></div>
    {can("text") ? <div className={`artifact-layer-text ${textDirty ? "dirty" : ""}`}>
      <div className="artifact-layer-text-heading"><span>文案</span><em>{textDirty ? "未保存" : "已保存"}</em></div>
      <textarea
        aria-label={`${layer.name ?? layer.id}文案`}
        disabled={savingText}
        value={textDraft}
        onChange={(event) => { const next = event.target.value; const dirty = hasTextDraftChanged(layer.text, next); textDraftRef.current = next; setTextDraft(next); textDirtyRef.current = dirty; setTextDirty(dirty); onDraft(layer.id, { text: next }); }}
        onKeyDown={(event) => {
          const key = { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, isComposing: event.nativeEvent.isComposing };
          if (isTextEditCancelShortcut(key)) { event.preventDefault(); cancelText(); }
          else if (isTextEditSaveShortcut(key)) { event.preventDefault(); void saveText(); }
        }}
      />
      <small>输入时画面会立即预览；也可在画布上双击文字图层修改。</small>
      <div className="artifact-layer-text-actions"><button disabled={!textDirty || savingText} onClick={cancelText} type="button">取消</button><button className="primary" disabled={!textDirty || savingText} onClick={() => void saveText()} type="button">{savingText ? "保存中…" : "保存文案"}</button></div>
    </div> : null}
    <label className="artifact-layer-toggle"><input checked={draft.visible} disabled={!can("visible")} type="checkbox" onChange={(event) => { const visible = event.target.checked; updateDraft({ ...draftRef.current!, visible }); void onCommit(layer.id, { visible }); }} /><span>显示图层</span></label>
    <label className="artifact-layer-toggle"><input checked={draft.locked} disabled={!can("locked")} type="checkbox" onChange={(event) => { const locked = event.target.checked; updateDraft({ ...draftRef.current!, locked }); void onCommit(layer.id, { locked }); }} /><span>锁定图层</span></label>
  </div>;
}
