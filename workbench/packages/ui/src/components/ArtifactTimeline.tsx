/** Timeline interaction model adapted from OpenCut Classic (MIT).
 * Upstream: https://github.com/OpenCut-app/opencut-classic
 * Copyright 2025-2026 OpenCut.
 */
import type { EditableLayer, EditableLayerPatch, VisualArtifact } from "@visualhyper/core";
import { Minus, Plus, Scissors, Trash2, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const BASE_PIXELS_PER_SECOND = 22;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 5;
const MIN_DURATION_FRAMES = 3;

type DragMode = "move" | "trim-start" | "trim-end";
type Draft = { id: string; startFrame: number; durationFrames: number };

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(rest < 10 ? 1 : 0).padStart(rest < 10 ? 4 : 2, "0")}`;
}

function snapFrame(frame: number, fps: number, disabled: boolean) {
  if (disabled) return Math.round(frame);
  const interval = Math.max(1, Math.round(fps / 2));
  return Math.round(frame / interval) * interval;
}

export function clipPreviewFrame(layer: Pick<EditableLayer, "startFrame" | "durationFrames">, fps: number) {
  const entranceOffset = Math.min(Math.max(0, layer.durationFrames - 1), Math.max(1, Math.round(fps * .5)));
  return layer.startFrame + entranceOffset;
}

export function timelineSeekFrame(pointerRatio: number, durationFrames: number) {
  return Math.round(Math.max(0, Math.min(1, pointerRatio)) * Math.max(0, durationFrames - 1));
}

export function canSplitLayerAtFrame(layer: Pick<EditableLayer, "allowedEdits" | "durationFrames" | "locked" | "startFrame">, frame: number) {
  return Number.isInteger(frame)
    && !layer.locked
    && layer.allowedEdits.includes("startFrame")
    && layer.allowedEdits.includes("durationFrames")
    && frame > layer.startFrame
    && frame < layer.startFrame + layer.durationFrames;
}

export function timelineShortcutAction(input: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
}, layer: Pick<EditableLayer, "allowedEdits" | "deleted" | "durationFrames" | "locked" | "startFrame">, currentFrame: number) {
  if (input.repeat || layer.deleted) return null;
  if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === "b" && canSplitLayerAtFrame(layer, currentFrame)) return "split" as const;
  if ((input.key === "Delete" || input.key === "Backspace") && !layer.locked) return "delete" as const;
  if (input.key === "ArrowLeft") return "seek-left" as const;
  if (input.key === "ArrowRight") return "seek-right" as const;
  return null;
}

export function ArtifactTimeline({ artifact, selectedLayerId, currentFrame, onSelect, onSeek, onCommit, onSplit, onDelete }: {
  artifact: VisualArtifact;
  selectedLayerId: string;
  currentFrame: number;
  onSelect: (layerId: string) => void;
  onSeek: (frame: number) => void;
  onCommit: (layerId: string, patch: EditableLayerPatch) => void;
  onSplit: (layerId: string, splitFrame: number) => Promise<boolean>;
  onDelete: (layerId: string) => Promise<boolean>;
}) {
  const canvas = artifact.canvas;
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<{ mode: DragMode; layer: EditableLayer; originX: number } | null>(null);
  const canEditTiming = (layer: EditableLayer) => !layer.locked && layer.allowedEdits.includes("startFrame") && layer.allowedEdits.includes("durationFrames");
  const fps = canvas?.fps ?? 30;
  const durationSeconds = canvas ? canvas.durationFrames / fps : 0;
  const width = Math.max(960, durationSeconds * BASE_PIXELS_PER_SECOND * zoom);
  const pxPerFrame = width / Math.max(1, canvas?.durationFrames ?? 1);
  const tickSeconds = zoom < .65 ? 20 : zoom < 1.4 ? 10 : zoom < 2.8 ? 5 : 2;
  const visibleLayers = artifact.editableLayers.filter((layer) => !layer.deleted);
  const effectLayers = visibleLayers.filter((layer) => !["caption", "video", "audio", "image"].includes(layer.kind));
  const captionLayers = visibleLayers.filter((layer) => layer.kind === "caption");
  const mediaLayers = visibleLayers.filter((layer) => layer.kind === "video" || layer.kind === "image");
  const audioLayers = visibleLayers.filter((layer) => layer.kind === "audio");
  const ticks = useMemo(() => Array.from({ length: Math.ceil(durationSeconds / tickSeconds) + 1 }, (_, index) => index * tickSeconds), [durationSeconds, tickSeconds]);

  useEffect(() => {
    function move(event: PointerEvent) {
      const active = interaction.current;
      if (!active || !canvas) return;
      const deltaFrames = snapFrame((event.clientX - active.originX) / pxPerFrame, fps, event.altKey);
      const { layer, mode } = active;
      if (mode === "move") {
        const next = { id: layer.id, startFrame: Math.max(0, Math.min(canvas.durationFrames - layer.durationFrames, layer.startFrame + deltaFrames)), durationFrames: layer.durationFrames };
        draftRef.current = next; setDraft(next);
      } else if (mode === "trim-start") {
        const nextStart = Math.max(0, Math.min(layer.startFrame + layer.durationFrames - MIN_DURATION_FRAMES, layer.startFrame + deltaFrames));
        const next = { id: layer.id, startFrame: nextStart, durationFrames: layer.durationFrames + layer.startFrame - nextStart };
        draftRef.current = next; setDraft(next);
      } else {
        const nextDuration = Math.max(MIN_DURATION_FRAMES, Math.min(canvas.durationFrames - layer.startFrame, layer.durationFrames + deltaFrames));
        const next = { id: layer.id, startFrame: layer.startFrame, durationFrames: nextDuration };
        draftRef.current = next; setDraft(next);
      }
    }
    function end() {
      const latest = draftRef.current;
      if (latest && interaction.current) onCommit(latest.id, { startFrame: latest.startFrame, durationFrames: latest.durationFrames });
      interaction.current = null;
      draftRef.current = null;
      setDraft(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  }, [canvas, fps, onCommit, pxPerFrame]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (!canvas || !selectedLayerId || document.activeElement?.matches("input,textarea,select,[contenteditable='true']")) return;
      const layer = artifact.editableLayers.find((item) => item.id === selectedLayerId);
      if (!layer) return;
      const action = timelineShortcutAction(event, layer, currentFrame);
      if (action === "split") {
        event.preventDefault();
        void onSplit(layer.id, currentFrame);
        return;
      }
      if (action === "delete") {
        event.preventDefault();
        void onDelete(layer.id);
        return;
      }
      if (action === "seek-left" || action === "seek-right") {
        event.preventDefault();
        const step = event.shiftKey ? Math.round(fps) : 1;
        const direction = action === "seek-left" ? -1 : 1;
        onSeek(Math.max(0, Math.min(canvas.durationFrames - 1, currentFrame + direction * step)));
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [artifact.editableLayers, canvas, currentFrame, fps, onDelete, onSeek, onSplit, selectedLayerId]);

  if (!canvas) return null;
  const selectedLayer = visibleLayers.find((layer) => layer.id === selectedLayerId);
  const canSplitSelected = Boolean(selectedLayer && canSplitLayerAtFrame(selectedLayer, currentFrame));
  function seek(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const frame = timelineSeekFrame((event.clientX - rect.left) / rect.width, canvas!.durationFrames);
    onSeek(frame);
  }
  function startDrag(event: React.PointerEvent, layer: EditableLayer, mode: DragMode) {
    if (!canEditTiming(layer)) return;
    event.preventDefault(); event.stopPropagation();
    onSelect(layer.id);
    draftRef.current = null;
    interaction.current = { mode, layer, originX: event.clientX };
  }
  function renderClip(layer: EditableLayer) {
    const value = draft?.id === layer.id ? draft : layer;
    return <button className={`artifact-track-clip ${layer.id === selectedLayerId ? "active" : ""} ${layer.locked ? "locked" : ""}`}
      key={layer.id} onClick={() => { onSelect(layer.id); onSeek(clipPreviewFrame(layer, fps)); }}
      onPointerDown={(event) => startDrag(event, layer, "move")}
      style={{ left: value.startFrame * pxPerFrame, width: Math.max(12, value.durationFrames * pxPerFrame) }} title={`${layer.name ?? layer.id} · ${formatTime(value.startFrame / fps)}`} type="button">
      {canEditTiming(layer) ? <span className="timeline-trim-handle start" onPointerDown={(event) => startDrag(event, layer, "trim-start")} /> : null}
      <span>{layer.name ?? layer.text ?? layer.id}</span><small>{(value.durationFrames / fps).toFixed(1)}s</small>
      {canEditTiming(layer) ? <span className="timeline-trim-handle end" onPointerDown={(event) => startDrag(event, layer, "trim-end")} /> : null}
    </button>;
  }

  return <section className={`artifact-layer-timeline panel-surface ${expanded ? "is-expanded" : "is-compact"}`}>
    <header><div><strong>画面轨道</strong><span>{expanded ? `${visibleLayers.length} 个专业图层` : `${effectLayers.length} 个特效 · ${captionLayers.length} 段字幕`} · {formatTime(durationSeconds)}</span></div>
      <div className="timeline-toolbar"><span className="timeline-time-readout">{formatTime(currentFrame / fps)}</span>
        <button aria-label="在播放头处分割选中片段" className="timeline-split-button" disabled={!canSplitSelected} onClick={() => { if (selectedLayer) void onSplit(selectedLayer.id, currentFrame); }} title={canSplitSelected ? "分割片段（Ctrl+B）" : "把播放头放到选中片段内部"} type="button"><Scissors size={12} />分割</button>
        <button aria-label="删除选中片段" className="timeline-delete-button" disabled={!selectedLayer || selectedLayer.locked} onClick={() => { if (selectedLayer) void onDelete(selectedLayer.id); }} title={selectedLayer?.locked ? "锁定片段不能删除" : "删除片段（Delete）"} type="button"><Trash2 size={12} /></button>
        <button aria-label="缩小时间轴" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value / 1.35))} type="button"><Minus size={12} /></button>
        <button aria-label="适配整个时间轴" onClick={() => { setZoom(MIN_ZOOM); scrollRef.current?.scrollTo({ left: 0 }); }} type="button"><ZoomIn size={12} /></button>
        <button aria-label="放大时间轴" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value * 1.35))} type="button"><Plus size={12} /></button>
        <button className="timeline-density-toggle" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "收起图层" : "展开专业轨道"}</button>
      </div></header>
    <div className="artifact-layer-timeline-body">
      {expanded ? <div className="artifact-track-labels"><div className="timeline-ruler-spacer" />{visibleLayers.map((layer) => <button className={layer.id === selectedLayerId ? "active" : ""} key={layer.id} onClick={() => onSelect(layer.id)} type="button">{layer.name ?? layer.id}</button>)}</div> : <div className="artifact-track-labels artifact-track-labels-compact"><div className="timeline-ruler-spacer" /><span>特效</span><span>字幕</span><span>视频素材</span><span>声音</span></div>}
      <div className="artifact-track-scroll" ref={scrollRef}>
        <div className={`artifact-track-content ${expanded ? "" : "artifact-track-content-compact"}`} style={{ width }}>
          <div className="timeline-ruler" onPointerDown={seek}>{ticks.map((time) => <span key={time} style={{ left: time * fps * pxPerFrame }}><i />{formatTime(time)}</span>)}</div>
          <div className="timeline-playhead" style={{ left: currentFrame * pxPerFrame }}><i /></div>
          {expanded ? visibleLayers.map((layer) => <div className="artifact-track-row" key={layer.id}>{renderClip(layer)}</div>) : <>
            <div className="artifact-track-row artifact-track-row-compact effect-lane">{effectLayers.map(renderClip)}</div>
            <div className="artifact-track-row artifact-track-row-compact caption-lane">{captionLayers.map(renderClip)}</div>
            <div className="artifact-track-row artifact-track-row-compact media-lane">{mediaLayers.map(renderClip)}</div>
            <div className="artifact-track-row artifact-track-row-compact audio-lane">{audioLayers.map(renderClip)}</div>
          </>}
        </div>
      </div>
    </div>
    <footer className="timeline-help">拖动片段调整时间 · 两端裁切 · Ctrl+B 分割 · Delete 删除 · Alt 暂停吸附 · ←/→ 逐帧预览 · Shift 加速</footer>
  </section>;
}
