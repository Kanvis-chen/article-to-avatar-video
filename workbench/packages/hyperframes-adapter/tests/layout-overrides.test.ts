import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileLayoutOverrides, writeLayoutOverrides } from "../src/layout-overrides.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const layer = { id: "card-1", startFrame: 30, durationFrames: 90, x: 10, y: 20, width: 300, height: 200, rotation: 2, opacity: 0.8, visible: true, text: "可编辑文案" };
const derivedLayer = { ...layer, id: "card-1-split-2", sourceLayerId: "card-1", startFrame: 75, durationFrames: 45, mediaStartFrame: 75 };

describe("layout overrides", () => {
  it("compiles only controlled layout properties", () => {
    expect(compileLayoutOverrides({ editRevision: 4, layers: [layer] })).toEqual({ schemaVersion: "1", editRevision: 4, layers: [layer] });
    expect(compileLayoutOverrides({ editRevision: 5, layers: [derivedLayer] }).layers[0]).toMatchObject({
      id: "card-1-split-2", sourceLayerId: "card-1", startFrame: 75, durationFrames: 45, mediaStartFrame: 75,
    });
  });

  it("atomically writes the one controlled target and rejects arbitrary paths", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "vh-overrides-")); dirs.push(projectDir);
    const file = await writeLayoutOverrides({ projectDir, target: ".visualhyper/layout-overrides.json", editRevision: 1, layers: [layer] });
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ editRevision: 1, layers: [{ id: "card-1" }] });
    const companion = await readFile(path.join(projectDir, ".visualhyper", "layout-overrides.js"), "utf8");
    expect(companion).toContain("window.__KANVIS_LAYOUT_OVERRIDES__");
    expect(companion).toContain("window.__KANVIS_SET_EDITABLE_TEXT__");
    expect(companion).toContain("window.__KANVIS_APPLY_LAYOUT_OVERRIDES__");
    expect(companion).toContain("kanvisResolveLayerTarget");
    expect(companion).toContain("closest(\".clip\")");
    expect(companion).toContain("range.deleteContents()");
    expect(companion).toContain('"text":"可编辑文案"');
    await expect(writeLayoutOverrides({ projectDir, target: "index.html", editRevision: 2, layers: [layer] })).rejects.toThrow(/only be written/);
    await expect(writeLayoutOverrides({ projectDir, target: "../escape.json", editRevision: 2, layers: [layer] })).rejects.toThrow();
  });
});
