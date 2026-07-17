import { EDITABLE_TEXT_RUNTIME_SOURCE } from "@visualhyper/hyperframes-adapter";

export const PREVIEW_BRIDGE_PATH = "/.kanvis/preview-bridge.js";

export const PREVIEW_BRIDGE_SOURCE = String.raw`(function(){
  "use strict";
  ${EDITABLE_TEXT_RUNTIME_SOURCE}
  function trustedParent(event){
    return event.source===window.parent&&/^http:\/\/127\.0\.0\.1:\d+$/.test(event.origin);
  }
  function announcePreviewMedia(targetOrigin){
    const media=document.querySelector("#source-audio")||document.querySelector("audio")||document.querySelector("#source-video")||document.querySelector("video");
    const audioSrc=media&&media.getAttribute("src");
    if(audioSrc&&window.parent!==window)window.parent.postMessage({type:"KANVIS_PREVIEW_MEDIA",audioSrc:audioSrc},targetOrigin);
  }
  window.addEventListener("message",function(event){
    if(!trustedParent(event))return;
    const message=event.data;
    if(!message)return;
    if(message.type==="KANVIS_PREVIEW_DISCOVER_MEDIA"){announcePreviewMedia(event.origin);return;}
    if(message.type==="KANVIS_PREVIEW_SYNC_LAYERS"&&Array.isArray(message.layers)){
      kanvisApplyLayoutOverrides({layers:message.layers});
      return;
    }
    if(message.type==="KANVIS_PREVIEW_SEEK"&&Number.isFinite(message.time)){
      const time=Math.max(0,message.time);
      const playing=message.playing===true;
      const timelines=window.__timelines&&Object.values(window.__timelines);
      const timeline=timelines&&timelines[timelines.length-1];
      if(timeline&&typeof timeline.seek==="function"){
        timeline.seek(time,false);
        if(typeof timeline.pause==="function")timeline.pause();
      }
      document.querySelectorAll(".clip").forEach(function(clip){
        const start=Number(clip.dataset.start||0),duration=Number(clip.dataset.duration||0);
        clip.style.visibility=time>=start&&time<start+duration?"visible":"hidden";
      });
      document.querySelectorAll("video,audio").forEach(function(media){
        const start=Number(media.dataset.start||0),mediaStart=Number(media.dataset.mediaStart||start),duration=Number(media.dataset.duration||174.104);
        const active=time>=start&&time<start+duration;
        const target=Math.max(0,time-start+mediaStart);
        if(Math.abs((media.currentTime||0)-target)>(playing ? .22 : .04)){try{media.currentTime=target}catch{}}
        media.muted=true;
        if(playing&&active){void media.play().catch(function(){})}else media.pause();
      });
      return;
    }
    if(message.type!=="KANVIS_PREVIEW_LAYER_DRAFT"||!message.layer)return;
    const layer=message.layer;
    const target=kanvisResolveLayerTarget(layer);
    if(!target)return;
    if(Number.isFinite(layer.x))target.style.left=layer.x+"px";
    if(Number.isFinite(layer.y))target.style.top=layer.y+"px";
    if(Number.isFinite(layer.width))target.style.width=layer.width+"px";
    if(Number.isFinite(layer.height))target.style.height=layer.height+"px";
    if(Number.isFinite(layer.rotation))target.style.transform="rotate("+layer.rotation+"deg)";
    if(Number.isFinite(layer.opacity))target.style.opacity=String(layer.opacity);
    if(typeof layer.visible==="boolean")target.style.display=layer.visible?"":"none";
    if(typeof layer.text==="string"){
      const textTarget=document.querySelector('[data-editable-text="'+kanvisSafeLayerId(layer.id)+'"]');
      if(textTarget)(typeof window.__KANVIS_SET_EDITABLE_TEXT__==="function"?window.__KANVIS_SET_EDITABLE_TEXT__:kanvisSetEditableText)(textTarget,layer.text);
    }
  });
})();
//# sourceURL=kanvis-preview-bridge.js
`;

export function injectPreviewBridge(html: string) {
  const tag = `<script src="${PREVIEW_BRIDGE_PATH}"></script>`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${tag}</body>`) : `${html}${tag}`;
}
