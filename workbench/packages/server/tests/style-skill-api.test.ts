import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startPanelServer, type PanelHandle } from "../src/panel-server.js";

const temporaryDirectories: string[] = [];
const panels: PanelHandle[] = [];

afterEach(async () => {
  await Promise.all(panels.splice(0).map((panel) => panel.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Style Skill HTTP API", () => {
  it("lists safe summaries, filters material types, and rejects unknown filters", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kanvis-style-api-"));
    temporaryDirectories.push(root);
    const projectDir = path.join(root, "project");
    const uiDir = path.join(root, "ui");
    await mkdir(projectDir);
    await mkdir(uiDir);
    await writeFile(path.join(uiDir, "index.html"), "<!doctype html><title>test</title>");
    const panel = await startPanelServer({ projectDir, uiDir });
    panels.push(panel);

    const response = await fetch(new URL("/api/style-skills?materialType=avatar", panel.runtime.url));
    expect(response.status).toBe(200);
    const body = await response.json() as { styleSkills: Array<Record<string, unknown>> };
    expect(body.styleSkills).toHaveLength(1);
    expect(body.styleSkills[0]).toMatchObject({
      id: "kanvis-avatar-explainer",
      materialTypes: ["avatar"],
      source: "builtin",
      availability: { available: true, code: "ready" },
    });
    expect(JSON.stringify(body)).not.toContain("manifestFile");
    expect(JSON.stringify(body)).not.toContain("invocation");
    expect(JSON.stringify(body)).not.toContain("heygen");

    const invalid = await fetch(new URL("/api/style-skills?materialType=unknown", panel.runtime.url));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "INVALID_MATERIAL_TYPE" });

    const shell = await fetch(panel.runtime.url);
    expect(shell.headers.get("content-security-policy")).toContain("media-src 'self' http://127.0.0.1:* blob:");
    expect(shell.headers.get("content-security-policy")).toContain("object-src 'none'");
  });

  it("imports a local Style Skill through the same-origin API without exposing its path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kanvis-style-import-api-"));
    temporaryDirectories.push(root);
    const projectDir = path.join(root, "project");
    const skillDir = path.join(root, "style-skill");
    const uiDir = path.join(root, "ui");
    await mkdir(projectDir);
    await mkdir(skillDir);
    await mkdir(uiDir);
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: imported-avatar-style\ndescription: Imported avatar video style.\n---\n");
    await writeFile(path.join(uiDir, "index.html"), "<!doctype html><title>test</title>");
    const panel = await startPanelServer({ projectDir, uiDir });
    panels.push(panel);

    const response = await fetch(new URL("/api/style-skills/import", panel.runtime.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skillDir, mode: "avatar" }),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { styleSkill: Record<string, unknown> };
    expect(body.styleSkill).toMatchObject({ id: "imported-avatar-style", materialTypes: ["avatar"], source: "project" });
    expect(JSON.stringify(body)).not.toContain(skillDir);

    const invalid = await fetch(new URL("/api/style-skills/import", panel.runtime.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skillDir: path.join(root, "missing"), mode: "avatar" }),
    });
    expect(invalid.status).toBe(400);
  });
});
