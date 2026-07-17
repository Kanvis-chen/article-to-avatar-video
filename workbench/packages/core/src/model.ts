export const projectStatuses = [
  "planned",
  "imported",
  "cover-approved",
  "script-approved",
  "generating",
  "first-cut",
  "validated",
  "exported",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export type ProjectSource = {
  kind: "placeholder" | "url" | "text" | "markdown";
  title: string;
  author?: string | undefined;
  sourceUrl?: string | undefined;
  importedAt?: string | undefined;
};

export type VideoSettings = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  style: "knowledge-card" | "editorial" | "short-video";
};

export type ApprovalState = {
  coverApprovedAt: string | null;
  scriptApprovedAt: string | null;
};

export type Asset = {
  id: string;
  kind: "image" | "video" | "audio";
  name: string;
  relativePath: string;
  mimeType: string;
  durationMs?: number | undefined;
};

export type Transform = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
};

type ElementBase = Transform & {
  id: string;
  name: string;
};

export type TextElement = ElementBase & {
  type: "text";
  text: string;
  style: TextStyle;
};

export type ImageElement = ElementBase & {
  type: "image";
  assetId: string;
  fit: "cover" | "contain";
};

export type ShapeElement = ElementBase & {
  type: "shape";
  shape: "rectangle" | "circle";
  fill: string;
  radius: number;
};

export type VisualElement = TextElement | ImageElement | ShapeElement;

export type Scene = {
  id: string;
  name: string;
  durationMs: number;
  color: string;
  elements: VisualElement[];
};

export type Caption = {
  id: string;
  sceneId: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type AudioItem = {
  id: string;
  assetId: string | null;
  startMs: number;
  durationMs: number;
  volume: number;
};

export type Track = {
  id: string;
  kind: "scene" | "caption" | "audio";
  name: string;
  itemIds: string[];
  locked: boolean;
  muted: boolean;
};

export type Job = {
  id: string;
  type: "probe" | "render" | "digital-human";
  status: "queued" | "running" | "waiting-user" | "succeeded" | "failed" | "canceled" | "interrupted";
  progress: number;
  message: string;
  artifactId?: string | undefined;
  outputFile?: string | undefined;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  error?: { code: string; message: string; recovery?: string | undefined } | undefined;
};

export type TransformPatch = {
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  scale?: number | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
};

export type ProjectOperation =
  | { type: "scene.move"; sceneId: string; toIndex: number }
  | { type: "scene.setDuration"; sceneId: string; durationMs: number }
  | { type: "element.updateTransform"; elementId: string; patch: TransformPatch }
  | { type: "text.update"; elementId: string; text: string }
  | { type: "caption.update"; captionId: string; text: string }
  | { type: "asset.replace"; elementId: string; assetId: string }
  | { type: "project.setStatus"; status: ProjectStatus };

export type HistoryEntry = {
  id: string;
  label: string;
  revision: number;
  createdAt: string;
  operations: ProjectOperation[];
  inverseOperations: ProjectOperation[];
};

export type VisualHyperProject = {
  schemaVersion: "0.1";
  projectId: string;
  revision: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  metadata: {
    title: string;
    description: string;
  };
  source: ProjectSource;
  settings: VideoSettings;
  approvals: ApprovalState;
  assets: Asset[];
  scenes: Scene[];
  tracks: Track[];
  captions: Caption[];
  audio: AudioItem[];
  jobs: Job[];
  history: HistoryEntry[];
  redoStack: HistoryEntry[];
};
