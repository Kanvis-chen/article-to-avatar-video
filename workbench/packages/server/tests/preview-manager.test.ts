import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PreviewManager } from "../src/preview-manager.js";

const dirs: string[] = [];
const managers: PreviewManager[] = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stop()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "kanvis-preview-"));
  dirs.push(projectDir);
  await mkdir(path.join(projectDir, "assets"));
  await writeFile(path.join(projectDir, "index.html"), "<html>preview</html>");
  await writeFile(path.join(projectDir, "assets", "video.mp4"), Buffer.from("0123456789"));
  const manager = new PreviewManager();
  managers.push(manager);
  return { projectDir, session: await manager.start(projectDir) };
}

describe("PreviewManager", () => {
  it("serves byte ranges required by browser video playback", async () => {
    const { session } = await setup();
    const response = await fetch(`${session.url}assets/video.mp4`, { headers: { range: "bytes=2-5" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("2345");
  });

  it("does not expose files outside the preview project", async () => {
    const { session } = await setup();
    const response = await fetch(`${session.url}%2e%2e/%2e%2e/secret.txt`);
    expect(response.status).toBe(404);
  });

  it("injects the Kanvis control bridge without modifying the HyperFrames source", async () => {
    const { projectDir, session } = await setup();
    const page = await fetch(session.url);
    expect(await page.text()).toContain('<script src="/.kanvis/preview-bridge.js"></script>');
    const bridge = await fetch(`${session.url}.kanvis/preview-bridge.js`);
    expect(bridge.headers.get("content-type")).toContain("application/javascript");
    const bridgeSource = await bridge.text();
    expect(bridgeSource).toContain("KANVIS_PREVIEW_LAYER_DRAFT");
    expect(bridgeSource).toContain("KANVIS_PREVIEW_SYNC_LAYERS");
    expect(bridgeSource).toContain("kanvisResolveLayerTarget");
    expect(bridgeSource).toContain("data-editable-text");
    expect(bridgeSource).toContain("__KANVIS_SET_EDITABLE_TEXT__");
    expect(await readFile(path.join(projectDir, "index.html"), "utf8")).toBe("<html>preview</html>");
  });
});
