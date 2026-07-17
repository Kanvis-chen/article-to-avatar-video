import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactStore } from "../src/artifact-store.js";
import { ArtifactWatcher } from "../src/artifact-watcher.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function fixture(sourceRevision: number, updatedAt: string) {
  return {
    schemaVersion: "1",
    artifactId: "artifact-watch",
    workflowId: "kanvis-motion-explainer",
    mode: "animation",
    engine: "hyperframes",
    projectDir: "output",
    sourceRevision,
    status: "preview-ready",
    capabilities: { preview: true, render: true, editableParameters: [] },
    outputs: [],
    updatedAt,
  };
}

describe("ArtifactWatcher", () => {
  it("restores an existing artifact and ignores stale revisions", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "kanvis-watch-"));
    temporaryDirectories.push(projectDir);
    await mkdir(path.join(projectDir, "output"));
    const artifactFile = path.join(projectDir, "visualhyper.artifact.json");
    await writeFile(artifactFile, JSON.stringify(fixture(2, "2026-07-15T02:00:00.000Z")));
    const revisions: number[] = [];
    const watcher = new ArtifactWatcher({
      store: new ArtifactStore(projectDir),
      debounceMs: 10,
      onUpdate: (artifact) => revisions.push(artifact.artifact.sourceRevision),
    });
    await watcher.start();
    expect(watcher.getCurrent()?.artifact.sourceRevision).toBe(2);
    await writeFile(artifactFile, JSON.stringify(fixture(1, "2026-07-15T03:00:00.000Z")));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(watcher.getCurrent()?.artifact.sourceRevision).toBe(2);
    expect(revisions).toEqual([2]);
    watcher.stop();
  });
});
