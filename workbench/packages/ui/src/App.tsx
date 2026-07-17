import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";

import * as api from "./api";
import { EditorShell } from "./components/EditorShell";
import { StepRail } from "./components/StepRail";
import { TopBar } from "./components/TopBar";
import { WizardView } from "./components/WizardView";
import { useEditorStore } from "./store";

declare global {
  interface Window {
    __VISUALHYPER_MCP_WIDGET__?: boolean;
  }
}

function Workspace() {
  const mode = useEditorStore((state) => state.mode);

  return (
    <div className="app-shell">
      <TopBar />
      <StepRail active={mode === "wizard" ? 0 : 2} />
      {mode === "wizard" ? <WizardView /> : <EditorShell />}
    </div>
  );
}

function WebPanelApp() {
  const load = useEditorStore((state) => state.load);

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events");
    source.addEventListener("project", () => void load(true));
    source.onerror = () => source.close();
    return () => source.close();
  }, [load]);

  return <Workspace />;
}

function McpWidgetApp() {
  const [projectDir, setProjectDir] = useState("");
  const [preferredDisplayMode, setPreferredDisplayMode] = useState<"fullscreen" | "inline">("fullscreen");
  const { app, isConnected, error } = useApp({
    appInfo: { name: "visualhyper", version: "0.1.0" },
    capabilities: {},
    autoResize: true,
    onAppCreated: (createdApp) => {
      createdApp.ontoolresult = (result) => {
        const payload = api.payloadFromToolResult(result);
        if (!payload?.projectDir) return;
        api.configureMcpSession(createdApp, payload.projectDir);
        setProjectDir(payload.projectDir);
        if (payload.preferredDisplayMode) setPreferredDisplayMode(payload.preferredDisplayMode);
        if (payload.project) {
          useEditorStore.getState().acceptProject(
            payload.project,
            `Codex 内嵌同步 · revision ${payload.project.revision}`,
          );
        }
      };
    },
  });

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    if (!app || !isConnected || !projectDir) return;
    api.configureMcpSession(app, projectDir);
    void app.requestDisplayMode({ mode: preferredDisplayMode }).catch(() => undefined);
    void useEditorStore.getState().load(true);
    const timer = window.setInterval(() => void useEditorStore.getState().load(true), 1500);
    return () => window.clearInterval(timer);
  }, [app, isConnected, preferredDisplayMode, projectDir]);

  if (error) {
    return <div className="widget-status widget-status--error">VisualHyper 无法连接 Codex 宿主：{error.message}</div>;
  }
  if (!isConnected || !projectDir) {
    return <div className="widget-status">正在把 VisualHyper 接入当前 Codex 任务…</div>;
  }
  return <Workspace />;
}

export function App() {
  return window.__VISUALHYPER_MCP_WIDGET__ ? <McpWidgetApp /> : <WebPanelApp />;
}
