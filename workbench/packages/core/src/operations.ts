import { DomainError, RevisionConflictError } from "./errors.js";
import type {
  HistoryEntry,
  ProjectOperation,
  ProjectStatus,
  Scene,
  VisualElement,
  VisualHyperProject,
} from "./model.js";
import { applyOperationsInputSchema, projectOperationSchema } from "./schema.js";

const allowedTransitions: Record<ProjectStatus, ProjectStatus[]> = {
  planned: ["imported"],
  imported: ["cover-approved"],
  "cover-approved": ["script-approved"],
  "script-approved": ["generating"],
  generating: ["first-cut"],
  "first-cut": ["validated"],
  validated: ["exported"],
  exported: [],
};

export function canTransitionProjectStatus(from: ProjectStatus, to: ProjectStatus): boolean {
  return allowedTransitions[from].includes(to);
}

function findScene(project: VisualHyperProject, sceneId: string): Scene {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new DomainError("SCENE_NOT_FOUND", `Scene not found: ${sceneId}`);
  return scene;
}

function findElement(project: VisualHyperProject, elementId: string): VisualElement {
  for (const scene of project.scenes) {
    const element = scene.elements.find((item) => item.id === elementId);
    if (element) return element;
  }
  throw new DomainError("ELEMENT_NOT_FOUND", `Element not found: ${elementId}`);
}

function applyOne(project: VisualHyperProject, operation: ProjectOperation, allowStatusRollback = false): ProjectOperation {
  switch (operation.type) {
    case "scene.move": {
      const fromIndex = project.scenes.findIndex((item) => item.id === operation.sceneId);
      if (fromIndex < 0) throw new DomainError("SCENE_NOT_FOUND", `Scene not found: ${operation.sceneId}`);
      if (operation.toIndex >= project.scenes.length) {
        throw new DomainError("INVALID_SCENE_INDEX", `Scene index ${operation.toIndex} is out of range.`);
      }
      const [moved] = project.scenes.splice(fromIndex, 1);
      if (!moved) throw new DomainError("SCENE_NOT_FOUND", `Scene not found: ${operation.sceneId}`);
      project.scenes.splice(operation.toIndex, 0, moved);
      const sceneTrack = project.tracks.find((track) => track.kind === "scene");
      if (sceneTrack) sceneTrack.itemIds = project.scenes.map((item) => item.id);
      return { type: "scene.move", sceneId: operation.sceneId, toIndex: fromIndex };
    }
    case "scene.setDuration": {
      const scene = findScene(project, operation.sceneId);
      const previous = scene.durationMs;
      scene.durationMs = operation.durationMs;
      project.settings.durationMs = project.scenes.reduce((total, item) => total + item.durationMs, 0);
      return { type: "scene.setDuration", sceneId: operation.sceneId, durationMs: previous };
    }
    case "element.updateTransform": {
      const element = findElement(project, operation.elementId);
      const previous = Object.fromEntries(
        Object.keys(operation.patch).map((key) => [key, element[key as keyof typeof operation.patch]]),
      );
      Object.assign(element, operation.patch);
      return {
        type: "element.updateTransform",
        elementId: operation.elementId,
        patch: previous,
      } as ProjectOperation;
    }
    case "text.update": {
      const element = findElement(project, operation.elementId);
      if (element.type !== "text") throw new DomainError("NOT_TEXT_ELEMENT", `${operation.elementId} is not a text element.`);
      const previous = element.text;
      element.text = operation.text;
      return { type: "text.update", elementId: operation.elementId, text: previous };
    }
    case "caption.update": {
      const caption = project.captions.find((item) => item.id === operation.captionId);
      if (!caption) throw new DomainError("CAPTION_NOT_FOUND", `Caption not found: ${operation.captionId}`);
      const previous = caption.text;
      caption.text = operation.text;
      return { type: "caption.update", captionId: operation.captionId, text: previous };
    }
    case "asset.replace": {
      const element = findElement(project, operation.elementId);
      if (element.type !== "image") throw new DomainError("NOT_MEDIA_ELEMENT", `${operation.elementId} is not an image element.`);
      if (!project.assets.some((asset) => asset.id === operation.assetId)) {
        throw new DomainError("ASSET_NOT_FOUND", `Asset not found: ${operation.assetId}`);
      }
      const previous = element.assetId;
      element.assetId = operation.assetId;
      return { type: "asset.replace", elementId: operation.elementId, assetId: previous };
    }
    case "project.setStatus": {
      if (!allowStatusRollback && !canTransitionProjectStatus(project.status, operation.status)) {
        throw new DomainError("INVALID_STATUS_TRANSITION", `Cannot move project from ${project.status} to ${operation.status}.`);
      }
      const previous = project.status;
      project.status = operation.status;
      return { type: "project.setStatus", status: previous };
    }
  }
}

function applyWithoutHistory(
  source: VisualHyperProject,
  baseRevision: number,
  operations: ProjectOperation[],
  options: { allowStatusRollback?: boolean } = {},
): { project: VisualHyperProject; inverseOperations: ProjectOperation[] } {
  if (baseRevision !== source.revision) throw new RevisionConflictError(baseRevision, source.revision);
  const project = structuredClone(source);
  const inverseOperations: ProjectOperation[] = [];
  for (const rawOperation of operations) {
    const operation = projectOperationSchema.parse(rawOperation);
    inverseOperations.unshift(applyOne(project, operation, options.allowStatusRollback === true));
  }
  project.revision += 1;
  project.updatedAt = new Date().toISOString();
  return { project, inverseOperations };
}

export function applyProjectOperations(
  source: VisualHyperProject,
  input: { baseRevision: number; operations: ProjectOperation[]; label?: string },
): { project: VisualHyperProject; entry: HistoryEntry } {
  const parsed = applyOperationsInputSchema.parse({ ...input, label: input.label ?? "Edit project" });
  const applied = applyWithoutHistory(source, parsed.baseRevision, parsed.operations);
  const entry: HistoryEntry = {
    id: globalThis.crypto.randomUUID(),
    label: parsed.label,
    revision: applied.project.revision,
    createdAt: new Date().toISOString(),
    operations: parsed.operations,
    inverseOperations: applied.inverseOperations,
  };
  applied.project.history.push(entry);
  applied.project.redoStack = [];
  return { project: applied.project, entry };
}

export function undoProject(source: VisualHyperProject): VisualHyperProject {
  const entry = source.history.at(-1);
  if (!entry) throw new DomainError("NOTHING_TO_UNDO", "There are no project operations to undo.");
  const base = structuredClone(source);
  base.history.pop();
  const undone = applyWithoutHistory(base, base.revision, entry.inverseOperations, { allowStatusRollback: true }).project;
  undone.redoStack.push(entry);
  return undone;
}

export function redoProject(source: VisualHyperProject): VisualHyperProject {
  const entry = source.redoStack.at(-1);
  if (!entry) throw new DomainError("NOTHING_TO_REDO", "There are no project operations to redo.");
  const base = structuredClone(source);
  base.redoStack.pop();
  const redone = applyWithoutHistory(base, base.revision, entry.operations).project;
  redone.history.push({ ...entry, id: globalThis.crypto.randomUUID(), revision: redone.revision, createdAt: new Date().toISOString() });
  return redone;
}
