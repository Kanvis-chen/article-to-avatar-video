import { z } from "zod";

import { creationModeSchema } from "./workflow.js";

const identifierSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
const controlledPathSchema = z.string().min(1).max(2_048).refine((value) => !value.includes("\0"), "Path contains NUL.");

const parameterBase = {
  id: identifierSchema,
  label: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
};

export const editableParameterSchema = z.discriminatedUnion("type", [
  z.object({ ...parameterBase, type: z.literal("text"), value: z.string().max(20_000), maxLength: z.number().int().min(1).max(20_000).optional() }).strict(),
  z.object({ ...parameterBase, type: z.literal("number"), value: z.number().finite(), min: z.number().finite(), max: z.number().finite(), step: z.number().positive().finite() }).strict().refine((item) => item.min <= item.value && item.value <= item.max, "Number value is outside its range."),
  z.object({ ...parameterBase, type: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ ...parameterBase, type: z.literal("select"), value: z.string(), options: z.array(z.object({ value: z.string().max(100), label: z.string().min(1).max(100) }).strict()).min(1).max(100) }).strict().refine((item) => item.options.some((option) => option.value === item.value), "Select value is not in options."),
  z.object({ ...parameterBase, type: z.literal("asset"), value: controlledPathSchema.nullable(), accepts: z.array(z.string()).min(1).max(20) }).strict(),
]);
export type EditableParameter = z.infer<typeof editableParameterSchema>;
export const editableParameterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type EditableParameterValue = z.infer<typeof editableParameterValueSchema>;

export const parameterArtifactEditSchema = z.object({
  id: identifierSchema,
  kind: z.literal("parameter").default("parameter"),
  parameterId: identifierSchema,
  before: editableParameterValueSchema,
  after: editableParameterValueSchema,
  createdAt: z.string().datetime(),
}).strict();

export const editableLayerPropertySchema = z.enum([
  "startFrame", "durationFrames", "x", "y", "width", "height", "rotation", "opacity", "visible", "locked", "text",
]);
export type EditableLayerProperty = z.infer<typeof editableLayerPropertySchema>;

export const editableCanvasSchema = z.object({
  width: z.number().int().positive().max(32_768),
  height: z.number().int().positive().max(32_768),
  fps: z.number().positive().finite().max(240),
  durationFrames: z.number().int().positive(),
}).strict();
export type EditableCanvas = z.infer<typeof editableCanvasSchema>;

export const editableLayerSchema = z.object({
  id: identifierSchema,
  sourceLayerId: identifierSchema.optional(),
  name: z.string().min(1).max(160).optional(),
  kind: z.enum(["video", "audio", "image", "text", "caption", "shape", "motion-graphic"]),
  text: z.string().max(20_000).optional(),
  mediaStartFrame: z.number().int().nonnegative().optional(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  rotation: z.number().finite(),
  opacity: z.number().finite().min(0).max(1),
  visible: z.boolean(),
  deleted: z.boolean().default(false),
  locked: z.boolean(),
  allowedEdits: z.array(editableLayerPropertySchema).max(11).refine(
    (items) => new Set(items).size === items.length,
    "allowedEdits contains duplicate properties.",
  ),
}).strict();
export type EditableLayer = z.infer<typeof editableLayerSchema>;

export const editableLayerPatchSchema = z.object({
  startFrame: z.number().int().nonnegative().optional(),
  durationFrames: z.number().int().positive().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().nonnegative().optional(),
  height: z.number().finite().nonnegative().optional(),
  rotation: z.number().finite().optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  text: z.string().max(20_000).optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "Layer patch cannot be empty.");
export type EditableLayerPatch = z.infer<typeof editableLayerPatchSchema>;

export const layerArtifactEditSchema = z.object({
  id: identifierSchema,
  kind: z.literal("layer"),
  layerId: identifierSchema,
  before: editableLayerPatchSchema,
  after: editableLayerPatchSchema,
  createdAt: z.string().datetime(),
}).strict();
export const splitLayerArtifactEditSchema = z.object({
  id: identifierSchema,
  kind: z.literal("split-layer"),
  layerId: identifierSchema,
  rightLayer: editableLayerSchema,
  leftBeforeDurationFrames: z.number().int().positive(),
  leftAfterDurationFrames: z.number().int().positive(),
  createdAt: z.string().datetime(),
}).strict();
export const deleteLayerArtifactEditSchema = z.object({
  id: identifierSchema,
  kind: z.literal("delete-layer"),
  layerId: identifierSchema,
  beforeVisible: z.boolean(),
  createdAt: z.string().datetime(),
}).strict();
export const artifactEditSchema = z.union([parameterArtifactEditSchema, layerArtifactEditSchema, splitLayerArtifactEditSchema, deleteLayerArtifactEditSchema]);
export type ArtifactEdit = z.infer<typeof artifactEditSchema>;

export const artifactStatusSchema = z.enum(["building", "preview-ready", "rendering", "rendered", "failed"]);
export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;

export const visualArtifactSchema = z.object({
  schemaVersion: z.literal("1"),
  artifactId: identifierSchema,
  workflowId: identifierSchema,
  mode: creationModeSchema,
  engine: z.literal("hyperframes"),
  projectDir: controlledPathSchema,
  compositionId: z.string().min(1).max(200).optional(),
  sourceRevision: z.number().int().nonnegative(),
  editRevision: z.number().int().nonnegative().default(0),
  status: artifactStatusSchema,
  capabilities: z.object({
    preview: z.boolean(),
    render: z.boolean(),
    editableParameters: z.array(editableParameterSchema).max(100),
  }).strict(),
  canvas: editableCanvasSchema.optional(),
  editableLayers: z.array(editableLayerSchema).max(10_000).default([]),
  outputs: z.array(z.object({
    kind: z.enum(["video", "image", "captions", "project", "audio"]),
    relativePath: controlledPathSchema,
    mimeType: z.string().min(1).max(200).optional(),
  }).strict()).max(100),
  history: z.array(artifactEditSchema).max(1_000).default([]),
  redoStack: z.array(artifactEditSchema).max(1_000).default([]),
  error: z.object({
    code: identifierSchema,
    message: z.string().min(1).max(2_000),
    recovery: z.string().max(2_000).optional(),
  }).strict().optional(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((artifact, context) => {
  if (artifact.status === "failed" && !artifact.error) {
    context.addIssue({ code: "custom", path: ["error"], message: "Failed artifacts require an error." });
  }
  if (artifact.status !== "failed" && artifact.error) {
    context.addIssue({ code: "custom", path: ["error"], message: "Only failed artifacts may contain an error." });
  }
  if (artifact.status === "rendered" && !artifact.outputs.some((output) => output.kind === "video")) {
    context.addIssue({ code: "custom", path: ["outputs"], message: "Rendered artifacts require a video output." });
  }
  const ids = artifact.editableLayers.map((layer) => layer.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["editableLayers"], message: "Editable layer IDs must be unique." });
  }
  if (artifact.editableLayers.length > 0 && !artifact.canvas) {
    context.addIssue({ code: "custom", path: ["canvas"], message: "Artifacts with editable layers require a canvas." });
  }
  if (artifact.canvas) {
    artifact.editableLayers.forEach((layer, index) => {
      if (layer.startFrame + layer.durationFrames > artifact.canvas!.durationFrames) {
        context.addIssue({ code: "custom", path: ["editableLayers", index, "durationFrames"], message: "Layer exceeds canvas duration." });
      }
    });
  }
});
export type VisualArtifact = z.infer<typeof visualArtifactSchema>;

function parameterValue(parameter: EditableParameter): EditableParameterValue {
  return parameter.value;
}

function withParameterValue(parameter: EditableParameter, value: EditableParameterValue): EditableParameter {
  return editableParameterSchema.parse({ ...parameter, value });
}

export function updateArtifactParameter(input: {
  artifact: VisualArtifact;
  baseRevision: number;
  parameterId: string;
  value: EditableParameterValue;
  editId?: string;
}): VisualArtifact {
  if (input.baseRevision !== input.artifact.editRevision) {
    throw new Error(`Artifact revision conflict: expected ${input.artifact.editRevision}, received ${input.baseRevision}.`);
  }
  const index = input.artifact.capabilities.editableParameters.findIndex((parameter) => parameter.id === input.parameterId);
  if (index < 0) throw new Error(`Editable parameter not found: ${input.parameterId}`);
  const current = input.artifact.capabilities.editableParameters[index]!;
  const next = withParameterValue(current, input.value);
  const before = parameterValue(current);
  if (Object.is(before, next.value)) return input.artifact;
  const edit: ArtifactEdit = {
    id: input.editId ?? `edit-${input.artifact.editRevision + 1}`,
    kind: "parameter",
    parameterId: input.parameterId,
    before,
    after: next.value,
    createdAt: new Date().toISOString(),
  };
  const parameters = [...input.artifact.capabilities.editableParameters];
  parameters[index] = next;
  return {
    ...input.artifact,
    editRevision: input.artifact.editRevision + 1,
    status: input.artifact.status === "rendered" ? "preview-ready" : input.artifact.status,
    capabilities: { ...input.artifact.capabilities, editableParameters: parameters },
    history: [...input.artifact.history, edit],
    redoStack: [],
    updatedAt: new Date().toISOString(),
  };
}

function applyArtifactEdit(artifact: VisualArtifact, edit: ArtifactEdit, direction: "undo" | "redo"): VisualArtifact {
  if (edit.kind === "layer") {
    const index = artifact.editableLayers.findIndex((layer) => layer.id === edit.layerId);
    if (index < 0) throw new Error(`Editable layer not found: ${edit.layerId}`);
    const layers = [...artifact.editableLayers];
    layers[index] = editableLayerSchema.parse({ ...layers[index]!, ...(direction === "undo" ? edit.before : edit.after) });
    return visualArtifactSchema.parse({
      ...artifact,
      editRevision: artifact.editRevision + 1,
      status: artifact.status === "rendered" ? "preview-ready" : artifact.status,
      editableLayers: layers,
      history: direction === "undo" ? artifact.history.slice(0, -1) : [...artifact.history, edit],
      redoStack: direction === "undo" ? [...artifact.redoStack, edit] : artifact.redoStack.slice(0, -1),
      updatedAt: new Date().toISOString(),
    });
  }
  if (edit.kind === "split-layer") {
    const leftIndex = artifact.editableLayers.findIndex((layer) => layer.id === edit.layerId);
    if (leftIndex < 0) throw new Error(`Editable layer not found: ${edit.layerId}`);
    const layers = [...artifact.editableLayers];
    layers[leftIndex] = editableLayerSchema.parse({
      ...layers[leftIndex]!,
      durationFrames: direction === "undo" ? edit.leftBeforeDurationFrames : edit.leftAfterDurationFrames,
    });
    if (direction === "undo") {
      const rightIndex = layers.findIndex((layer) => layer.id === edit.rightLayer.id);
      if (rightIndex < 0) throw new Error(`Split layer not found: ${edit.rightLayer.id}`);
      layers.splice(rightIndex, 1);
    } else {
      if (layers.some((layer) => layer.id === edit.rightLayer.id)) throw new Error(`Split layer already exists: ${edit.rightLayer.id}`);
      layers.splice(leftIndex + 1, 0, edit.rightLayer);
    }
    return visualArtifactSchema.parse({
      ...artifact,
      editRevision: artifact.editRevision + 1,
      status: artifact.status === "rendered" ? "preview-ready" : artifact.status,
      editableLayers: layers,
      history: direction === "undo" ? artifact.history.slice(0, -1) : [...artifact.history, edit],
      redoStack: direction === "undo" ? [...artifact.redoStack, edit] : artifact.redoStack.slice(0, -1),
      updatedAt: new Date().toISOString(),
    });
  }
  if (edit.kind === "delete-layer") {
    const index = artifact.editableLayers.findIndex((layer) => layer.id === edit.layerId);
    if (index < 0) throw new Error(`Editable layer not found: ${edit.layerId}`);
    const layers = [...artifact.editableLayers];
    layers[index] = editableLayerSchema.parse({
      ...layers[index]!,
      deleted: direction === "redo",
      visible: direction === "undo" ? edit.beforeVisible : false,
    });
    return visualArtifactSchema.parse({
      ...artifact,
      editRevision: artifact.editRevision + 1,
      status: artifact.status === "rendered" ? "preview-ready" : artifact.status,
      editableLayers: layers,
      history: direction === "undo" ? artifact.history.slice(0, -1) : [...artifact.history, edit],
      redoStack: direction === "undo" ? [...artifact.redoStack, edit] : artifact.redoStack.slice(0, -1),
      updatedAt: new Date().toISOString(),
    });
  }
  const index = artifact.capabilities.editableParameters.findIndex((parameter) => parameter.id === edit.parameterId);
  if (index < 0) throw new Error(`Editable parameter not found: ${edit.parameterId}`);
  const parameters = [...artifact.capabilities.editableParameters];
  parameters[index] = withParameterValue(parameters[index]!, direction === "undo" ? edit.before : edit.after);
  return {
    ...artifact,
    editRevision: artifact.editRevision + 1,
    status: artifact.status === "rendered" ? "preview-ready" : artifact.status,
    capabilities: { ...artifact.capabilities, editableParameters: parameters },
    history: direction === "undo" ? artifact.history.slice(0, -1) : [...artifact.history, edit],
    redoStack: direction === "undo" ? [...artifact.redoStack, edit] : artifact.redoStack.slice(0, -1),
    updatedAt: new Date().toISOString(),
  };
}

export function updateArtifactLayer(input: {
  artifact: VisualArtifact;
  baseRevision: number;
  layerId: string;
  patch: EditableLayerPatch;
  editId?: string;
}): VisualArtifact {
  if (input.baseRevision !== input.artifact.editRevision) {
    throw new Error(`Artifact revision conflict: expected ${input.artifact.editRevision}, received ${input.baseRevision}.`);
  }
  const patch = editableLayerPatchSchema.parse(input.patch);
  const index = input.artifact.editableLayers.findIndex((layer) => layer.id === input.layerId);
  if (index < 0) throw new Error(`Editable layer not found: ${input.layerId}`);
  const current = input.artifact.editableLayers[index]!;
  if (current.deleted) throw new Error("Deleted layers cannot be edited.");
  for (const property of Object.keys(patch) as EditableLayerProperty[]) {
    if (!current.allowedEdits.includes(property)) throw new Error(`Layer property is not editable: ${property}`);
  }
  const before = Object.fromEntries(Object.keys(patch).map((property) => [property, current[property as EditableLayerProperty]]));
  if (Object.keys(patch).every((property) => Object.is(current[property as EditableLayerProperty], patch[property as keyof EditableLayerPatch]))) {
    return input.artifact;
  }
  const layers = [...input.artifact.editableLayers];
  layers[index] = editableLayerSchema.parse({ ...current, ...patch });
  const edit: ArtifactEdit = {
    id: input.editId ?? `edit-${input.artifact.editRevision + 1}`,
    kind: "layer",
    layerId: input.layerId,
    before,
    after: patch,
    createdAt: new Date().toISOString(),
  };
  return visualArtifactSchema.parse({
    ...input.artifact,
    editRevision: input.artifact.editRevision + 1,
    status: input.artifact.status === "rendered" ? "preview-ready" : input.artifact.status,
    editableLayers: layers,
    history: [...input.artifact.history, edit],
    redoStack: [],
    updatedAt: new Date().toISOString(),
  });
}

function nextSplitLayerId(artifact: VisualArtifact, layerId: string): string {
  const suffix = `-split-${artifact.editRevision + 1}`;
  const base = layerId.slice(0, 128 - suffix.length);
  let candidate = `${base}${suffix}`;
  let attempt = 2;
  while (artifact.editableLayers.some((layer) => layer.id === candidate)) {
    const retrySuffix = `${suffix}-${attempt++}`;
    candidate = `${layerId.slice(0, 128 - retrySuffix.length)}${retrySuffix}`;
  }
  return candidate;
}

export function splitArtifactLayer(input: {
  artifact: VisualArtifact;
  baseRevision: number;
  layerId: string;
  splitFrame: number;
  rightLayerId?: string;
  editId?: string;
}): VisualArtifact {
  if (input.baseRevision !== input.artifact.editRevision) {
    throw new Error(`Artifact revision conflict: expected ${input.artifact.editRevision}, received ${input.baseRevision}.`);
  }
  if (!Number.isInteger(input.splitFrame) || input.splitFrame < 0) throw new Error("Split frame must be a non-negative integer.");
  const index = input.artifact.editableLayers.findIndex((layer) => layer.id === input.layerId);
  if (index < 0) throw new Error(`Editable layer not found: ${input.layerId}`);
  const current = input.artifact.editableLayers[index]!;
  if (current.deleted) throw new Error("Deleted layers cannot be split.");
  if (current.locked) throw new Error("Locked layers cannot be split.");
  if (!current.allowedEdits.includes("startFrame") || !current.allowedEdits.includes("durationFrames")) {
    throw new Error("Layer timing is not editable.");
  }
  const endFrame = current.startFrame + current.durationFrames;
  if (input.splitFrame <= current.startFrame || input.splitFrame >= endFrame) {
    throw new Error("Split frame must be strictly inside the layer.");
  }
  const rightLayerId = identifierSchema.parse(input.rightLayerId ?? nextSplitLayerId(input.artifact, current.id));
  if (input.artifact.editableLayers.some((layer) => layer.id === rightLayerId)) throw new Error(`Editable layer ID already exists: ${rightLayerId}`);
  const leftDurationFrames = input.splitFrame - current.startFrame;
  const rightLayer = editableLayerSchema.parse({
    ...current,
    id: rightLayerId,
    sourceLayerId: current.sourceLayerId ?? current.id,
    name: `${current.name ?? current.id}（后半段）`,
    startFrame: input.splitFrame,
    durationFrames: endFrame - input.splitFrame,
    ...(["video", "audio"].includes(current.kind) ? { mediaStartFrame: (current.mediaStartFrame ?? 0) + leftDurationFrames } : {}),
  });
  const layers = [...input.artifact.editableLayers];
  layers[index] = editableLayerSchema.parse({ ...current, durationFrames: leftDurationFrames });
  layers.splice(index + 1, 0, rightLayer);
  const edit: ArtifactEdit = {
    id: input.editId ?? `edit-${input.artifact.editRevision + 1}`,
    kind: "split-layer",
    layerId: current.id,
    rightLayer,
    leftBeforeDurationFrames: current.durationFrames,
    leftAfterDurationFrames: leftDurationFrames,
    createdAt: new Date().toISOString(),
  };
  return visualArtifactSchema.parse({
    ...input.artifact,
    editRevision: input.artifact.editRevision + 1,
    status: input.artifact.status === "rendered" ? "preview-ready" : input.artifact.status,
    editableLayers: layers,
    history: [...input.artifact.history, edit],
    redoStack: [],
    updatedAt: new Date().toISOString(),
  });
}

export function deleteArtifactLayer(input: {
  artifact: VisualArtifact;
  baseRevision: number;
  layerId: string;
  editId?: string;
}): VisualArtifact {
  if (input.baseRevision !== input.artifact.editRevision) {
    throw new Error(`Artifact revision conflict: expected ${input.artifact.editRevision}, received ${input.baseRevision}.`);
  }
  const index = input.artifact.editableLayers.findIndex((layer) => layer.id === input.layerId);
  if (index < 0) throw new Error(`Editable layer not found: ${input.layerId}`);
  const current = input.artifact.editableLayers[index]!;
  if (current.deleted) throw new Error("Layer is already deleted.");
  if (current.locked) throw new Error("Locked layers cannot be deleted.");
  const edit: ArtifactEdit = {
    id: input.editId ?? `edit-${input.artifact.editRevision + 1}`,
    kind: "delete-layer",
    layerId: current.id,
    beforeVisible: current.visible,
    createdAt: new Date().toISOString(),
  };
  const layers = [...input.artifact.editableLayers];
  layers[index] = editableLayerSchema.parse({ ...current, deleted: true, visible: false });
  return visualArtifactSchema.parse({
    ...input.artifact,
    editRevision: input.artifact.editRevision + 1,
    status: input.artifact.status === "rendered" ? "preview-ready" : input.artifact.status,
    editableLayers: layers,
    history: [...input.artifact.history, edit],
    redoStack: [],
    updatedAt: new Date().toISOString(),
  });
}

export function undoArtifactEdit(artifact: VisualArtifact): VisualArtifact {
  const edit = artifact.history.at(-1);
  if (!edit) throw new Error("There is no artifact edit to undo.");
  return applyArtifactEdit(artifact, edit, "undo");
}

export function redoArtifactEdit(artifact: VisualArtifact): VisualArtifact {
  const edit = artifact.redoStack.at(-1);
  if (!edit) throw new Error("There is no artifact edit to redo.");
  return applyArtifactEdit(artifact, edit, "redo");
}

export function shouldAcceptArtifact(current: VisualArtifact | undefined, incoming: VisualArtifact): boolean {
  if (!current) return true;
  if (current.artifactId !== incoming.artifactId) return true;
  return incoming.sourceRevision >= current.sourceRevision
    && new Date(incoming.updatedAt).getTime() >= new Date(current.updatedAt).getTime();
}
