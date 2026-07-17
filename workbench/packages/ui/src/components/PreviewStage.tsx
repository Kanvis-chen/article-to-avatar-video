import { Maximize2, Pause, Play, RotateCcw, Volume2 } from "lucide-react";

import type { CSSProperties } from "react";

import { useEditorStore } from "../store";

function elementStyle(element: { x: number; y: number; width: number; height: number; scale: number; rotation: number; opacity: number }): CSSProperties {
  return {
    left: `${(element.x / 1080) * 100}%`,
    top: `${(element.y / 1920) * 100}%`,
    width: `${(element.width / 1080) * 100}%`,
    height: `${(element.height / 1920) * 100}%`,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
  };
}

export function PreviewStage() {
  const { project, selectedSceneId, selectedElementId, setSelection, isPlaying, setPlaying, playheadMs } = useEditorStore();
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const caption = project.captions.find((item) => item.sceneId === scene?.id);
  return (
    <section className="preview-column">
      <div className="preview-toolbar">
        <div><span>预览</span><small>1080 × 1920</small></div>
        <div><button type="button"><RotateCcw size={14} />适应</button><button type="button"><Maximize2 size={14} /></button></div>
      </div>
      <div className="preview-well">
        <div className="preview-canvas" style={{ background: scene?.color ?? "#111827" }}>
          <div className="preview-grid" />
          <div className="preview-orb one" /><div className="preview-orb two" />
          {scene?.elements.map((element) => (
            <button
              type="button"
              key={element.id}
              aria-label={`选择 ${element.name}`}
              className={`preview-element ${element.type} ${selectedElementId === element.id ? "selected" : ""}`}
              style={{
                ...elementStyle(element),
                ...(element.type === "shape" ? { background: element.fill, borderRadius: `${element.radius}px` } : {}),
                ...(element.type === "text" ? {
                  color: element.style.color,
                  fontFamily: element.style.fontFamily,
                  fontSize: `${(element.style.fontSize / 1920) * 100}cqh`,
                  fontWeight: element.style.fontWeight,
                  textAlign: element.style.textAlign,
                } : {}),
              }}
              onClick={() => setSelection(scene.id, element.id)}
            >
              {element.type === "text" ? element.text : null}
            </button>
          ))}
          {caption ? <div className="caption-preview">{caption.text}</div> : null}
          <div className="safe-area" />
        </div>
      </div>
      <div className="transport-bar">
        <div className="transport-left"><button type="button"><Volume2 size={15} /></button></div>
        <div className="transport-center">
          <button className="play-button" onClick={() => setPlaying(!isPlaying)} type="button">
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span>{(playheadMs / 1000).toFixed(1)}s</span><small>/ {(project.settings.durationMs / 1000).toFixed(1)}s</small>
        </div>
        <div className="transport-right"><span>30 fps</span><span>100%</span></div>
      </div>
    </section>
  );
}
