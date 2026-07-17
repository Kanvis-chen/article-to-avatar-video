import { describe, expect, it } from "vitest";

import {
  buildWorkflowPrompt,
  builtinWorkflowManifests,
  deleteArtifactLayer,
  shouldAcceptArtifact,
  validateWorkflowInputValues,
  visualArtifactSchema,
  updateArtifactParameter,
  undoArtifactEdit,
  redoArtifactEdit,
  splitArtifactLayer,
  updateArtifactLayer,
  workflowManifestSchema,
  styleSkillSummarySchema,
} from "../src/index.js";

describe("Kanvis workflow contracts", () => {
  it("provides one valid workflow for every creation mode", () => {
    expect(new Set(builtinWorkflowManifests.map((item) => item.mode))).toEqual(new Set(["animation", "avatar", "footage"]));
  });

  it("rejects invalid mode-specific manifests and arbitrary engines", () => {
    const base = {
      schemaVersion: "1",
      id: "bad-workflow",
      displayName: "Bad",
      description: "Invalid workflow",
      version: "1.0.0",
      skill: { invocation: "$bad" },
      inputs: [{ id: "brief", type: "text", label: "Brief", required: true }],
      artifactFile: "visualhyper.artifact.json",
    };
    expect(() => workflowManifestSchema.parse({ ...base, mode: "avatar", engine: "hyperframes" })).toThrow();
    expect(() => workflowManifestSchema.parse({ ...base, mode: "animation", engine: "remotion" })).toThrow();
    expect(() => workflowManifestSchema.parse({ ...base, mode: "animation", engine: "hyperframes", artifactFile: "../artifact.json" })).toThrow();
  });

  it("validates required values and produces a deterministic Codex prompt", () => {
    const manifest = builtinWorkflowManifests[0]!;
    expect(validateWorkflowInputValues(manifest, {})).toEqual(["视频内容为必填项。"]);
    const prompt = buildWorkflowPrompt({ manifest, values: { brief: "解释 Kanvis", assets: [] }, projectDir: "C:\\work" });
    expect(prompt).toContain("kanvis-motion-explainer");
    expect(prompt).toContain("$hyperframes");
    expect(prompt).toContain("visualhyper.artifact.json");
  });

  it("validates creator-facing Style Skill summaries", () => {
    expect(styleSkillSummarySchema.parse({
      id: "brand-motion",
      workflowId: "brand-motion",
      name: "品牌动画",
      description: "项目动画风格",
      version: "1.0.0",
      materialTypes: ["animation"],
      source: "project",
      sourceLabel: "当前项目",
      availability: { available: true, code: "ready", message: "可以开始制作。" },
      inputs: [{ id: "brief", type: "text", label: "内容", required: true }],
    })).toMatchObject({ name: "品牌动画", materialTypes: ["animation"] });
  });
});

describe("Kanvis artifact contract", () => {
  const artifact = visualArtifactSchema.parse({
    schemaVersion: "1",
    artifactId: "artifact-1",
    workflowId: "kanvis-motion-explainer",
    mode: "animation",
    engine: "hyperframes",
    projectDir: "output/project",
    compositionId: "main",
    sourceRevision: 1,
    status: "preview-ready",
    capabilities: { preview: true, render: true, editableParameters: [] },
    outputs: [{ kind: "project", relativePath: "output/project" }],
    updatedAt: "2026-07-15T00:00:00.000Z",
  });

  it("requires verified-looking video output metadata for rendered state", () => {
    expect(() => visualArtifactSchema.parse({ ...artifact, status: "rendered" })).toThrow();
    expect(visualArtifactSchema.parse({
      ...artifact,
      status: "rendered",
      outputs: [...artifact.outputs, { kind: "video", relativePath: "output/video.mp4", mimeType: "video/mp4" }],
    }).status).toBe("rendered");
  });

  it("rejects stale artifact revisions", () => {
    expect(shouldAcceptArtifact(artifact, { ...artifact, sourceRevision: 0, updatedAt: "2026-07-15T01:00:00.000Z" })).toBe(false);
    expect(shouldAcceptArtifact(artifact, { ...artifact, sourceRevision: 2, updatedAt: "2026-07-15T01:00:00.000Z" })).toBe(true);
  });

  it("edits declared parameters with revision, undo, and redo", () => {
    const editable = visualArtifactSchema.parse({
      ...artifact,
      status: "rendered",
      outputs: [{ kind: "video", relativePath: "old.mp4" }],
      capabilities: {
        preview: true,
        render: true,
        editableParameters: [{ id: "title", type: "text", label: "标题", value: "旧标题", maxLength: 20 }],
      },
    });
    const updated = updateArtifactParameter({ artifact: editable, baseRevision: 0, parameterId: "title", value: "新标题" });
    expect(updated.editRevision).toBe(1);
    expect(updated.status).toBe("preview-ready");
    expect(updated.capabilities.editableParameters[0]?.value).toBe("新标题");
    const undone = undoArtifactEdit(updated);
    expect(undone.capabilities.editableParameters[0]?.value).toBe("旧标题");
    expect(redoArtifactEdit(undone).capabilities.editableParameters[0]?.value).toBe("新标题");
    expect(() => updateArtifactParameter({ artifact: updated, baseRevision: 0, parameterId: "title", value: "冲突" })).toThrow(/conflict/i);
  });

  it("reads legacy v1 artifacts without editable layer fields", () => {
    expect(artifact.editableLayers).toEqual([]);
    expect(artifact.canvas).toBeUndefined();
  });

  it("updates allowed layer properties with one revision and supports undo/redo", () => {
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1080, height: 1920, fps: 30, durationFrames: 300 },
      editableLayers: [{
        id: "presenter", kind: "video", startFrame: 0, durationFrames: 300,
        x: 0, y: 0, width: 1080, height: 1920, rotation: 0, opacity: 1,
        visible: true, locked: false,
        allowedEdits: ["x", "y", "width", "height", "rotation", "opacity", "visible", "locked"],
      }],
    });
    const updated = updateArtifactLayer({
      artifact: layered, baseRevision: 0, layerId: "presenter", patch: { x: 40, opacity: 0.75, locked: true },
    });
    expect(updated.editRevision).toBe(1);
    expect(updated.editableLayers[0]).toMatchObject({ x: 40, opacity: 0.75, locked: true });
    const undone = undoArtifactEdit(updated);
    expect(undone.editableLayers[0]).toMatchObject({ x: 0, opacity: 1, locked: false });
    expect(redoArtifactEdit(undone).editableLayers[0]).toMatchObject({ x: 40, opacity: 0.75, locked: true });
  });

  it("edits declared layer text without allowing undeclared content edits", () => {
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 90 },
      editableLayers: [{
        id: "card-title", name: "标题卡", kind: "text", text: "旧文案",
        startFrame: 0, durationFrames: 90, x: 20, y: 30, width: 800, height: 200,
        rotation: 0, opacity: 1, visible: true, locked: false, allowedEdits: ["text"],
      }],
    });
    const updated = updateArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "card-title", patch: { text: "新文案" } });
    expect(updated.editableLayers[0]).toMatchObject({ name: "标题卡", text: "新文案" });
    expect(undoArtifactEdit(updated).editableLayers[0]?.text).toBe("旧文案");
  });

  it("retimes declared layers with revision history and canvas bounds", () => {
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 300 },
      editableLayers: [{
        id: "scene", kind: "motion-graphic", startFrame: 30, durationFrames: 90,
        x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1,
        visible: true, locked: false, allowedEdits: ["startFrame", "durationFrames"],
      }],
    });
    const updated = updateArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "scene", patch: { startFrame: 60, durationFrames: 120 } });
    expect(updated.editableLayers[0]).toMatchObject({ startFrame: 60, durationFrames: 120 });
    expect(undoArtifactEdit(updated).editableLayers[0]).toMatchObject({ startFrame: 30, durationFrames: 90 });
    expect(() => updateArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "scene", patch: { startFrame: 250, durationFrames: 100 } })).toThrow(/exceeds/i);
  });

  it("splits a layer atomically and restores both halves through undo/redo", () => {
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 300 },
      editableLayers: [{
        id: "presenter", name: "数字人", kind: "video", mediaStartFrame: 30,
        startFrame: 60, durationFrames: 180, x: 1400, y: 40, width: 420, height: 236,
        rotation: 0, opacity: 1, visible: true, locked: false,
        allowedEdits: ["startFrame", "durationFrames", "x", "y", "width", "height"],
      }],
    });
    const split = splitArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "presenter", splitFrame: 150, rightLayerId: "presenter-part-2" });
    expect(split.editRevision).toBe(1);
    expect(split.history.at(-1)?.kind).toBe("split-layer");
    expect(split.editableLayers).toHaveLength(2);
    expect(split.editableLayers[0]).toMatchObject({ id: "presenter", startFrame: 60, durationFrames: 90 });
    expect(split.editableLayers[1]).toMatchObject({
      id: "presenter-part-2", sourceLayerId: "presenter", startFrame: 150, durationFrames: 90, mediaStartFrame: 120,
    });
    const undone = undoArtifactEdit(split);
    expect(undone.editableLayers).toHaveLength(1);
    expect(undone.editableLayers[0]).toMatchObject({ id: "presenter", durationFrames: 180 });
    const redone = redoArtifactEdit(undone);
    expect(redone.editableLayers).toHaveLength(2);
    expect(redone.editableLayers[1]?.id).toBe("presenter-part-2");
  });

  it("preserves source continuity when splitting an audio layer", () => {
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 300 },
      editableLayers: [{
        id: "voice", name: "原始人声", kind: "audio", mediaStartFrame: 15,
        startFrame: 30, durationFrames: 240, x: 0, y: 0, width: 0, height: 0,
        rotation: 0, opacity: 1, visible: true, locked: false,
        allowedEdits: ["startFrame", "durationFrames"],
      }],
    });
    const split = splitArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "voice", splitFrame: 120 });
    expect(split.editableLayers[1]).toMatchObject({ kind: "audio", startFrame: 120, durationFrames: 150, mediaStartFrame: 105 });
  });

  it("deletes an unlocked layer without destroying it and restores it through undo/redo", () => {
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 120 },
      editableLayers: [{
        id: "caption-1", kind: "caption", text: "可撤销字幕", startFrame: 0, durationFrames: 90,
        x: 100, y: 900, width: 1720, height: 100, rotation: 0, opacity: 1,
        visible: true, locked: false, allowedEdits: ["text", "startFrame", "durationFrames"],
      }],
    });
    const deleted = deleteArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "caption-1" });
    expect(deleted.editableLayers[0]).toMatchObject({ id: "caption-1", deleted: true, visible: false, text: "可撤销字幕" });
    expect(deleted.history.at(-1)?.kind).toBe("delete-layer");
    const restored = undoArtifactEdit(deleted);
    expect(restored.editableLayers[0]).toMatchObject({ deleted: false, visible: true });
    expect(redoArtifactEdit(restored).editableLayers[0]).toMatchObject({ deleted: true, visible: false });
  });

  it("rejects deleting locked or already deleted layers", () => {
    const baseLayer = {
      id: "locked-card", kind: "motion-graphic" as const, startFrame: 0, durationFrames: 30,
      x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1,
      visible: true, locked: true, allowedEdits: ["startFrame", "durationFrames"] as const,
    };
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 30 },
      editableLayers: [baseLayer],
    });
    expect(() => deleteArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "locked-card" })).toThrow(/locked/i);
    const unlocked = visualArtifactSchema.parse({ ...layered, editableLayers: [{ ...baseLayer, locked: false, deleted: true, visible: false }] });
    expect(() => deleteArtifactLayer({ artifact: unlocked, baseRevision: 0, layerId: "locked-card" })).toThrow(/already deleted/i);
  });

  it("rejects split boundaries, locked layers, stale revisions, and non-editable timing", () => {
    const baseLayer = {
      id: "card", kind: "motion-graphic" as const, startFrame: 30, durationFrames: 60,
      x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1,
      visible: true, locked: false, allowedEdits: ["startFrame", "durationFrames"] as const,
    };
    const layered = visualArtifactSchema.parse({
      ...artifact,
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 120 },
      editableLayers: [baseLayer],
    });
    expect(() => splitArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "card", splitFrame: 30 })).toThrow(/strictly inside/i);
    expect(() => splitArtifactLayer({ artifact: layered, baseRevision: 0, layerId: "card", splitFrame: 90 })).toThrow(/strictly inside/i);
    expect(() => splitArtifactLayer({ artifact: layered, baseRevision: 1, layerId: "card", splitFrame: 60 })).toThrow(/conflict/i);
    expect(() => splitArtifactLayer({ artifact: visualArtifactSchema.parse({ ...layered, editableLayers: [{ ...baseLayer, locked: true }] }), baseRevision: 0, layerId: "card", splitFrame: 60 })).toThrow(/locked/i);
    expect(() => splitArtifactLayer({ artifact: visualArtifactSchema.parse({ ...layered, editableLayers: [{ ...baseLayer, allowedEdits: ["x"] }] }), baseRevision: 0, layerId: "card", splitFrame: 60 })).toThrow(/timing/i);
  });

  it("strictly validates editable layers and edit permissions", () => {
    const layer = {
      id: "card", kind: "motion-graphic", startFrame: 0, durationFrames: 30,
      x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1,
      visible: true, locked: false, allowedEdits: ["x"],
    };
    const base = { ...artifact, canvas: { width: 1080, height: 1920, fps: 30, durationFrames: 30 }, editableLayers: [layer] };
    expect(() => visualArtifactSchema.parse({ ...base, editableLayers: [layer, layer] })).toThrow(/unique/i);
    expect(() => visualArtifactSchema.parse({ ...base, editableLayers: [{ ...layer, x: Number.NaN }] })).toThrow();
    expect(() => visualArtifactSchema.parse({ ...base, editableLayers: [{ ...layer, width: -1 }] })).toThrow();
    expect(() => visualArtifactSchema.parse({ ...base, editableLayers: [{ ...layer, opacity: 1.1 }] })).toThrow();
    expect(() => visualArtifactSchema.parse({ ...base, editableLayers: [{ ...layer, startFrame: -1 }] })).toThrow();
    expect(() => visualArtifactSchema.parse({ ...base, editableLayers: [{ ...layer, durationFrames: 31 }] })).toThrow(/exceeds/i);
    const parsed = visualArtifactSchema.parse(base);
    expect(() => updateArtifactLayer({ artifact: parsed, baseRevision: 0, layerId: "card", patch: { opacity: 0.5 } })).toThrow(/not editable/i);
  });
});
