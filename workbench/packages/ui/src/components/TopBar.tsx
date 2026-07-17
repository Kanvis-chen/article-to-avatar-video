import { ChevronDown, Cloud, FileVideo2, FolderOpen, LoaderCircle, PanelLeft, Redo2, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { cancelRender, getArtifact, openExistingProject, startRender } from "../api";
import { useEditorStore } from "../store";

export function TopBar() {
  const { project, mode, connection, connectionMessage, setMode, undo, redo, load } = useEditorStore();
  const [renderable, setRenderable] = useState(false);
  const [artifactHistory, setArtifactHistory] = useState({ undo: false, redo: false });
  const [renderError, setRenderError] = useState("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [openingProject, setOpeningProject] = useState(false);
  const [projectOpenMessage, setProjectOpenMessage] = useState("");
  const activeRender = useMemo(() => [...project.jobs].reverse().find((job) => job.type === "render" && ["queued", "running"].includes(job.status)), [project.jobs]);

  useEffect(() => {
    const refresh = () => void getArtifact().then((result) => {
      setRenderable(Boolean(result?.artifact.capabilities.render && ["preview-ready", "rendered", "failed"].includes(result.artifact.status)));
      setArtifactHistory({ undo: Boolean(result?.artifact.history.length), redo: Boolean(result?.artifact.redoStack.length) });
    }).catch(() => { setRenderable(false); setArtifactHistory({ undo: false, redo: false }); });
    refresh();
    const timer = window.setInterval(refresh, 2_000);
    window.addEventListener("kanvis:artifact-changed", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("kanvis:artifact-changed", refresh); };
  }, [project.revision]);

  async function handleRender() {
    setRenderError("");
    try {
      if (activeRender) await cancelRender(activeRender.id);
      else await startRender("high");
      await load(true);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "渲染操作失败");
    }
  }

  async function handleOpenProject(event: FormEvent) {
    event.preventDefault();
    if (!projectPath.trim() || openingProject) return;
    setOpeningProject(true);
    setProjectOpenMessage("");
    try {
      const result = await openExistingProject(projectPath.trim());
      if (result.url) window.location.assign(result.url);
      else setProjectOpenMessage("已交给 Codex 打开该工程；当前项目不会被覆盖。");
    } catch (error) {
      setProjectOpenMessage(error instanceof Error ? error.message : "工程打开失败。");
    } finally {
      setOpeningProject(false);
    }
  }

  return (
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><FileVideo2 size={18} strokeWidth={2.4} /></div><span className="brand-name">KANVIS</span><span className="phase-chip">AI VIDEO STUDIO</span></div>
      <button aria-expanded={projectMenuOpen} className="project-switcher" onClick={() => setProjectMenuOpen((value) => !value)} type="button"><span>{project.metadata.title}</span><ChevronDown size={14} /></button>
      {projectMenuOpen ? <form className="project-open-menu" onSubmit={handleOpenProject}>
        <div><FolderOpen size={16} /><span><strong>打开已有 Kanvis 工程</strong><small>完整工程目录可无损继续编辑</small></span></div>
        <label htmlFor="project-directory">工程文件夹路径</label>
        <input autoFocus id="project-directory" onChange={(event) => setProjectPath(event.target.value)} placeholder="例如 D:\\视频项目\\我的工程" value={projectPath} />
        <button disabled={!projectPath.trim() || openingProject} type="submit">{openingProject ? "正在打开…" : "打开工程"}</button>
        <p><b>完整工程目录</b>：保留字幕、特效、轨道与撤销历史。<br /><b>只有 MP4</b>：请作为视频素材导入，无法恢复原图层。</p>
        {projectOpenMessage ? <em>{projectOpenMessage}</em> : null}
      </form> : null}
      <div className="topbar-spacer" />
      <div className={`connection-pill ${renderError ? "error" : connection}`}><Cloud size={13} /><span>{renderError || (activeRender ? `${activeRender.message} · ${Math.round(activeRender.progress * 100)}%` : connectionMessage)}</span></div>
      <div className="segmented-control" aria-label="视图模式"><button className={mode === "wizard" ? "active" : ""} onClick={() => setMode("wizard")} type="button"><Sparkles size={14} />创作中心</button><button className={mode === "editor" ? "active" : ""} onClick={() => setMode("editor")} type="button"><PanelLeft size={14} />视频工作台</button></div>
      <div className="history-actions"><button aria-label={mode === "editor" ? "撤销特效修改" : "撤销"} disabled={mode === "editor" && !artifactHistory.undo} onClick={() => mode === "editor" ? window.dispatchEvent(new CustomEvent("kanvis:artifact-history", { detail: "undo" })) : void undo()} title="撤销（Ctrl+Z）" type="button"><Undo2 size={16} /></button><button aria-label={mode === "editor" ? "重做特效修改" : "重做"} disabled={mode === "editor" && !artifactHistory.redo} onClick={() => mode === "editor" ? window.dispatchEvent(new CustomEvent("kanvis:artifact-history", { detail: "redo" })) : void redo()} title="重做（Ctrl+Shift+Z / Ctrl+Y）" type="button"><Redo2 size={16} /></button></div>
      <button className={`export-button ${activeRender ? "rendering" : ""}`} disabled={!activeRender && !renderable} onClick={() => void handleRender()} type="button">{activeRender ? <><LoaderCircle className="spin" size={13} /> 取消</> : <>导出视频 <span>MP4</span></>}</button>
    </header>
  );
}
