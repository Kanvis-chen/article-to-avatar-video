import { Check, Film, Play, Send, SlidersHorizontal } from "lucide-react";

const steps = [
  { label: "选择制作方式", icon: Film },
  { label: "开始制作", icon: Send },
  { label: "预览视频", icon: Play },
  { label: "调整与导出", icon: SlidersHorizontal },
];

export function StepRail({ active = 0 }: { active?: number }) {
  return (
    <nav className="step-rail" aria-label="视频制作流程">
      <span className="step-caption">制作流程</span>
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <div className={`step-item ${index === active ? "active" : ""} ${index < active ? "done" : ""}`} key={step.label}>
            <span className="step-dot">{index < active ? <Check size={12} /> : <Icon size={13} />}</span>
            <span>{index + 1} {step.label}</span>
            {index < steps.length - 1 ? <span className="step-line" /> : null}
          </div>
        );
      })}
      <span className="step-hint">从想法到成片</span>
    </nav>
  );
}
