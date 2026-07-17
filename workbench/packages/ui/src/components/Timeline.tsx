import { Captions, ChevronDown, GripVertical, Lock, Minus, Music2, Plus, Scissors, Video } from "lucide-react";

import type { DragEvent, MouseEvent } from "react";

import { useEditorStore } from "../store";

export function Timeline() {
  const { project, selectedSceneId, setSelection, playheadMs, setPlayhead, zoom, setZoom, commit } = useEditorStore();
  const width = Math.max(780, (project.settings.durationMs / 1000) * 88 * zoom);
  const pxPerMs = width / project.settings.durationMs;
  let sceneStart = 0;
  const scenePositions = project.scenes.map((scene) => {
    const result = { scene, start: sceneStart, width: scene.durationMs * pxPerMs };
    sceneStart += scene.durationMs;
    return result;
  });
  const onRulerClick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setPlayhead(Math.max(0, Math.min(project.settings.durationMs, ((event.clientX - bounds.left) / bounds.width) * project.settings.durationMs)));
  };
  const onDropScene = (event: DragEvent<HTMLDivElement>, toIndex: number) => {
    event.preventDefault();
    const sceneId = event.dataTransfer.getData("application/x-visualhyper-scene");
    if (sceneId) void commit([{ type: "scene.move", sceneId, toIndex }], "重排场景");
  };
  return (
    <section className="timeline panel-surface">
      <div className="timeline-toolbar">
        <div><button type="button"><Scissors size={14} />分割</button><button type="button"><GripVertical size={14} />吸附</button></div>
        <div className="timeline-status"><span>{project.scenes.length} 场景</span><span>{(project.settings.durationMs / 1000).toFixed(1)} 秒</span></div>
        <div className="timeline-zoom"><Minus size={13} /><input min="0.6" max="2" step="0.1" type="range" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><Plus size={13} /></div>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <div className="ruler-label"><span>轨道</span><ChevronDown size={12} /></div>
          <div><Video size={14} /><span>场景</span><Lock size={11} /></div>
          <div><Captions size={14} /><span>字幕</span><Lock size={11} /></div>
          <div><Music2 size={14} /><span>音频</span><Lock size={11} /></div>
        </div>
        <div className="timeline-scroll">
          <div className="timeline-content" style={{ width }}>
            <div className="timeline-ruler" onClick={onRulerClick} role="presentation">
              {Array.from({ length: Math.ceil(project.settings.durationMs / 1000) + 1 }, (_, index) => (
                <span key={index} style={{ left: index * 1000 * pxPerMs }}>{index}s</span>
              ))}
            </div>
            <div className="track-row scene-track">
              {scenePositions.map(({ scene, width: sceneWidth }, index) => (
                <div
                  className={`timeline-clip scene-clip ${scene.id === selectedSceneId ? "active" : ""}`}
                  draggable
                  key={scene.id}
                  style={{ width: sceneWidth }}
                  onDragStart={(event) => event.dataTransfer.setData("application/x-visualhyper-scene", scene.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDropScene(event, index)}
                  onClick={() => setSelection(scene.id)}
                >
                  <div className="clip-color" style={{ background: scene.color }} /><span>{String(index + 1).padStart(2, "0")} · {scene.name}</span><small>{(scene.durationMs / 1000).toFixed(1)}s</small>
                </div>
              ))}
            </div>
            <div className="track-row caption-track">
              {project.captions.map((caption) => (
                <button
                  className="timeline-clip caption-clip"
                  style={{ left: caption.startMs * pxPerMs, width: (caption.endMs - caption.startMs) * pxPerMs }}
                  type="button"
                  key={caption.id}
                  onClick={() => setSelection(caption.sceneId)}
                >
                  <Captions size={12} /><span>{caption.text}</span>
                </button>
              ))}
            </div>
            <div className="track-row audio-track">
              <div className="timeline-clip audio-clip" style={{ left: 0, width }}>
                {Array.from({ length: 110 }, (_, index) => <i key={index} style={{ height: `${22 + ((index * 17) % 64)}%` }} />)}
                <span>旁白占位 · M3</span>
              </div>
            </div>
            <div className="playhead" style={{ left: playheadMs * pxPerMs }}><span /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
