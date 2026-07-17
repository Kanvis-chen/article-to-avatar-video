import {
  applyProjectOperations,
  createVisualHyperProject,
  redoProject as redoLocalProject,
  undoProject as undoLocalProject,
  type ProjectOperation,
  type VisualHyperProject,
} from "@visualhyper/core";
import { create } from "zustand";

import * as api from "./api";

type PanelMode = "wizard" | "editor";
type ConnectionState = "connecting" | "connected" | "demo" | "error";

type EditorState = {
  project: VisualHyperProject;
  mode: PanelMode;
  connection: ConnectionState;
  connectionMessage: string;
  selectedSceneId: string;
  selectedElementId: string;
  playheadMs: number;
  zoom: number;
  isPlaying: boolean;
  leftTab: "assets" | "scenes" | "text";
  setMode: (mode: PanelMode) => void;
  setSelection: (sceneId: string, elementId?: string) => void;
  setPlayhead: (timeMs: number) => void;
  setZoom: (zoom: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setLeftTab: (tab: "assets" | "scenes" | "text") => void;
  acceptProject: (project: VisualHyperProject, message?: string) => void;
  load: (silent?: boolean) => Promise<void>;
  commit: (operations: ProjectOperation[], label: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const demoProject = createVisualHyperProject({ projectId: "visualhyper-ui-demo" });
const initialMode: PanelMode = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("mode") === "wizard"
  ? "wizard"
  : "editor";

export const useEditorStore = create<EditorState>((set, get) => ({
  project: demoProject,
  mode: initialMode,
  connection: "connecting",
  connectionMessage: "正在连接项目服务…",
  selectedSceneId: demoProject.scenes[0]?.id ?? "",
  selectedElementId: demoProject.scenes[0]?.elements.find((element) => element.type === "text")?.id ?? "",
  playheadMs: 0,
  zoom: 1,
  isPlaying: false,
  leftTab: "scenes",
  setMode: (mode) => set({ mode }),
  setSelection: (selectedSceneId, selectedElementId) => set((state) => ({
    selectedSceneId,
    selectedElementId: selectedElementId ?? state.project.scenes.find((scene) => scene.id === selectedSceneId)?.elements[0]?.id ?? "",
  })),
  setPlayhead: (playheadMs) => set({ playheadMs }),
  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.6, zoom)) }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setLeftTab: (leftTab) => set({ leftTab }),
  acceptProject: (project, message) => set((state) => ({
    project,
    connection: "connected",
    connectionMessage: message ?? `已同步 · revision ${project.revision}`,
    selectedSceneId: project.scenes.some((scene) => scene.id === state.selectedSceneId)
      ? state.selectedSceneId
      : project.scenes[0]?.id ?? "",
  })),
  load: async (silent = false) => {
    if (!silent) set({ connection: "connecting", connectionMessage: "正在连接项目服务…" });
    try {
      const project = await api.getProject();
      if (project.revision !== get().project.revision || get().connection !== "connected") {
        get().acceptProject(project);
      }
    } catch (error) {
      if (api.isMcpSession()) {
        set({
          connection: "error",
          connectionMessage: error instanceof Error ? error.message : "Codex 内嵌项目同步失败",
        });
        return;
      }
      set({
        project: demoProject,
        connection: "demo",
        connectionMessage: "演示模式 · 启动本地服务后自动同步",
      });
    }
  },
  commit: async (operations, label) => {
    const snapshot = get();
    if (snapshot.connection !== "connected") {
      const project = applyProjectOperations(snapshot.project, {
        baseRevision: snapshot.project.revision,
        operations,
        label,
      }).project;
      set({ project, connectionMessage: `演示修改 · revision ${project.revision}` });
      return;
    }
    try {
      const project = await api.applyOperations({
        baseRevision: snapshot.project.revision,
        operations,
        label,
      });
      set({ project, connectionMessage: `已保存 · revision ${project.revision}` });
    } catch (error) {
      set({ connection: "error", connectionMessage: error instanceof Error ? error.message : "项目修改失败" });
      await get().load();
    }
  },
  undo: async () => {
    const state = get();
    if (state.connection === "connected") {
      const project = await api.undoProject();
      set({ project, connectionMessage: `已撤销 · revision ${project.revision}` });
      return;
    }
    try {
      const project = undoLocalProject(state.project);
      set({ project, connectionMessage: `演示撤销 · revision ${project.revision}` });
    } catch {
      // Nothing to undo is a valid no-op in the shell.
    }
  },
  redo: async () => {
    const state = get();
    if (state.connection === "connected") {
      const project = await api.redoProject();
      set({ project, connectionMessage: `已重做 · revision ${project.revision}` });
      return;
    }
    try {
      const project = redoLocalProject(state.project);
      set({ project, connectionMessage: `演示重做 · revision ${project.revision}` });
    } catch {
      // Nothing to redo is a valid no-op in the shell.
    }
  },
}));
