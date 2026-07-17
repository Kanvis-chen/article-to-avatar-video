import { z } from "zod";

import { projectStatuses } from "./model.js";

export const projectStatusSchema = z.enum(projectStatuses);

const transformSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
  scale: z.number().positive().max(20).finite(),
  rotation: z.number().min(-3600).max(3600).finite(),
  opacity: z.number().min(0).max(1).finite(),
});

const textStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().positive().max(1000),
  fontWeight: z.number().int().min(100).max(1000),
  color: z.string().min(1),
  textAlign: z.enum(["left", "center", "right"]),
});

const baseElementShape = {
  id: z.string().min(1),
  name: z.string().min(1),
  ...transformSchema.shape,
};

const visualElementSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseElementShape,
    type: z.literal("text"),
    text: z.string(),
    style: textStyleSchema,
  }),
  z.object({
    ...baseElementShape,
    type: z.literal("image"),
    assetId: z.string().min(1),
    fit: z.enum(["cover", "contain"]),
  }),
  z.object({
    ...baseElementShape,
    type: z.literal("shape"),
    shape: z.enum(["rectangle", "circle"]),
    fill: z.string().min(1),
    radius: z.number().min(0),
  }),
]);

const transformPatchSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().finite().optional(),
    height: z.number().positive().finite().optional(),
    scale: z.number().positive().max(20).finite().optional(),
    rotation: z.number().min(-3600).max(3600).finite().optional(),
    opacity: z.number().min(0).max(1).finite().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "Transform patch cannot be empty.");

export const projectOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scene.move"), sceneId: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("scene.setDuration"), sceneId: z.string().min(1), durationMs: z.number().int().min(250).max(3_600_000) }),
  z.object({ type: z.literal("element.updateTransform"), elementId: z.string().min(1), patch: transformPatchSchema }),
  z.object({ type: z.literal("text.update"), elementId: z.string().min(1), text: z.string().max(20_000) }),
  z.object({ type: z.literal("caption.update"), captionId: z.string().min(1), text: z.string().max(20_000) }),
  z.object({ type: z.literal("asset.replace"), elementId: z.string().min(1), assetId: z.string().min(1) }),
  z.object({ type: z.literal("project.setStatus"), status: projectStatusSchema }),
]);

const historyEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  operations: z.array(projectOperationSchema),
  inverseOperations: z.array(projectOperationSchema),
});

export const jobSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["probe", "render", "digital-human"]),
  status: z.enum(["queued", "running", "waiting-user", "succeeded", "failed", "canceled", "interrupted"]),
  progress: z.number().min(0).max(1),
  message: z.string(),
  artifactId: z.string().min(1).optional(),
  outputFile: z.string().min(1).optional(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    recovery: z.string().optional(),
  }).strict().optional(),
}).strict();

export const visualHyperProjectSchema = z.object({
  schemaVersion: z.literal("0.1"),
  projectId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  status: projectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.object({ title: z.string().min(1), description: z.string() }),
  source: z.object({
    kind: z.enum(["placeholder", "url", "text", "markdown"]),
    title: z.string(),
    author: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    importedAt: z.string().optional(),
  }),
  settings: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive().max(120),
    durationMs: z.number().int().positive(),
    style: z.enum(["knowledge-card", "editorial", "short-video"]),
  }),
  approvals: z.object({ coverApprovedAt: z.string().nullable(), scriptApprovedAt: z.string().nullable() }),
  assets: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["image", "video", "audio"]),
    name: z.string().min(1),
    relativePath: z.string(),
    mimeType: z.string().min(1),
    durationMs: z.number().int().positive().optional(),
  })),
  scenes: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    durationMs: z.number().int().min(250),
    color: z.string().min(1),
    elements: z.array(visualElementSchema),
  })),
  tracks: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["scene", "caption", "audio"]),
    name: z.string().min(1),
    itemIds: z.array(z.string()),
    locked: z.boolean(),
    muted: z.boolean(),
  })),
  captions: z.array(z.object({
    id: z.string().min(1),
    sceneId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    text: z.string(),
  })),
  audio: z.array(z.object({
    id: z.string().min(1),
    assetId: z.string().nullable(),
    startMs: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    volume: z.number().min(0).max(2),
  })),
  jobs: z.array(jobSchema),
  history: z.array(historyEntrySchema),
  redoStack: z.array(historyEntrySchema),
});

export const applyOperationsInputSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  label: z.string().max(200).default("Edit project"),
  operations: z.array(projectOperationSchema).min(1).max(100),
});
