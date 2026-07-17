import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactStore } from "../src/artifact-store.js";
import { WorkflowRegistry } from "../src/workflow-registry.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function tempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "kanvis-registry-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("WorkflowRegistry", () => {
  it("lists builtin workflows and allows project manifests to override by id", async () => {
    const projectDir = await tempProject();
    const workflowDir = path.join(projectDir, ".visualhyper", "workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(path.join(workflowDir, "custom.json"), JSON.stringify({
      schemaVersion: "1",
      id: "kanvis-motion-explainer",
      displayName: "品牌动画",
      description: "项目覆盖的动画流程",
      version: "1.1.0",
      mode: "animation",
      skill: { invocation: "$project-motion" },
      engine: "hyperframes",
      inputs: [{ id: "brief", type: "text", label: "内容", required: true }],
      artifactFile: "visualhyper.artifact.json",
    }));
    const entries = await new WorkflowRegistry(projectDir).list();
    expect(entries).toHaveLength(3);
    expect(entries.find((entry) => entry.manifest.id === "kanvis-motion-explainer")?.source).toBe("project");
    expect((await new WorkflowRegistry(projectDir).list("avatar"))).toHaveLength(1);
    expect(await new WorkflowRegistry(projectDir).get("kanvis-heygen-avatar")).toBeUndefined();
  });

  it("exposes a safe Style Skill library view and filters by material type", async () => {
    const projectDir = await tempProject();
    const workflowDir = path.join(projectDir, ".visualhyper", "workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(path.join(workflowDir, "brand.json"), JSON.stringify({
      schemaVersion: "1",
      id: "brand-talking-head",
      displayName: "品牌口播包装",
      description: "给真人口播添加品牌字幕与动画。",
      version: "1.0.0",
      mode: "footage",
      skill: { invocation: "$private-project-skill" },
      engine: "hyperframes",
      processor: "talking-head",
      inputs: [{ id: "footage", type: "file", label: "真人原始视频", required: true, accepts: ["video/*"] }],
    }));

    const styleSkills = await new WorkflowRegistry(projectDir).listStyleSkills("footage");
    expect(styleSkills).toHaveLength(2);
    expect(styleSkills.find((skill) => skill.id === "brand-talking-head")).toMatchObject({
      workflowId: "brand-talking-head",
      name: "品牌口播包装",
      materialTypes: ["footage"],
      source: "project",
      sourceLabel: "当前项目",
      availability: { available: true, code: "ready" },
    });
    expect(JSON.stringify(styleSkills)).not.toContain(projectDir);
    expect(JSON.stringify(styleSkills)).not.toContain("$private-project-skill");
  });

  it("rejects invalid project manifests", async () => {
    const projectDir = await tempProject();
    const workflowDir = path.join(projectDir, ".visualhyper", "workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(path.join(workflowDir, "bad.json"), JSON.stringify({ id: "bad" }));
    await expect(new WorkflowRegistry(projectDir).list()).rejects.toThrow();
  });

  it("imports a local SKILL.md idempotently without exposing its absolute path", async () => {
    const projectDir = await tempProject();
    const skillDir = path.join(await tempProject(), "article-style");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: article-to-avatar-video\ndescription: 把公众号文章制作成数字人口播视频。\n---\n\n# Workflow\n");
    const registry = new WorkflowRegistry(projectDir);
    const first = await registry.importStyleSkill(skillDir, "avatar");
    const second = await registry.importStyleSkill(skillDir, "avatar");
    expect(first.manifest).toMatchObject({
      id: "article-to-avatar-video",
      mode: "avatar",
      provider: "bring-your-own",
      skill: { localPath: skillDir },
    });
    expect(second.manifest.id).toBe(first.manifest.id);
    const summaries = await registry.listStyleSkills("avatar");
    const summary = summaries.find((entry) => entry.id === "article-to-avatar-video");
    expect(summary).toMatchObject({ source: "project", availability: { available: true, code: "ready" } });
    expect(JSON.stringify(summary)).not.toContain(skillDir);
  });

  it("rejects invalid local Skill paths and reports a moved Skill as unavailable", async () => {
    const projectDir = await tempProject();
    const skillRoot = await tempProject();
    const skillDir = path.join(skillRoot, "movable-skill");
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: movable-skill\ndescription: A valid local style skill.\n---\n");
    const registry = new WorkflowRegistry(projectDir);
    await expect(registry.importStyleSkill("relative-skill", "avatar")).rejects.toThrow(/absolute/i);
    await expect(registry.importStyleSkill(skillRoot, "avatar")).rejects.toThrow(/SKILL\.md/i);
    await registry.importStyleSkill(skillDir, "avatar");
    await rm(skillDir, { recursive: true, force: true });
    const summary = (await registry.listStyleSkills("avatar")).find((entry) => entry.id === "movable-skill");
    expect(summary?.availability).toMatchObject({ available: false, code: "skill-missing" });
  });
});

describe("ArtifactStore", () => {
  it("updates one declared layer, writes controlled overrides, and rejects stale revisions", async () => {
    const projectDir = await tempProject();
    await mkdir(path.join(projectDir, "engine"));
    await mkdir(path.join(projectDir, ".visualhyper"));
    const store = new ArtifactStore(projectDir);
    await store.write({
      schemaVersion: "1", artifactId: "artifact-layer", workflowId: "kanvis-motion-explainer", mode: "animation", engine: "hyperframes",
      projectDir: "engine", compositionId: "main", sourceRevision: 1, editRevision: 0, status: "rendered",
      capabilities: { preview: true, render: true, editableParameters: [] },
      canvas: { width: 1080, height: 1920, fps: 30, durationFrames: 300 },
      editableLayers: [{ id: "card-1", kind: "motion-graphic", startFrame: 0, durationFrames: 100, x: 0, y: 0, width: 500, height: 400, rotation: 0, opacity: 1, visible: true, locked: false, allowedEdits: ["x", "opacity"] }],
      outputs: [{ kind: "video", relativePath: "old.mp4" }], history: [], redoStack: [], updatedAt: "2026-07-15T00:00:00.000Z",
    });
    await writeFile(path.join(projectDir, ".visualhyper", "layout-writeback.json"), JSON.stringify({ artifactId: "artifact-layer", relativePath: ".visualhyper/layout-overrides.json" }));
    const updated = await store.updateLayer({ baseRevision: 0, layerId: "card-1", patch: { x: 42, opacity: 0.5 } });
    expect(updated.artifact).toMatchObject({ editRevision: 1, status: "preview-ready", editableLayers: [{ x: 42, opacity: 0.5 }] });
    const overrides = JSON.parse(await readFile(path.join(projectDir, "engine", ".visualhyper", "layout-overrides.json"), "utf8"));
    expect(overrides).toMatchObject({ editRevision: 1, layers: [{ id: "card-1", x: 42, opacity: 0.5 }] });
    await expect(store.updateLayer({ baseRevision: 0, layerId: "card-1", patch: { x: 50 } })).rejects.toMatchObject({ name: "RevisionConflictError" });
    await expect(store.updateLayer({ baseRevision: 1, layerId: "card-1", patch: { width: 100 } })).rejects.toThrow(/not editable/);
  });
  it("splits a timing-editable layer as one persisted undoable revision", async () => {
    const projectDir = await tempProject();
    await mkdir(path.join(projectDir, "engine"));
    await mkdir(path.join(projectDir, ".visualhyper"));
    const store = new ArtifactStore(projectDir);
    await store.write({
      schemaVersion: "1", artifactId: "artifact-split", workflowId: "kanvis-motion-explainer", mode: "animation", engine: "hyperframes",
      projectDir: "engine", compositionId: "main", sourceRevision: 1, editRevision: 0, status: "preview-ready",
      capabilities: { preview: true, render: true, editableParameters: [] },
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 300 },
      editableLayers: [{ id: "pip", kind: "video", startFrame: 0, durationFrames: 300, x: 1400, y: 40, width: 420, height: 236, rotation: 0, opacity: 1, visible: true, locked: false, allowedEdits: ["startFrame", "durationFrames"] }],
      outputs: [], history: [], redoStack: [], updatedAt: "2026-07-16T00:00:00.000Z",
    });
    await writeFile(path.join(projectDir, ".visualhyper", "layout-writeback.json"), JSON.stringify({ artifactId: "artifact-split", relativePath: ".visualhyper/layout-overrides.json" }));
    const split = await store.splitLayer({ baseRevision: 0, layerId: "pip", splitFrame: 120 });
    expect(split.artifact.editableLayers).toHaveLength(2);
    expect(split.artifact.editableLayers[1]).toMatchObject({ sourceLayerId: "pip", startFrame: 120, durationFrames: 180, mediaStartFrame: 120 });
    const overrides = JSON.parse(await readFile(path.join(projectDir, "engine", ".visualhyper", "layout-overrides.json"), "utf8"));
    expect(overrides.layers[1]).toMatchObject({ sourceLayerId: "pip", mediaStartFrame: 120 });
    expect((await store.undoEdit()).artifact.editableLayers).toHaveLength(1);
    expect((await store.redoEdit()).artifact.editableLayers).toHaveLength(2);
  });
  it("persists deletion as a hidden tombstone and restores it through history", async () => {
    const projectDir = await tempProject();
    await mkdir(path.join(projectDir, "engine"));
    await mkdir(path.join(projectDir, ".visualhyper"));
    const store = new ArtifactStore(projectDir);
    await store.write({
      schemaVersion: "1", artifactId: "artifact-delete", workflowId: "kanvis-motion-explainer", mode: "animation", engine: "hyperframes",
      projectDir: "engine", compositionId: "main", sourceRevision: 1, editRevision: 0, status: "preview-ready",
      capabilities: { preview: true, render: true, editableParameters: [] },
      canvas: { width: 1920, height: 1080, fps: 30, durationFrames: 90 },
      editableLayers: [{ id: "effect", kind: "motion-graphic", startFrame: 0, durationFrames: 90, x: 0, y: 0, width: 500, height: 300, rotation: 0, opacity: 1, visible: true, locked: false, allowedEdits: ["startFrame", "durationFrames"] }],
      outputs: [], history: [], redoStack: [], updatedAt: "2026-07-16T00:00:00.000Z",
    });
    await writeFile(path.join(projectDir, ".visualhyper", "layout-writeback.json"), JSON.stringify({ artifactId: "artifact-delete", relativePath: ".visualhyper/layout-overrides.json" }));
    const deleted = await store.deleteLayer({ baseRevision: 0, layerId: "effect" });
    expect(deleted.artifact.editableLayers[0]).toMatchObject({ id: "effect", deleted: true, visible: false });
    const overrides = JSON.parse(await readFile(path.join(projectDir, "engine", ".visualhyper", "layout-overrides.json"), "utf8"));
    expect(overrides.layers[0]).toMatchObject({ id: "effect", visible: false });
    expect((await store.undoEdit()).artifact.editableLayers[0]).toMatchObject({ deleted: false, visible: true });
    expect((await store.redoEdit()).artifact.editableLayers[0]).toMatchObject({ deleted: true, visible: false });
  });
  it("loads and resolves a valid project-local artifact", async () => {
    const projectDir = await tempProject();
    await mkdir(path.join(projectDir, "output"), { recursive: true });
    await writeFile(path.join(projectDir, "visualhyper.artifact.json"), JSON.stringify({
      schemaVersion: "1",
      artifactId: "artifact-1",
      workflowId: "kanvis-motion-explainer",
      mode: "animation",
      engine: "hyperframes",
      projectDir: "output",
      compositionId: "main",
      sourceRevision: 1,
      status: "preview-ready",
      capabilities: { preview: true, render: true, editableParameters: [] },
      outputs: [{ kind: "project", relativePath: "." }],
      updatedAt: "2026-07-15T00:00:00.000Z",
    }));
    const loaded = await new ArtifactStore(projectDir).load();
    expect(loaded?.engineProjectDir).toBe(path.join(projectDir, "output"));
    expect(loaded?.outputs[0]?.absolutePath).toBe(path.join(projectDir, "output"));
  });

  it("rejects artifact paths outside the project", async () => {
    const projectDir = await tempProject();
    await writeFile(path.join(projectDir, "visualhyper.artifact.json"), JSON.stringify({
      schemaVersion: "1",
      artifactId: "artifact-1",
      workflowId: "kanvis-motion-explainer",
      mode: "animation",
      engine: "hyperframes",
      projectDir: "..",
      sourceRevision: 1,
      status: "preview-ready",
      capabilities: { preview: false, render: false, editableParameters: [] },
      outputs: [],
      updatedAt: "2026-07-15T00:00:00.000Z",
    }));
    await expect(new ArtifactStore(projectDir).load()).rejects.toThrow(/outside the project/i);
  });

  it("serializes parameter edits and rejects stale revisions", async () => {
    const projectDir = await tempProject();
    await mkdir(path.join(projectDir, "output"));
    const store = new ArtifactStore(projectDir);
    const base = {
      schemaVersion: "1" as const,
      artifactId: "artifact-edit",
      workflowId: "kanvis-motion-explainer",
      mode: "animation" as const,
      engine: "hyperframes" as const,
      projectDir: "output",
      compositionId: "main",
      sourceRevision: 1,
      editRevision: 0,
      status: "preview-ready" as const,
      capabilities: { preview: true, render: true, editableParameters: [{ id: "title", type: "text" as const, label: "标题", value: "旧标题", maxLength: 20 }] },
      outputs: [], history: [], redoStack: [], updatedAt: "2026-07-15T00:00:00.000Z",
    };
    await store.write(base);
    const updated = await store.updateParameter({ baseRevision: 0, parameterId: "title", value: "新标题" });
    expect(updated.artifact.editRevision).toBe(1);
    await expect(store.updateParameter({ baseRevision: 0, parameterId: "title", value: "冲突" })).rejects.toThrow(/conflict/i);
    expect((await store.undoEdit()).artifact.capabilities.editableParameters[0]?.value).toBe("旧标题");
  });
});
