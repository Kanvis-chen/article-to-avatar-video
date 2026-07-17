import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RevisionConflictError } from "@visualhyper/core";
import { ProjectStore } from "../src/project-store.js";
import { assertPathInside } from "../src/paths.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProjectStore", () => {
  it("creates, atomically updates, and reloads a project", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "visualhyper-store-"));
    temporaryDirectories.push(directory);
    const store = await ProjectStore.open(directory);
    const created = await store.create({ title: "Store test" });
    const updated = await store.apply({
      baseRevision: created.revision,
      operations: [{ type: "caption.update", captionId: "caption-01", text: "更新后的字幕" }],
    });
    expect(updated.revision).toBe(1);
    expect((await store.load()).captions[0]?.text).toBe("更新后的字幕");
    expect(JSON.parse(await readFile(store.projectFile, "utf8")).revision).toBe(1);
  });

  it("rejects stale writes", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "visualhyper-store-"));
    temporaryDirectories.push(directory);
    const store = await ProjectStore.open(directory);
    await store.create();
    await expect(store.apply({
      baseRevision: 99,
      operations: [{ type: "caption.update", captionId: "caption-01", text: "stale" }],
    })).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it("rejects paths outside the project root", () => {
    const root = path.resolve(tmpdir(), "visualhyper-root");
    expect(() => assertPathInside(root, path.resolve(root, "..", "outside.mp4"))).toThrowError(/outside the project/i);
  });
});
