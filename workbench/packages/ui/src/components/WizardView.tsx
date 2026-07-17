import {
  ArrowRight,
  Captions,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  Film,
  FolderOpen,
  Library,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  UserRound,
  Video,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  type CreationMode,
  type StyleSkillSummary,
  type WorkflowInputValues,
} from "@visualhyper/core";

import {
  getArtifact,
  importStyleSkill,
  isMcpSession,
  listStyleSkills,
  prepareWorkflow,
  sendMessageToCodex,
  type ResolvedArtifactClient,
} from "../api";
import { useEditorStore } from "../store";
import { validateStyleSkillValues } from "../styleSkillUi";

type LaunchView = "home" | "create" | "use";

const modes: Array<{ id: CreationMode; title: string; description: string; icon: typeof Sparkles }> = [
  { id: "animation", title: "纯动画视频", description: "没有真人素材，从文字直接生成动态画面。", icon: Sparkles },
  { id: "avatar", title: "动画 + 数字人", description: "使用数字人完成讲解、配音与画面出镜。", icon: UserRound },
  { id: "footage", title: "动画 + 真人素材", description: "为已经拍好的真人视频增加动画包装。", icon: Video },
];

const artifactLabels = {
  "building": "正在制作",
  "preview-ready": "可以预览",
  "rendering": "正在渲染",
  "rendered": "已完成",
  "failed": "制作失败",
} as const;

export function WizardView() {
  const openWorkbench = useEditorStore((store) => store.setMode);
  const [mode, setMode] = useState<CreationMode>("animation");
  const [styleSkills, setStyleSkills] = useState<StyleSkillSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState<WorkflowInputValues>({});
  const [artifact, setArtifact] = useState<ResolvedArtifactClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [launchView, setLaunchView] = useState<LaunchView>("home");
  const [showSkillImport, setShowSkillImport] = useState(false);
  const [skillPath, setSkillPath] = useState("");
  const [importingSkill, setImportingSkill] = useState(false);
  const [skillImportMessage, setSkillImportMessage] = useState("");

  const matchingSkills = useMemo(() => styleSkills.filter((entry) => entry.materialTypes.includes(mode)), [mode, styleSkills]);
  const selected = useMemo(
    () => matchingSkills.find((entry) => entry.id === selectedId && entry.availability.available)
      ?? matchingSkills.find((entry) => entry.availability.available)
      ?? matchingSkills[0],
    [matchingSkills, selectedId],
  );
  const errors = selected ? validateStyleSkillValues(selected, values) : ["当前素材类型没有可用风格。"];
  const canSubmit = Boolean(selected?.availability.available) && errors.length === 0 && state !== "sending" && isMcpSession();

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [nextSkills, nextArtifact] = await Promise.all([listStyleSkills(), getArtifact()]);
      setStyleSkills(nextSkills);
      setArtifact(nextArtifact);
      setMessage((current) => state === "error" ? "" : current);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Kanvis 项目数据加载失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void getArtifact().then(setArtifact).catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const first = styleSkills.find((entry) => entry.materialTypes.includes(mode) && entry.availability.available)
      ?? styleSkills.find((entry) => entry.materialTypes.includes(mode));
    const currentStillExists = styleSkills.some((entry) => entry.id === selectedId && entry.materialTypes.includes(mode));
    if (!currentStillExists) {
      setSelectedId(first?.id ?? "");
      setValues({});
      setState("idle");
      setMessage("");
    }
  }, [mode, styleSkills]);

  async function importLocalSkill(event: FormEvent) {
    event.preventDefault();
    if (!skillPath.trim() || importingSkill) return;
    setImportingSkill(true);
    setSkillImportMessage("");
    try {
      const imported = await importStyleSkill(skillPath.trim(), mode);
      const nextSkills = await listStyleSkills();
      setStyleSkills(nextSkills);
      setSelectedId(imported.id);
      setShowSkillImport(false);
      setSkillImportMessage(`已导入「${imported.name}」，现在可以直接使用。`);
    } catch (error) {
      setSkillImportMessage(error instanceof Error ? error.message : "本地 Style Skill 导入失败。");
    } finally {
      setImportingSkill(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canSubmit) return;
    setState("sending");
    setMessage("");
    try {
      const prompt = await prepareWorkflow(selected.workflowId, values);
      await sendMessageToCodex(prompt);
      setState("sent");
      setMessage("已经开始制作。视频项目生成后会自动出现在下方。");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "任务发送失败，请稍后重试。");
    }
  }

  return (
    <main className="launchpad kanvis-launchpad">
      <section className="launchpad-hero">
        <div>
          <span className="eyebrow"><WandSparkles size={14} /> Kanvis 创作中心</span>
          <h1>让好风格，可以反复使用。</h1>
          <p>调用已有风格制作视频，或学习、定制一个新风格。</p>
        </div>
        <div className="hero-status">
          <span className={`status-beacon ${isMcpSession() ? "online" : ""}`} />
          <div><strong>{isMcpSession() ? "可以开始创作" : "Web 调试模式"}</strong><small>{isMcpSession() ? "AI 制作引擎已就绪" : "请从 Codex 内打开以开始制作"}</small></div>
        </div>
      </section>

      {launchView === "home" ? (
        <section className="intent-grid">
          <button className="intent-card primary" onClick={() => setLaunchView("use")} type="button"><span><Library size={24} /></span><div><strong>使用已有风格制作</strong><small>选择本地风格，添加素材并开始制作</small></div><ArrowRight size={18} /></button>
          <button className="intent-card" onClick={() => setLaunchView("create")} type="button"><span><WandSparkles size={24} /></span><div><strong>导入一个新风格</strong><small>从本地 Skill 文件夹添加可复用视频风格</small></div><ArrowRight size={18} /></button>
        </section>
      ) : null}

      {launchView === "create" ? (
        <section className="style-center">
          <div className="style-center-head"><button onClick={() => setLaunchView("home")} type="button">← 返回</button><div><span className="eyebrow"><WandSparkles size={13} /> 本地风格</span><h2>导入 Style Skill</h2><p>选择本地 Skill 文件夹，将可复用风格注册到当前项目。</p></div></div>
          <div className="service-grid">
            <ServiceCard icon={Upload} title="导入本地 Skill" description="从本机文件夹读取 SKILL.md，注册后即可用于视频项目。" action="开始导入" enabled onClick={() => { setLaunchView("use"); setShowSkillImport(true); }} featured />
          </div>
          {message ? <div className="submit-message error"><CircleAlert size={15} />{message}</div> : null}
        </section>
      ) : null}

      {launchView === "use" ? <><section className="creation-mode-section">
        <button className="back-link" onClick={() => setLaunchView("home")} type="button">← 返回首页</button>
        <div className="creation-section-title"><span>01</span><div><strong>选择制作方式</strong><small>三种方式共用同一个视频工作台</small></div></div>
        <div className="creation-mode-grid">
          {modes.map((item) => {
            const Icon = item.icon;
            const available = styleSkills.some((entry) => entry.materialTypes.includes(item.id));
            return (
              <button className={`creation-mode-card ${mode === item.id ? "active" : ""}`} key={item.id} onClick={() => setMode(item.id)} type="button">
                <span className="creation-mode-icon"><Icon size={20} /></span>
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
                <i>{mode === item.id ? <Check size={11} /> : available ? "" : "!"}</i>
              </button>
            );
          })}
        </div>
      </section>

      <div className="launchpad-grid kanvis-input-grid">
        <section className="workflow-library">
          <div className="section-heading">
            <div><span>02</span><div><strong>选择风格</strong><small>{modes.find((item) => item.id === mode)?.title}</small></div></div>
            <div className="section-heading-actions"><button onClick={() => { setShowSkillImport((value) => !value); setSkillImportMessage(""); }} type="button"><Upload size={14} /> 导入本地 Skill</button><button onClick={() => void refresh()} type="button"><RefreshCw size={14} /> 刷新</button></div>
          </div>
          {showSkillImport ? <form className="skill-import-panel" onSubmit={importLocalSkill}>
            <label htmlFor="local-skill-path">Style Skill 文件夹</label>
            <div className="skill-import-row"><div className="path-input"><FolderOpen size={15} /><input autoFocus id="local-skill-path" onChange={(event) => setSkillPath(event.target.value)} placeholder="例如 E:\\视频Skills\\my-style-skill" value={skillPath} /></div><button disabled={!skillPath.trim() || importingSkill} type="submit">{importingSkill ? "导入中…" : "导入"}</button></div>
            <small>读取该目录下的 SKILL.md 并注册到当前项目；导入时不会执行其中的脚本。当前归类：{modes.find((item) => item.id === mode)?.title}</small>
          </form> : null}
          {skillImportMessage ? <div className={`skill-import-message ${skillImportMessage.startsWith("已导入") ? "success" : "error"}`}>{skillImportMessage}</div> : null}
          <div className="workflow-list">
            {loading ? <div className="workflow-loading"><LoaderCircle className="spin" size={18} /> 正在读取项目流程…</div> : null}
            {!loading && matchingSkills.length === 0 ? <div className="missing-workflow"><CircleAlert size={22} /><strong>还没有可用风格</strong><p>请先安装或导入适合该素材类型的风格 Skill。</p></div> : null}
            {matchingSkills.map((skill) => (
              <button className={`workflow-list-card ${selected?.id === skill.id ? "selected" : ""}`} disabled={!skill.availability.available} key={skill.id} onClick={() => { setSelectedId(skill.id); setValues({}); }} type="button">
                <span className="workflow-list-icon"><Film size={19} /></span>
                <span className="workflow-list-copy"><span><strong>{skill.name}</strong><i className={skill.availability.available ? "" : "muted"}>{skill.availability.available ? <Check size={10} /> : <CircleAlert size={10} />} {skill.availability.available ? skill.sourceLabel : "未配置"}</i></span><small>{skill.description}</small><em><Sparkles size={11} /> {skill.availability.message}<b>v{skill.version}</b></em></span>
              </button>
            ))}
          </div>
          <div className="library-note"><FileText size={15} /><span>风格来自当前项目和已安装 Skill</span></div>
        </section>

        <form className="workflow-form" onSubmit={submit}>
          <div className="section-heading"><div><span>03</span><div><strong>提供制作内容</strong><small>{selected?.name ?? "等待选择风格"}</small></div></div><span className="engine-badge"><span /> 项目本地</span></div>
          <div className="form-body dynamic-workflow-form">
            {selected?.inputs.map((input) => {
              const value = values[input.id];
              if (input.type === "text") return (
                <div className="dynamic-field" key={input.id}><label htmlFor={`input-${input.id}`}>{input.label}{input.required ? <span>必填</span> : <small>可选</small>}</label>{input.multiline ? <textarea id={`input-${input.id}`} maxLength={input.maxLength} onChange={(event) => setValues((current) => ({ ...current, [input.id]: event.target.value }))} placeholder={input.placeholder ?? "描述你希望制作的视频内容"} value={typeof value === "string" ? value : ""} /> : <input className="workflow-text-input" id={`input-${input.id}`} maxLength={input.maxLength} onChange={(event) => setValues((current) => ({ ...current, [input.id]: event.target.value }))} placeholder={input.placeholder ?? `输入${input.label}`} value={typeof value === "string" ? value : ""} />}<div className="field-meta"><span>内容仅在点击开始制作后发送</span><span>{typeof value === "string" ? value.length : 0} / {input.maxLength}</span></div></div>
              );
              if (input.type === "select") return (
                <div className="dynamic-field" key={input.id}><label htmlFor={`input-${input.id}`}>{input.label}{input.required ? <span>必填</span> : <small>可选</small>}</label><select id={`input-${input.id}`} onChange={(event) => setValues((current) => ({ ...current, [input.id]: event.target.value }))} value={typeof value === "string" ? value : ""}><option value="">请选择</option>{input.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              );
              return (
                <div className="dynamic-field" key={input.id}><label htmlFor={`input-${input.id}`}>{input.label}{input.required ? <span>必填</span> : <small>可选</small>}</label><div className="path-input"><FolderOpen size={16} /><input id={`input-${input.id}`} onChange={(event) => setValues((current) => ({ ...current, [input.id]: input.multiple ? event.target.value.split(/\r?\n/).filter(Boolean) : event.target.value }))} placeholder={mode === "footage" ? "粘贴项目内真人视频路径" : mode === "avatar" ? "粘贴数字人视频路径" : "粘贴素材路径；多个路径请换行"} value={Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : ""} /></div><p className="field-help"><Upload size={11} /> 支持 {input.accepts.join("、")}；媒体不会进入项目 JSON。</p></div>
              );
            })}
            {message ? <div className={`submit-message ${state}`}><span>{state === "sent" ? <Check size={15} /> : <CircleAlert size={15} />}</span>{message}</div> : null}
            {!isMcpSession() ? <div className="submit-message error"><CircleAlert size={15} />Web 面板只用于调试。请从 Codex 内打开 Kanvis 以开始制作。</div> : null}
            <div className="form-submit-row"><span><Sparkles size={13} /> 普通设置不会调用 AI</span><button disabled={!canSubmit} type="submit">{state === "sending" ? <><LoaderCircle className="spin" size={15} /> 正在启动</> : <>开始制作 <ArrowRight size={15} /></>}</button></div>
          </div>
        </form>
      </div></> : null}

      <section className="recent-artifact">
        <div className="section-heading compact"><div><span>04</span><div><strong>最近视频项目</strong><small>生成、预览和导出状态会自动更新</small></div></div><button onClick={() => void getArtifact().then(setArtifact)} type="button">刷新状态</button></div>
        {artifact ? (
          <div className={`artifact-summary status-${artifact.artifact.status}`}><span className="artifact-summary-icon">{artifact.artifact.status === "failed" ? <CircleAlert size={20} /> : artifact.artifact.status === "rendered" ? <Check size={20} /> : <Film size={20} />}</span><div><strong>{artifact.artifact.artifactId}</strong><small>{artifactLabels[artifact.artifact.status]} · {modes.find((item) => item.id === artifact.artifact.mode)?.title} · revision {artifact.artifact.sourceRevision}</small>{artifact.artifact.error ? <em>{artifact.artifact.error.message}{artifact.artifact.error.recovery ? ` · ${artifact.artifact.error.recovery}` : ""}</em> : null}</div><div className="artifact-actions"><button onClick={() => openWorkbench("editor")} type="button"><Play size={13} /> 打开工作台</button></div></div>
        ) : (
          <div className="artifact-empty"><span><FileText size={20} /></span><div><strong>还没有视频项目</strong><small>开始制作后，Kanvis 会自动发现生成结果</small></div><div className="artifact-steps"><span><Clock3 size={12} /> 制作</span><i /><span><Play size={12} /> 预览</span><i /><span><Captions size={12} /> 微调</span><i /><span><Film size={12} /> 导出</span></div></div>
        )}
      </section>
    </main>
  );
}

function ServiceCard({ icon: Icon, title, description, action, enabled, onClick, featured = false }: { icon: typeof Sparkles; title: string; description: string; action: string; enabled: boolean; onClick: () => void; featured?: boolean }) {
  return <article className={`service-card ${featured ? "featured" : ""}`}><span><Icon size={21} /></span><div><strong>{title}</strong><p>{description}</p></div><button disabled={!enabled} onClick={onClick} type="button">{enabled ? action : "即将开放"} <ArrowRight size={13} /></button></article>;
}
