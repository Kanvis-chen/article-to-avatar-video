import { AlignCenter, AlignLeft, AlignRight, Bot, ChevronDown, Lock, Move, Palette, RotateCw, Scale, Sparkles } from "lucide-react";
import { useState } from "react";

import * as api from "../api";
import { useEditorStore } from "../store";

function NumberControl({ label, value, min, max, step = 1, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-control">
      <span>{label}</span>
      <input min={min} max={max} step={step} type="number" value={Number(value.toFixed(step < 1 ? 2 : 0))} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function Inspector() {
  const { project, selectedSceneId, selectedElementId, commit } = useEditorStore();
  const [prompt, setPrompt] = useState("");
  const [assistantState, setAssistantState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const scene = project.scenes.find((item) => item.id === selectedSceneId);
  const element = scene?.elements.find((item) => item.id === selectedElementId);
  const updateTransform = (patch: Record<string, number>) => element
    ? void commit([{ type: "element.updateTransform", elementId: element.id, patch }], "调整元素属性")
    : undefined;
  const sendToCodex = async () => {
    const request = prompt.trim();
    if (!request || !api.isMcpSession()) return;
    setAssistantState("sending");
    try {
      await api.sendMessageToCodex(`当前选择场景 ${scene?.id ?? "无"}，元素 ${element?.id ?? "无"}。${request}`);
      setPrompt("");
      setAssistantState("sent");
    } catch {
      setAssistantState("error");
    }
  };

  return (
    <aside className="inspector panel-surface">
      <div className="inspector-heading"><div><span>属性检查器</span><small>{element?.name ?? "未选择元素"}</small></div><ChevronDown size={15} /></div>
      {element ? (
        <div className="inspector-scroll">
          <section className="inspector-section">
            <div className="inspector-section-title"><Move size={14} /><span>变换</span><Lock size={12} /></div>
            <div className="control-grid">
              <NumberControl label="X" value={element.x} min={-2000} max={3000} onChange={(x) => updateTransform({ x })} />
              <NumberControl label="Y" value={element.y} min={-2000} max={4000} onChange={(y) => updateTransform({ y })} />
              <NumberControl label="W" value={element.width} min={1} max={4000} onChange={(width) => updateTransform({ width })} />
              <NumberControl label="H" value={element.height} min={1} max={4000} onChange={(height) => updateTransform({ height })} />
            </div>
            <div className="slider-row"><Scale size={14} /><span>缩放</span><input min="0.2" max="3" step="0.05" type="range" value={element.scale} onChange={(event) => updateTransform({ scale: Number(event.target.value) })} /><output>{Math.round(element.scale * 100)}%</output></div>
            <div className="slider-row"><RotateCw size={14} /><span>旋转</span><input min="-180" max="180" step="1" type="range" value={element.rotation} onChange={(event) => updateTransform({ rotation: Number(event.target.value) })} /><output>{element.rotation}°</output></div>
            <div className="slider-row"><Palette size={14} /><span>不透明度</span><input min="0" max="1" step="0.01" type="range" value={element.opacity} onChange={(event) => updateTransform({ opacity: Number(event.target.value) })} /><output>{Math.round(element.opacity * 100)}%</output></div>
          </section>
          {element.type === "text" ? (
            <section className="inspector-section">
              <div className="inspector-section-title"><span>Aa</span><span>文字</span></div>
              <textarea value={element.text} onChange={(event) => void commit([{ type: "text.update", elementId: element.id, text: event.target.value }], "修改文字")} />
              <div className="font-row"><span>{element.style.fontFamily.split(",")[0]}</span><span>{element.style.fontSize}px</span></div>
              <div className="alignment-row"><button className="active" type="button"><AlignLeft size={15} /></button><button type="button"><AlignCenter size={15} /></button><button type="button"><AlignRight size={15} /></button><span className="color-swatch" style={{ background: element.style.color }} /></div>
            </section>
          ) : null}
          <section className="inspector-section disabled-section">
            <div className="inspector-section-title"><Sparkles size={14} /><span>动画预设</span><span className="later-chip">M3</span></div>
            <div className="preset-grid"><span>淡入</span><span>打字机</span><span>弹跳</span></div>
          </section>
        </div>
      ) : <div className="no-selection">在预览或时间线中选择一个元素。</div>}
      <div className="assistant-dock">
        <div><Bot size={15} /><strong>让 Codex 修改</strong><span>{api.isMcpSession() ? "当前任务" : "仅原生模式"}</span></div>
        <form onSubmit={(event) => { event.preventDefault(); void sendToCodex(); }}>
          <input
            aria-label="给 Codex 的视频修改指令"
            disabled={!api.isMcpSession() || assistantState === "sending"}
            onChange={(event) => { setPrompt(event.target.value); setAssistantState("idle"); }}
            placeholder="例如：把开头改得更抓人"
            value={prompt}
          />
          <button disabled={!prompt.trim() || !api.isMcpSession() || assistantState === "sending"} type="submit">
            {assistantState === "sending" ? "发送中" : "发送"}
          </button>
        </form>
        {assistantState === "sent" ? <small>已发送到当前 Codex 任务</small> : null}
        {assistantState === "error" ? <small className="assistant-error">发送失败，请在聊天框中重试</small> : null}
      </div>
    </aside>
  );
}
