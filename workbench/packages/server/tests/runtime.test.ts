import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearRuntime, readRuntime, writeRuntime, type PanelRuntime } from "../src/runtime.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

async function setup() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "kanvis-runtime-"));
  dirs.push(projectDir);
  const runtime = (instanceId: string): PanelRuntime => ({
    pid: 1, instanceId, projectDir, projectFile: path.join(projectDir, "visualhyper.project.json"),
    url: "http://127.0.0.1:12345/", startedAt: new Date().toISOString(),
  });
  return { projectDir, runtime };
}

describe("panel runtime ownership", () => {
  it("does not let an older server clear a newer server runtime", async () => {
    const { projectDir, runtime } = await setup();
    await writeRuntime(runtime("new-instance"));
    await clearRuntime(projectDir, "old-instance");
    expect((await readRuntime(projectDir))?.instanceId).toBe("new-instance");
    await clearRuntime(projectDir, "new-instance");
    expect(await readRuntime(projectDir)).toBeNull();
  });
});
