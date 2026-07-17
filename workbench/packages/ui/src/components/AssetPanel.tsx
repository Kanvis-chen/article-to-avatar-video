import { Film, Image, Layers3, Search, Type, Upload } from "lucide-react";

import { useEditorStore } from "../store";

const tabItems = [
  { id: "scenes" as const, label: "场景", icon: Layers3 },
  { id: "assets" as const, label: "素材", icon: Image },
  { id: "text" as const, label: "文字", icon: Type },
];

export function AssetPanel() {
  const { project, leftTab, setLeftTab, selectedSceneId, setSelection } = useEditorStore();
  return (
    <aside className="asset-panel panel-surface">
      <div className="panel-tabs">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          return (
            <button className={leftTab === tab.id ? "active" : ""} onClick={() => setLeftTab(tab.id)} type="button" key={tab.id}>
              <Icon size={15} />{tab.label}
            </button>
          );
        })}
      </div>
      <div className="asset-search"><Search size={14} /><span>搜索项目内容</span></div>
      {leftTab === "scenes" ? (
        <div className="scene-list">
          <div className="section-label"><span>场景</span><span>{project.scenes.length}</span></div>
          {project.scenes.map((scene, index) => (
            <button
              type="button"
              className={`scene-card ${scene.id === selectedSceneId ? "active" : ""}`}
              onClick={() => setSelection(scene.id)}
              key={scene.id}
            >
              <div className="scene-thumb" style={{ background: scene.color }}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div style={{ background: scene.elements.find((element) => element.type === "shape")?.type === "shape" ? scene.elements.find((element) => element.type === "shape")?.fill : "#22d3b6" }} />
              </div>
              <div><strong>{scene.name}</strong><span>{(scene.durationMs / 1000).toFixed(1)}s</span></div>
            </button>
          ))}
        </div>
      ) : leftTab === "assets" ? (
        <div className="empty-panel-state">
          <Upload size={25} />
          <strong>项目素材</strong>
          <span>本地素材会保留在当前项目中。</span>
          <button disabled type="button">导入素材</button>
        </div>
      ) : (
        <div className="text-presets">
          <div className="section-label"><span>文字预设</span><span>内置</span></div>
          <button type="button"><strong>大标题</strong><span>Bold · 92px</span></button>
          <button type="button"><strong>正文说明</strong><span>Regular · 42px</span></button>
          <button type="button"><strong>字幕条</strong><span>Semibold · 36px</span></button>
        </div>
      )}
      <div className="panel-footer-note"><Film size={13} /> HyperFrames project model</div>
    </aside>
  );
}
