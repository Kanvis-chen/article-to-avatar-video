import {
  Captions,
  Check,
  ChevronLeft,
  CircleAlert,
  FileVideo,
  Folder,
  LoaderCircle,
  Redo2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { EditableLayerPatch, EditableParameter, EditableParameterValue } from "@visualhyper/core";

import {
  deleteArtifactLayer,
  getArtifact,
  isMcpSession,
  redoArtifactEdit,
  splitArtifactLayer,
  startPreview,
  undoArtifactEdit,
  updateArtifactParameter,
  updateArtifactLayer,
  type ResolvedArtifactClient,
} from "../api";
import { useEditorStore } from "../store";
import { ArtifactCanvas, type LayerPreviewDraft } from "./ArtifactCanvas";
import { ArtifactInspector } from "./ArtifactInspector";
import { ArtifactTimeline } from "./ArtifactTimeline";
import { editorShortcutAction } from "./keyboard-shortcuts";

const modeLabels = { animation: "纯动画视频", avatar: "动画 + 数字人", footage: "动画 + 真人素材" } as const;
const statusLabels = { "building": "正在制作", "preview-ready": "可以预览", "rendering": "正在渲染", "rendered": "已完成", "failed": "制作失败" } as const;

export function EditorShell() {
  const setMode = useEditorStore((state) => state.setMode);
  const [resolved, setResolved] = useState<ResolvedArtifactClient | null>(null);
  const resolvedRef = useRef<ResolvedArtifactClient | null>(null);
  const commitQueue = useRef<Promise<void>>(Promise.resolve());
  const previewAttempted = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [currentFrame, setCurrentFrame] = useState(0);
  const currentFrameRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<LayerPreviewDraft | null>(null);
  const previewDraftSequence = useRef(0);
  currentFrameRef.current = currentFrame;

  async function refresh() {
    try {
      const next = await getArtifact();
      resolvedRef.current = next;
      setResolved(next);
      setSelectedLayerId((current) => next?.artifact.editableLayers.some((layer) => layer.id === current && !layer.deleted)
        ? current
        : next?.artifact.editableLayers.find((layer) => !layer.deleted)?.id ?? "");
      setError("");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "视频项目加载失败"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(".artifact-parameter-panel,.artifact-layer-inline-editor")) return;
      void refresh();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (document.activeElement?.matches("input,textarea,select,[contenteditable='true']")) return;
      const action = editorShortcutAction(event);
      if (action === "undo" || action === "redo") {
        event.preventDefault();
        void history(action);
        return;
      }
      if (action === "toggle-playback") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const videoOutputIndex = useMemo(() => resolved?.artifact.outputs.findIndex((output) => output.kind === "video") ?? -1, [resolved]);

  function commit(parameter: EditableParameter, value: EditableParameterValue) {
    commitQueue.current = commitQueue.current.then(async () => {
      const current = resolvedRef.current;
      const latestParameter = current?.artifact.capabilities.editableParameters.find((item) => item.id === parameter.id);
      if (!current || !latestParameter || Object.is(latestParameter.value, value)) return;
      try {
        const next = await updateArtifactParameter(current.artifact.editRevision, parameter.id, value);
        resolvedRef.current = next;
        setResolved(next);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "参数保存失败");
        await refresh();
      }
    });
  }

  function commitLayer(layerId: string, patch: EditableLayerPatch): Promise<boolean> {
    let saved = false;
    const queued = commitQueue.current.then(async () => {
      const current = resolvedRef.current;
      if (!current) return;
      try {
        const next = await updateArtifactLayer(current.artifact.editRevision, layerId, patch);
        resolvedRef.current = next;
        setResolved(next);
        setError("");
        saved = true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "图层保存失败");
        await refresh();
      }
    });
    commitQueue.current = queued;
    return queued.then(() => saved);
  }

  function previewLayerDraft(layerId: string, patch: EditableLayerPatch) {
    previewDraftSequence.current += 1;
    setPreviewDraft({ sequence: previewDraftSequence.current, layerId, patch });
  }

  function splitLayer(layerId: string, splitFrame: number): Promise<boolean> {
    let saved = false;
    const queued = commitQueue.current.then(async () => {
      const current = resolvedRef.current;
      if (!current) return;
      try {
        const previousIds = new Set(current.artifact.editableLayers.map((layer) => layer.id));
        const next = await splitArtifactLayer(current.artifact.editRevision, layerId, splitFrame);
        const rightLayer = next.artifact.editableLayers.find((layer) => !previousIds.has(layer.id) && layer.startFrame === splitFrame);
        resolvedRef.current = next;
        setResolved(next);
        setSelectedLayerId(rightLayer?.id ?? layerId);
        setError("");
        saved = true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "片段分割失败");
        await refresh();
      }
    });
    commitQueue.current = queued;
    return queued.then(() => saved);
  }

  function deleteLayer(layerId: string): Promise<boolean> {
    let saved = false;
    const queued = commitQueue.current.then(async () => {
      const current = resolvedRef.current;
      if (!current) return;
      try {
        const next = await deleteArtifactLayer(current.artifact.editRevision, layerId);
        const candidates = next.artifact.editableLayers.filter((layer) => !layer.deleted);
        const nextSelection = candidates.find((layer) => currentFrameRef.current >= layer.startFrame && currentFrameRef.current < layer.startFrame + layer.durationFrames)
          ?? candidates.find((layer) => layer.startFrame >= currentFrameRef.current)
          ?? candidates.at(-1);
        resolvedRef.current = next;
        setResolved(next);
        setSelectedLayerId(nextSelection?.id ?? "");
        setError("");
        saved = true;
        window.dispatchEvent(new Event("kanvis:artifact-changed"));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "片段删除失败");
        await refresh();
      }
    });
    commitQueue.current = queued;
    return queued.then(() => saved);
  }

  async function history(direction: "undo" | "redo") {
    try {
      const next = direction === "undo" ? await undoArtifactEdit() : await redoArtifactEdit();
      resolvedRef.current = next;
      setResolved(next);
      setSelectedLayerId((current) => next.artifact.editableLayers.some((layer) => layer.id === current && !layer.deleted)
        ? current
        : next.artifact.editableLayers.find((layer) => !layer.deleted && currentFrameRef.current >= layer.startFrame && currentFrameRef.current < layer.startFrame + layer.durationFrames)?.id
          ?? next.artifact.editableLayers.find((layer) => !layer.deleted)?.id
          ?? "");
      setError("");
      window.dispatchEvent(new Event("kanvis:artifact-changed"));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "历史操作失败"); }
  }
  useEffect(() => {
    const onHistory = (event: Event) => {
      const direction = (event as CustomEvent<"undo" | "redo">).detail;
      if (direction === "undo" || direction === "redo") void history(direction);
    };
    window.addEventListener("kanvis:artifact-history", onHistory);
    return () => window.removeEventListener("kanvis:artifact-history", onHistory);
  }, []);

  async function openPreview() {
    setPreviewing(true);
    try { setPreviewUrl((await startPreview()).url); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "实时预览启动失败"); }
    finally { setPreviewing(false); }
  }
  useEffect(() => {
    if (previewAttempted.current || !resolved?.artifact.editableLayers.length || !resolved.artifact.capabilities.preview || isMcpSession()) return;
    previewAttempted.current = true;
    void openPreview();
  }, [resolved]);

  if (loading) return <main className="artifact-workbench-state"><LoaderCircle className="spin" size={24} />正在打开视频工作台…</main>;
  if (!resolved) return <main className="artifact-workbench-state"><FileVideo size={28} /><strong>还没有可以编辑的视频项目</strong><span>先在创作中心选择一种制作方式并开始制作。</span><button onClick={() => setMode("wizard")} type="button"><ChevronLeft size={14} />返回创作中心</button>{error ? <em>{error}</em> : null}</main>;

  const artifact = resolved.artifact;
  const visibleLayers = artifact.editableLayers.filter((layer) => !layer.deleted);
  const selectedLayer = visibleLayers.find((layer) => layer.id === selectedLayerId);
  const videoSrc = videoOutputIndex >= 0 && !isMcpSession() ? `/api/artifact-output?index=${videoOutputIndex}` : null;
  return (
    <main className={`artifact-workbench ${visibleLayers.length ? "has-layer-editor" : ""}`}>
      <aside className="artifact-browser panel-surface">
        <div className="workbench-panel-heading"><span>视频项目</span><button aria-label="刷新视频项目" onClick={() => void refresh()} type="button"><RefreshCw size={13} /></button></div>
        <div className="artifact-browser-card active"><span><FileVideo size={17} /></span><div><strong>{artifact.artifactId}</strong><small>{modeLabels[artifact.mode]}</small><em className={`artifact-status status-${artifact.status}`}>{artifact.status === "failed" ? <CircleAlert size={10} /> : <Check size={10} />}{statusLabels[artifact.status]}</em></div></div>
        <section className="artifact-browser-section"><label>项目信息</label><div><span>制作流程</span><strong>{artifact.workflowId}</strong></div><div><span>源 revision</span><strong>{artifact.sourceRevision}</strong></div><div><span>编辑 revision</span><strong>{artifact.editRevision}</strong></div><div><span>Composition</span><strong>{artifact.compositionId ?? "未声明"}</strong></div></section>
        <section className="artifact-browser-section"><label>输出文件</label>{artifact.outputs.length ? artifact.outputs.map((output, index) => <div key={`${output.kind}-${index}`}><span>{output.kind === "captions" ? <Captions size={12} /> : output.kind === "video" ? <FileVideo size={12} /> : <Folder size={12} />}{output.kind}</span><strong>{output.relativePath.split(/[\\/]/).at(-1)}</strong></div>) : <p>还没有输出文件</p>}</section>
      </aside>

      <section className="artifact-preview-column">
        <div className="artifact-preview-toolbar"><div><strong>视频预览</strong><small>{artifact.engine} · {artifact.compositionId ?? "等待 composition"}</small></div><span>{statusLabels[artifact.status]}</span></div>
        <div className="artifact-preview-well">
          {visibleLayers.length ? <ArtifactCanvas artifact={artifact} videoSrc={videoSrc} previewUrl={previewUrl} selectedLayerId={selectedLayerId} onSelect={setSelectedLayerId} onCommit={commitLayer} currentFrame={currentFrame} playing={playing} previewDraft={previewDraft} onTimeChange={setCurrentFrame} onPlayingChange={setPlaying} /> : videoSrc ? <video controls preload="metadata" src={videoSrc} /> : (
            <div className="artifact-preview-placeholder"><span><FileVideo size={28} /></span><strong>{artifact.status === "rendered" ? "视频已经生成" : artifact.status === "preview-ready" ? "项目已准备好预览" : statusLabels[artifact.status]}</strong><p>{isMcpSession() ? "Codex 内嵌播放器资源桥将在视频输出验证后显示；当前可继续调整声明参数和导出。" : "完成导出后将在这里播放 MP4。"}</p>{artifact.error ? <em>{artifact.error.message}<br />{artifact.error.recovery}</em> : null}</div>
          )}
        </div>
        <div className="artifact-preview-footer"><span>项目源保持 HyperFrames 原生格式</span>{!isMcpSession() && artifact.capabilities.preview ? <button disabled={previewing} onClick={() => previewUrl ? setPreviewUrl("") : void openPreview()} type="button">{previewing ? "启动中…" : previewUrl ? "切换成片播放" : "启动实时特效预览"}</button> : <span>参数修改不消耗 AI 额度</span>}</div>
      </section>

      <aside className="artifact-parameter-panel panel-surface">
        <div className="workbench-panel-heading"><span>{visibleLayers.length ? "图层属性" : "快速调整"}</span><div><button aria-label="撤销参数修改" disabled={!artifact.history.length} onClick={() => void history("undo")} title="撤销（Ctrl+Z）" type="button"><Undo2 size={13} /></button><button aria-label="重做参数修改" disabled={!artifact.redoStack.length} onClick={() => void history("redo")} title="重做（Ctrl+Shift+Z / Ctrl+Y）" type="button"><Redo2 size={13} /></button></div></div>
        <div className="artifact-parameter-scroll">
          {visibleLayers.length ? <ArtifactInspector artifact={artifact} key={selectedLayer?.id ?? "no-layer"} layer={selectedLayer} onDraft={previewLayerDraft} onCommit={commitLayer} /> : artifact.capabilities.editableParameters.length ? artifact.capabilities.editableParameters.map((parameter) => <ParameterControl key={parameter.id} parameter={parameter} onCommit={(value) => commit(parameter, value)} />) : <div className="artifact-no-parameters"><SlidersHorizontal size={24} /><strong>这个项目没有声明可编辑参数</strong><span>Kanvis 不会猜测或反向解析引擎源码。</span></div>}
          {error ? <div className="artifact-edit-error"><CircleAlert size={13} />{error}</div> : null}
        </div>
        <div className="artifact-parameter-note"><RotateCcw size={12} />所有修改都有独立 revision，可撤销和重做。</div>
      </aside>
      {visibleLayers.length ? <ArtifactTimeline artifact={artifact} selectedLayerId={selectedLayerId} currentFrame={currentFrame} onSelect={setSelectedLayerId} onSeek={(frame) => { setPlaying(false); setCurrentFrame(frame); }} onCommit={commitLayer} onSplit={splitLayer} onDelete={deleteLayer} /> : null}
    </main>
  );
}

function ParameterControl({ parameter, onCommit }: { parameter: EditableParameter; onCommit: (value: EditableParameterValue) => void }) {
  const [value, setValue] = useState<EditableParameterValue>(parameter.value);
  const latestValue = useRef<EditableParameterValue>(parameter.value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setValue(parameter.value); latestValue.current = parameter.value; }, [parameter.value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const setDraft = (next: EditableParameterValue) => { latestValue.current = next; setValue(next); };
  const scheduleTextCommit = (next: string) => { setDraft(next); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { timer.current = null; onCommit(next); }, 400); };
  const flushTextCommit = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; onCommit(latestValue.current); };
  return <div className="artifact-parameter-control"><label htmlFor={`parameter-${parameter.id}`}><span>{parameter.label}</span><small>{parameter.type}</small></label>{parameter.description ? <p>{parameter.description}</p> : null}{parameter.type === "text" ? <textarea id={`parameter-${parameter.id}`} maxLength={parameter.maxLength} onBlur={flushTextCommit} onChange={(event) => scheduleTextCommit(event.target.value)} value={String(value)} /> : parameter.type === "number" ? <div className="artifact-range"><input id={`parameter-${parameter.id}`} max={parameter.max} min={parameter.min} onChange={(event) => setDraft(Number(event.target.value))} onPointerUp={() => onCommit(latestValue.current)} step={parameter.step} type="range" value={Number(value)} /><output>{Number(value)}</output></div> : parameter.type === "boolean" ? <label className="artifact-switch"><input checked={Boolean(value)} id={`parameter-${parameter.id}`} onChange={(event) => { setDraft(event.target.checked); onCommit(event.target.checked); }} type="checkbox" /><span />{Boolean(value) ? "开启" : "关闭"}</label> : parameter.type === "select" ? <select id={`parameter-${parameter.id}`} onChange={(event) => { setDraft(event.target.value); onCommit(event.target.value); }} value={String(value)}>{parameter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <div className="path-input"><Folder size={14} /><input id={`parameter-${parameter.id}`} onBlur={() => onCommit(value)} onChange={(event) => setDraft(event.target.value || null)} placeholder="选择项目内素材" value={typeof value === "string" ? value : ""} /></div>}</div>;
}
