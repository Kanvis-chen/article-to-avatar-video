import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ArtifactStore, PreviewManager, WorkflowRegistry } from "../packages/server/dist/index.js";
import { renderHyperFramesProject, verifyRenderedVideo } from "../packages/hyperframes-adapter/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const fixture = path.join(root, "fixtures", "hyperframes", "kanvis-e2e");

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false, windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

const npx = process.platform === "win32" ? process.execPath : "npx";
const npxPrefix = process.platform === "win32" ? [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js")] : [];
for (const command of ["lint", "check"]) {
  await run(npx, [...npxPrefix, "--yes", "hyperframes", command, fixture, "--json"]);
}

const workflow = (await new WorkflowRegistry(root).list()).find((item) => item.manifest.id === "kanvis-e2e-custom");
if (!workflow || workflow.source !== "project" || !workflow.capability.available) throw new Error("Project-local workflow was not registered.");

const store = new ArtifactStore(fixture);
const original = await store.load();
if (!original) throw new Error("E2E artifact is missing.");
const editedTitle = `Kanvis 参数化验收 ${Date.now()}`;
const edited = await store.updateParameter({ baseRevision: original.artifact.editRevision, parameterId: "title", value: editedTitle });
if (edited.artifact.capabilities.editableParameters[0]?.value !== editedTitle) throw new Error("Parameter edit did not persist.");
const undone = await store.undoEdit();
if (undone.artifact.capabilities.editableParameters[0]?.value !== original.artifact.capabilities.editableParameters[0]?.value) throw new Error("Parameter undo failed.");
await store.redoEdit();

const preview = new PreviewManager();
const previewSession = await preview.start(fixture);
const previewResponse = await fetch(previewSession.url);
if (!previewResponse.ok) throw new Error(`Preview returned ${previewResponse.status}.`);
await preview.stop();

const renders = path.join(fixture, "renders");
await mkdir(renders, { recursive: true });
const verified = [];
for (let index = 1; index <= 3; index += 1) {
  const outputFile = path.join(renders, `e2e-${index}.mp4`);
  await renderHyperFramesProject({
    projectDir: fixture,
    outputFile,
    quality: "draft",
    fps: 24,
    variables: { title: `Kanvis E2E ${index}`, captions: true, pace: 1, style: index === 2 ? "mono" : "mint" },
  });
  verified.push(await verifyRenderedVideo(outputFile));
}

const current = await store.load();
if (!current) throw new Error("E2E artifact disappeared.");
await store.write({
  ...current.artifact,
  status: "rendered",
  outputs: [
    { kind: "project", relativePath: "." },
    ...verified.map((video) => ({ kind: "video", relativePath: path.relative(fixture, video.filePath).split(path.sep).join("/"), mimeType: "video/mp4" })),
  ],
  updatedAt: new Date().toISOString(),
});

await writeFile(path.join(root, "release-e2e-result.json"), `${JSON.stringify({ ok: true, workflow: workflow.manifest.id, preview: true, renders: verified }, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, workflow: workflow.manifest.id, preview: true, renders: verified.map(({ filePath, ...rest }) => ({ file: path.basename(filePath), ...rest })) }, null, 2));
