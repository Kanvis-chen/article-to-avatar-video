import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Rnd } from "react-rnd";

import type { EditableLayer, EditableLayerPatch, VisualArtifact } from "@visualhyper/core";

import { hasTextDraftChanged, isTextEditCancelShortcut, isTextEditSaveShortcut } from "./text-editing";

export type LayerPreviewDraft = {
  sequence: number;
  layerId: string;
  patch: EditableLayerPatch;
};

export function ArtifactCanvas({
  artifact,
  videoSrc,
  previewUrl,
  selectedLayerId,
  onSelect,
  onCommit,
  currentFrame,
  playing,
  previewDraft,
  onTimeChange,
  onPlayingChange,
}: {
  artifact: VisualArtifact;
  videoSrc: string | null;
  previewUrl: string;
  selectedLayerId: string;
  onSelect: (layerId: string) => void;
  onCommit: (layerId: string, patch: EditableLayerPatch) => Promise<boolean>;
  currentFrame: number;
  playing: boolean;
  previewDraft: LayerPreviewDraft | null;
  onTimeChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const previewAudioRef = useRef<HTMLVideoElement>(null);
  const previewAudioStarting = useRef(false);
  const [scale, setScale] = useState(1);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [previewAudioSrc, setPreviewAudioSrc] = useState("");
  const canvas = artifact.canvas;
  const previewOrigin = previewUrl ? new URL(previewUrl).origin : "*";

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !canvas) return;
    const update = () => setScale(Math.min(shell.clientWidth / canvas.width, Math.max(1, shell.clientHeight - 54) / canvas.height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [canvas]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canvas) return;
    const time = currentFrame / canvas.fps;
    if (Math.abs(video.currentTime - time) > .08) video.currentTime = time;
  }, [canvas, currentFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => onPlayingChange(false));
    else video.pause();
  }, [onPlayingChange, playing]);
  useEffect(() => {
    setPreviewAudioSrc("");
    if (!previewUrl) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== previewRef.current?.contentWindow || event.origin !== previewOrigin) return;
      const message = event.data as { type?: unknown; audioSrc?: unknown } | null;
      if (message?.type !== "KANVIS_PREVIEW_MEDIA" || typeof message.audioSrc !== "string") return;
      setAudioBlocked(false);
      setPreviewAudioSrc(resolvePreviewMediaUrl(previewUrl, message.audioSrc));
    };
    window.addEventListener("message", receive);
    previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_DISCOVER_MEDIA" }, previewOrigin);
    return () => window.removeEventListener("message", receive);
  }, [previewOrigin, previewUrl]);
  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio || !canvas) return;
    const time = currentFrame / canvas.fps;
    audio.muted = muted;
    if (Math.abs(audio.currentTime - time) > (playing ? .22 : .04)) audio.currentTime = time;
    if (!playing) { previewAudioStarting.current = false; audio.pause(); return; }
    if (audio.paused && !previewAudioStarting.current && !audioBlocked) {
      previewAudioStarting.current = true;
      void audio.play().then(() => { previewAudioStarting.current = false; setAudioBlocked(false); }).catch((error: unknown) => {
        previewAudioStarting.current = false;
        console.warn("KANVIS_PREVIEW_AUDIO_PLAY_FAILED", error);
        setAudioBlocked(true);
      });
    }
  }, [audioBlocked, canvas, currentFrame, muted, playing, previewAudioSrc]);
  useEffect(() => {
    if (!previewUrl || !canvas || !playing) return;
    const startedAt = performance.now();
    const startFrame = currentFrame;
    let animationFrame = 0;
    const tick = (now: number) => {
      const nextFrame = Math.min(canvas.durationFrames - 1, startFrame + Math.floor((now - startedAt) * canvas.fps / 1_000));
      onTimeChange(nextFrame);
      if (nextFrame >= canvas.durationFrames - 1) { onPlayingChange(false); return; }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  // currentFrame is intentionally captured only when playback starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, onPlayingChange, onTimeChange, playing, previewUrl]);
  useEffect(() => {
    if (!previewUrl || !canvas) return;
    previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_SEEK", time: currentFrame / canvas.fps, playing, muted }, previewOrigin);
  }, [canvas, currentFrame, muted, playing, previewOrigin, previewUrl]);
  useEffect(() => {
    if (!previewUrl) return;
    previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_SYNC_LAYERS", layers: artifact.editableLayers }, previewOrigin);
  }, [artifact.editRevision, artifact.editableLayers, previewOrigin, previewUrl]);
  useEffect(() => {
    if (!previewUrl || !previewDraft) return;
    previewRef.current?.contentWindow?.postMessage({
      type: "KANVIS_PREVIEW_LAYER_DRAFT",
      layer: { id: previewDraft.layerId, ...previewDraft.patch },
    }, previewOrigin);
  }, [previewDraft, previewOrigin, previewUrl]);

  if (!canvas) return <div className="artifact-canvas-empty">该视频没有声明可编辑画布。</div>;
  const togglePlayback = () => {
    if (previewUrl) {
      const nextPlaying = !playing;
      const audio = previewAudioRef.current;
      if (audio) {
        audio.currentTime = currentFrame / canvas.fps;
        if (nextPlaying && audio.paused) {
          previewAudioStarting.current = true;
          audio.muted = muted;
          void audio.play().then(() => { previewAudioStarting.current = false; setAudioBlocked(false); }).catch((error: unknown) => {
            previewAudioStarting.current = false;
            console.warn("KANVIS_PREVIEW_AUDIO_PLAY_FAILED", error);
            setAudioBlocked(true);
          });
        } else if (!nextPlaying) { previewAudioStarting.current = false; audio.pause(); }
      }
      previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_SEEK", time: currentFrame / canvas.fps, playing: nextPlaying, muted }, previewOrigin);
      onPlayingChange(nextPlaying);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => onPlayingChange(true)).catch(() => onPlayingChange(false));
    } else {
      video.pause();
      onPlayingChange(false);
    }
  };
  const toggleAudio = () => {
    const audio = previewAudioRef.current;
    if (audioBlocked && !muted && audio) {
      previewAudioStarting.current = true;
      audio.muted = false;
      void audio.play().then(() => { previewAudioStarting.current = false; setAudioBlocked(false); }).catch((error: unknown) => {
        previewAudioStarting.current = false;
        console.warn("KANVIS_PREVIEW_AUDIO_PLAY_FAILED", error);
        setAudioBlocked(true);
      });
      return;
    }
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audio) audio.muted = nextMuted;
  };
  return (
    <div className="artifact-canvas-shell" ref={shellRef}>
      <div
        className="artifact-canvas-stage"
        style={{ width: canvas.width, height: canvas.height, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {previewUrl ? <iframe allow="autoplay" className="artifact-canvas-video artifact-live-composition" onLoad={() => { previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_DISCOVER_MEDIA" }, previewOrigin); previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_SYNC_LAYERS", layers: artifact.editableLayers }, previewOrigin); previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_SEEK", time: currentFrame / canvas.fps, playing, muted }, previewOrigin); if (previewDraft) previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_LAYER_DRAFT", layer: { id: previewDraft.layerId, ...previewDraft.patch } }, previewOrigin); }} ref={previewRef} src={previewUrl} title="HyperFrames 实时特效画布" /> : videoSrc ? <video className="artifact-canvas-video" controls={false} muted={muted} onEnded={() => onPlayingChange(false)} onPause={() => onPlayingChange(false)} onPlay={() => onPlayingChange(true)} onTimeUpdate={(event) => onTimeChange(Math.round(event.currentTarget.currentTime * canvas.fps))} preload="metadata" ref={videoRef} src={videoSrc} /> : null}
        {previewAudioSrc ? <video aria-hidden="true" className="artifact-preview-audio-source" muted={muted} playsInline preload="auto" ref={previewAudioRef} src={previewAudioSrc} /> : null}
        <div className="artifact-canvas-dim" />
        {artifact.editableLayers.filter((layer) => !layer.deleted && layer.visible
          && layer.allowedEdits.some((property) => ["x", "y", "width", "height", "rotation", "opacity", "visible", "locked", "text"].includes(property))
          && currentFrame >= layer.startFrame
          && currentFrame < layer.startFrame + layer.durationFrames).map((layer) => (
          <LayerBox
            key={layer.id}
            layer={layer}
            scale={scale}
            selected={layer.id === selectedLayerId}
            onSelect={() => onSelect(layer.id)}
            onDraft={(patch) => previewRef.current?.contentWindow?.postMessage({ type: "KANVIS_PREVIEW_LAYER_DRAFT", layer: { id: layer.id, ...patch } }, previewOrigin)}
            onCommit={(patch) => onCommit(layer.id, patch)}
          />
        ))}
      </div>
      <div className="artifact-playback-controls">
        <button aria-label="后退五秒" onClick={() => { onPlayingChange(false); onTimeChange(Math.max(0, currentFrame - canvas.fps * 5)); }} type="button"><SkipBack size={14} /></button>
        <button aria-label={playing ? "暂停预览" : "播放预览"} className="primary" onClick={togglePlayback} type="button">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button aria-label="前进五秒" onClick={() => { onPlayingChange(false); onTimeChange(Math.min(canvas.durationFrames - 1, currentFrame + canvas.fps * 5)); }} type="button"><SkipForward size={14} /></button>
        <span>{formatPlaybackTime(currentFrame / canvas.fps)} / {formatPlaybackTime(canvas.durationFrames / canvas.fps)}</span>
        <input aria-label="预览进度" max={canvas.durationFrames - 1} min={0} onChange={(event) => { onPlayingChange(false); onTimeChange(Number(event.target.value)); }} type="range" value={currentFrame} />
        <button aria-label={audioBlocked && !muted ? "启用声音" : muted ? "打开声音" : "静音"} onClick={toggleAudio} type="button">{muted || audioBlocked ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
        <button aria-label="全屏预览" onClick={() => void shellRef.current?.requestFullscreen()} type="button"><Maximize2 size={14} /></button>
      </div>
      {previewUrl ? <div className="artifact-live-badge">实时特效编辑 · {audioBlocked && !muted ? "点击启用声音" : muted ? "已静音" : "原声开启"}</div> : null}
    </div>
  );
}

export function resolvePreviewMediaUrl(previewUrl: string, candidate: string) {
  try {
    const base = new URL(previewUrl);
    const resolved = new URL(candidate, base);
    return resolved.origin === base.origin && ["http:", "https:"].includes(resolved.protocol) ? resolved.href : "";
  } catch { return ""; }
}

function formatPlaybackTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function LayerBox({ layer, scale, selected, onSelect, onDraft, onCommit }: {
  layer: EditableLayer;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onDraft: (patch: EditableLayerPatch) => void;
  onCommit: (patch: EditableLayerPatch) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({ x: layer.x, y: layer.y, width: layer.width, height: layer.height });
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState(layer.text ?? "");
  const [savingText, setSavingText] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const textDraftRef = useRef(layer.text ?? "");
  const originalTextRef = useRef(layer.text ?? "");
  const editingTextRef = useRef(false);
  const onDraftRef = useRef(onDraft);
  const interacting = useRef(false);
  onDraftRef.current = onDraft;
  useEffect(() => {
    if (!interacting.current) setDraft({ x: layer.x, y: layer.y, width: layer.width, height: layer.height });
  }, [layer.height, layer.width, layer.x, layer.y]);
  useEffect(() => {
    if (editingTextRef.current) return;
    const next = layer.text ?? "";
    originalTextRef.current = next;
    textDraftRef.current = next;
    setTextDraft(next);
  }, [layer.text]);
  useEffect(() => {
    if (!editingText) return;
    textAreaRef.current?.focus();
    textAreaRef.current?.select();
  }, [editingText]);
  useEffect(() => {
    if (selected || !editingTextRef.current) return;
    editingTextRef.current = false;
    setEditingText(false);
    setSavingText(false);
    textDraftRef.current = originalTextRef.current;
    setTextDraft(originalTextRef.current);
    onDraftRef.current({ text: originalTextRef.current });
  }, [selected]);
  useEffect(() => () => {
    if (editingTextRef.current) onDraftRef.current({ text: originalTextRef.current });
  }, []);
  const canMove = !layer.locked && layer.allowedEdits.includes("x") && layer.allowedEdits.includes("y");
  const canResize = !layer.locked && layer.allowedEdits.includes("width") && layer.allowedEdits.includes("height");
  const canEditText = !layer.locked && layer.allowedEdits.includes("text");
  const beginTextEdit = () => {
    if (!canEditText) return;
    onSelect();
    originalTextRef.current = layer.text ?? "";
    textDraftRef.current = layer.text ?? "";
    setTextDraft(layer.text ?? "");
    editingTextRef.current = true;
    setEditingText(true);
  };
  const cancelTextEdit = () => {
    editingTextRef.current = false;
    setEditingText(false);
    setSavingText(false);
    textDraftRef.current = originalTextRef.current;
    setTextDraft(originalTextRef.current);
    onDraft({ text: originalTextRef.current });
  };
  const saveTextEdit = async () => {
    if (savingText) return;
    const next = textDraftRef.current;
    if (!hasTextDraftChanged(originalTextRef.current, next)) {
      cancelTextEdit();
      return;
    }
    setSavingText(true);
    const saved = await onCommit({ text: next });
    setSavingText(false);
    if (!saved) return;
    originalTextRef.current = next;
    editingTextRef.current = false;
    setEditingText(false);
  };
  return (
    <Rnd
      bounds="parent"
      className={`artifact-layer-box ${selected ? "selected" : ""} ${layer.locked ? "locked" : ""} ${canEditText ? "text-editable" : ""} ${editingText ? "text-editing" : ""}`}
      disableDragging={!canMove || editingText}
      enableResizing={canResize && selected && !editingText}
      onClick={onSelect}
      onDoubleClick={(event: MouseEvent) => { event.stopPropagation(); beginTextEdit(); }}
      onDrag={(_event, data) => { setDraft((value) => ({ ...value, x: data.x, y: data.y })); onDraft({ x: data.x, y: data.y }); }}
      onDragStart={() => { interacting.current = true; onSelect(); }}
      onDragStop={(_event, data) => { interacting.current = false; setDraft((value) => ({ ...value, x: data.x, y: data.y })); onCommit({ x: Math.round(data.x), y: Math.round(data.y) }); }}
      onResize={(_event, _direction, element, _delta, position) => { const next = { x: position.x, y: position.y, width: element.offsetWidth, height: element.offsetHeight }; setDraft(next); onDraft(next); }}
      onResizeStart={() => { interacting.current = true; onSelect(); }}
      onResizeStop={(_event, _direction, element, _delta, position) => { interacting.current = false; setDraft({ x: position.x, y: position.y, width: element.offsetWidth, height: element.offsetHeight }); onCommit({
        x: Math.round(position.x),
        y: Math.round(position.y),
        width: Math.round(element.offsetWidth),
        height: Math.round(element.offsetHeight),
      }); }}
      position={{ x: draft.x, y: draft.y }}
      scale={scale}
      size={{ width: draft.width, height: draft.height }}
    >
      {editingText ? <div className="artifact-layer-inline-editor" onDoubleClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <textarea
          aria-label={`修改${layer.name ?? layer.id}文案`}
          disabled={savingText}
          onChange={(event) => { const next = event.target.value; textDraftRef.current = next; setTextDraft(next); onDraft({ text: next }); }}
          onKeyDown={(event) => {
            const key = { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, isComposing: event.nativeEvent.isComposing };
            if (isTextEditCancelShortcut(key)) { event.preventDefault(); cancelTextEdit(); }
            else if (isTextEditSaveShortcut(key)) { event.preventDefault(); void saveTextEdit(); }
          }}
          ref={textAreaRef}
          value={textDraft}
        />
        <div><span>Esc 取消 · Ctrl+Enter 保存</span><button disabled={savingText} onClick={cancelTextEdit} type="button">取消</button><button className="primary" disabled={savingText} onClick={() => void saveTextEdit()} type="button">{savingText ? "保存中…" : "保存"}</button></div>
      </div> : <><span>{layer.name ?? layer.id}</span>{canEditText && selected ? <small>双击修改文字</small> : null}</>}
    </Rnd>
  );
}
