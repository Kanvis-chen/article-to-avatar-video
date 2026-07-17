import { describe, expect, it } from "vitest";

import {
  applyProjectOperations,
  canTransitionProjectStatus,
  createVisualHyperProject,
  DomainError,
  projectOperationSchema,
  redoProject,
  RevisionConflictError,
  undoProject,
} from "../src/index.js";

describe("VisualHyper project operations", () => {
  it("applies a batch atomically and increments one revision", () => {
    const source = createVisualHyperProject({ projectId: "project-test" });
    const result = applyProjectOperations(source, {
      baseRevision: 0,
      label: "Tune opening title",
      operations: [
        { type: "text.update", elementId: "scene-01-title", text: "新的开场标题" },
        { type: "element.updateTransform", elementId: "scene-01-title", patch: { scale: 1.2, opacity: 0.8 } },
      ],
    });

    expect(result.project.revision).toBe(1);
    expect(result.project.history).toHaveLength(1);
    const title = result.project.scenes[0]?.elements.find((element) => element.id === "scene-01-title");
    expect(title?.type === "text" ? title.text : null).toBe("新的开场标题");
    expect(title?.scale).toBe(1.2);
    expect(source.revision).toBe(0);
  });

  it("rejects stale revisions", () => {
    const source = createVisualHyperProject();
    expect(() => applyProjectOperations(source, {
      baseRevision: 7,
      operations: [{ type: "caption.update", captionId: "caption-01", text: "冲突" }],
    })).toThrow(RevisionConflictError);
  });

  it("moves scenes and supports undo and redo", () => {
    const source = createVisualHyperProject();
    const moved = applyProjectOperations(source, {
      baseRevision: 0,
      operations: [{ type: "scene.move", sceneId: "scene-03", toIndex: 0 }],
    }).project;

    expect(moved.scenes.map((scene) => scene.id)).toEqual(["scene-03", "scene-01", "scene-02"]);
    const undone = undoProject(moved);
    expect(undone.scenes.map((scene) => scene.id)).toEqual(["scene-01", "scene-02", "scene-03"]);
    const redone = redoProject(undone);
    expect(redone.scenes.map((scene) => scene.id)).toEqual(["scene-03", "scene-01", "scene-02"]);
  });

  it("enforces the workflow state machine", () => {
    expect(canTransitionProjectStatus("planned", "imported")).toBe(true);
    expect(canTransitionProjectStatus("planned", "cover-approved")).toBe(false);
    const source = createVisualHyperProject();
    expect(() => applyProjectOperations(source, {
      baseRevision: 0,
      operations: [{ type: "project.setStatus", status: "cover-approved" }],
    })).toThrow(DomainError);
  });

  it("allows internal undo to restore the previous workflow status", () => {
    const source = createVisualHyperProject();
    const imported = applyProjectOperations(source, {
      baseRevision: 0,
      operations: [{ type: "project.setStatus", status: "imported" }],
    }).project;
    expect(imported.status).toBe("imported");
    expect(undoProject(imported).status).toBe("planned");
  });

  it("validates transform bounds", () => {
    expect(() => projectOperationSchema.parse({
      type: "element.updateTransform",
      elementId: "scene-01-title",
      patch: { opacity: 2 },
    })).toThrow();
  });
});
