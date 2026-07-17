import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactStore } from "../src/artifact-store.js";
import { ProjectStore } from "../src/project-store.js";
import { RenderJobManager, type RenderExecutor } from "../src/render-job-manager.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

async function setup() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "kanvis-render-"));
  dirs.push(projectDir);
  const engineDir = path.join(projectDir, "engine");
  await mkdir(engineDir);
  await writeFile(path.join(engineDir, "index.html"), "<html></html>");
  await writeFile(path.join(projectDir, "visualhyper.artifact.json"), JSON.stringify({
    schemaVersion: "1", artifactId: "artifact-render", workflowId: "kanvis-motion-explainer", mode: "animation", engine: "hyperframes",
    projectDir: "engine", compositionId: "main", sourceRevision: 1, status: "preview-ready",
    capabilities: { preview: true, render: true, editableParameters: [{ id: "title", type: "text", label: "标题", value: "测试标题" }] }, outputs: [], updatedAt: "2026-07-15T00:00:00.000Z",
  }));
  const projectStore = await ProjectStore.open(projectDir);
  await projectStore.create();
  return { projectDir, projectStore, artifactStore: new ArtifactStore(projectDir) };
}

describe("RenderJobManager", () => {
  it("does not mark a stale revision render as current", async () => {
    const setupResult = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const executor: RenderExecutor = {
      inspect: async (projectDir) => ({ ok: true, projectDir, checks: [] }),
      render: async ({ outputFile }) => { await gate; await writeFile(outputFile, Buffer.alloc(2_048)); },
      verify: async (filePath) => ({ filePath, sizeBytes: 2_048, durationSeconds: 15, formatName: "mp4" }),
    };
    const manager = new RenderJobManager({ ...setupResult, executor });
    const queued = await manager.start("draft");
    while ((await setupResult.artifactStore.load())?.artifact.status !== "rendering") await new Promise((resolve) => setTimeout(resolve, 5));
    await setupResult.artifactStore.update((artifact) => ({ ...artifact, editRevision: artifact.editRevision + 1, status: "preview-ready", updatedAt: new Date().toISOString() }));
    release();
    const finished = await manager.wait(queued.id);
    expect(finished?.status).toBe("succeeded");
    expect(finished?.message).toContain("过期");
    const current = (await setupResult.artifactStore.load())!.artifact;
    expect(current.status).toBe("preview-ready");
    expect(current.editRevision).toBe(1);
    expect(current.outputs).toEqual([]);
  });
  it("persists a succeeded job only after output verification", async () => {
    const setupResult = await setup();
    const executor: RenderExecutor = {
      inspect: async (projectDir) => ({ ok: true, projectDir, checks: [] }),
      render: async ({ outputFile, variables }) => {
        expect(variables).toEqual({ title: "测试标题" });
        await writeFile(outputFile, Buffer.alloc(2_048));
      },
      verify: async (filePath) => ({ filePath, sizeBytes: 2_048, durationSeconds: 15, formatName: "mp4" }),
    };
    const manager = new RenderJobManager({ ...setupResult, executor });
    const queued = await manager.start("draft");
    const finished = await manager.wait(queued.id);
    expect(finished?.status).toBe("succeeded");
    const loaded = await setupResult.artifactStore.load();
    expect(loaded?.artifact.status).toBe("rendered");
    expect(loaded?.artifact.outputs[0]?.relativePath).toMatch(/^\.visualhyper\/renders\//);
    expect(loaded?.outputs[0]?.absolutePath).toBe(finished?.outputFile);
    expect((await setupResult.projectStore.load()).jobs.at(-1)?.progress).toBe(1);
  });

  it("marks persisted running jobs interrupted on recovery", async () => {
    const setupResult = await setup();
    await setupResult.artifactStore.update((artifact) => ({ ...artifact, status: "rendering", updatedAt: new Date().toISOString() }));
    await setupResult.projectStore.upsertJob({ id: "old", type: "render", status: "running", progress: 0.5, message: "running" });
    const manager = new RenderJobManager({ ...setupResult, executor: {} as RenderExecutor });
    await manager.recover();
    expect((await setupResult.projectStore.load()).jobs[0]?.status).toBe("interrupted");
    expect((await setupResult.artifactStore.load())?.artifact.status).toBe("preview-ready");
  });
});
