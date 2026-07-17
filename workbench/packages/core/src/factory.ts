import type { Scene, TextElement, VisualHyperProject } from "./model.js";

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function titleElement(elementId: string, text: string, color = "#F8FAFC"): TextElement {
  return {
    id: elementId,
    type: "text",
    name: "标题",
    text,
    x: 110,
    y: 360,
    width: 860,
    height: 340,
    scale: 1,
    rotation: 0,
    opacity: 1,
    style: {
      fontFamily: "Inter, Noto Sans SC, sans-serif",
      fontSize: 92,
      fontWeight: 800,
      color,
      textAlign: "left",
    },
  };
}

function scene(sceneId: string, name: string, headline: string, color: string, accent: string): Scene {
  return {
    id: sceneId,
    name,
    durationMs: 4000,
    color,
    elements: [
      {
        id: `${sceneId}-accent`,
        type: "shape",
        name: "强调色块",
        shape: "rectangle",
        fill: accent,
        radius: 24,
        x: 110,
        y: 280,
        width: 168,
        height: 18,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
      titleElement(`${sceneId}-title`, headline),
    ],
  };
}

export function createVisualHyperProject(input: { title?: string; projectId?: string } = {}): VisualHyperProject {
  const now = new Date().toISOString();
  const scenes = [
    scene("scene-01", "开场", "把一篇文章，变成一条可发布的视频。", "#101820", "#22D3B6"),
    scene("scene-02", "方法", "先选封面，再定风格，最后交给 HyperFrames。", "#171427", "#8B5CF6"),
    scene("scene-03", "交付", "每一步可确认，每一次修改都能撤销。", "#111827", "#F59E0B"),
  ];
  const captions = [
    { id: "caption-01", sceneId: "scene-01", startMs: 0, endMs: 3500, text: "把一篇文章，变成一条可发布的视频。" },
    { id: "caption-02", sceneId: "scene-02", startMs: 4000, endMs: 7500, text: "先选封面，再定风格，最后交给 HyperFrames。" },
    { id: "caption-03", sceneId: "scene-03", startMs: 8000, endMs: 11_500, text: "每一步可确认，每一次修改都能撤销。" },
  ];

  return {
    schemaVersion: "0.1",
    projectId: input.projectId ?? id("project"),
    revision: 0,
    status: "planned",
    createdAt: now,
    updatedAt: now,
    metadata: {
      title: input.title ?? "Kanvis 视频项目",
      description: "Kanvis 项目保存制作方式、视频工件、参数 revision 和渲染状态。",
    },
    source: { kind: "placeholder", title: "等待开始制作" },
    settings: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: scenes.reduce((total, item) => total + item.durationMs, 0),
      style: "knowledge-card",
    },
    approvals: { coverApprovedAt: null, scriptApprovedAt: null },
    assets: [],
    scenes,
    tracks: [
      { id: "track-scenes", kind: "scene", name: "场景", itemIds: scenes.map((item) => item.id), locked: false, muted: false },
      { id: "track-captions", kind: "caption", name: "字幕", itemIds: captions.map((item) => item.id), locked: false, muted: false },
      { id: "track-audio", kind: "audio", name: "音频", itemIds: ["audio-placeholder"], locked: false, muted: false },
    ],
    captions,
    audio: [{ id: "audio-placeholder", assetId: null, startMs: 0, durationMs: 12_000, volume: 0.75 }],
    jobs: [],
    history: [],
    redoStack: [],
  };
}
