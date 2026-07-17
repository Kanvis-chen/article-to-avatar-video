import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DomainError, RevisionConflictError, applyOperationsInputSchema, buildWorkflowPrompt } from "@visualhyper/core";
import { z } from "zod";

import { ArtifactStore } from "./artifact-store.js";
import { ArtifactWatcher } from "./artifact-watcher.js";
import { assertPathInside, canonicalProjectDir } from "./paths.js";
import { ProjectStore } from "./project-store.js";
import { PreviewManager } from "./preview-manager.js";
import { RenderJobManager } from "./render-job-manager.js";
import { clearRuntime, probeRuntime, readRuntime, writeRuntime, type PanelRuntime } from "./runtime.js";
import { WorkflowRegistry } from "./workflow-registry.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultUiDir = [
  path.resolve(moduleDir, "../../ui/dist"),
  path.resolve(moduleDir, "../packages/ui/dist"),
].find((candidate) => existsSync(path.join(candidate, "index.html")))
  ?? path.resolve(moduleDir, "../../ui/dist");
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function serveArtifactOutput(request: IncomingMessage, response: ServerResponse, artifacts: ArtifactStore, index: number): Promise<void> {
  const resolved = await artifacts.load();
  const output = resolved?.outputs[index];
  if (!output) throw new DomainError("OUTPUT_NOT_FOUND", `Artifact output does not exist at index ${index}.`);
  const info = await stat(output.absolutePath);
  if (!info.isFile()) throw new DomainError("OUTPUT_NOT_FOUND", "Artifact output is not a file.");
  const range = request.headers.range;
  const mime = output.mimeType ?? contentTypes[path.extname(output.absolutePath).toLowerCase()] ?? "application/octet-stream";
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) throw new DomainError("INVALID_RANGE", "Invalid media byte range.");
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : info.size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= info.size) {
      response.writeHead(416, { "content-range": `bytes */${info.size}` }); response.end(); return;
    }
    response.writeHead(206, { "content-type": mime, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${info.size}`, "content-length": end - start + 1, "cache-control": "no-store" });
    createReadStream(output.absolutePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { "content-type": mime, "accept-ranges": "bytes", "content-length": info.size, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  createReadStream(output.absolutePath).pipe(response);
}

export type PanelHandle = {
  runtime: PanelRuntime;
  reused: boolean;
  close: () => Promise<void>;
};

const localPanels = new Map<string, PanelHandle>();

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new DomainError("REQUEST_TOO_LARGE", `Request exceeds ${maxBytes} bytes.`);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requireLocalWrite(request: IncomingMessage, origin: string): void {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new DomainError("UNSUPPORTED_MEDIA_TYPE", "Write requests require application/json.");
  }
  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== origin) throw new DomainError("INVALID_ORIGIN", "Cross-origin write request rejected.");
  const fetchSite = String(request.headers["sec-fetch-site"] ?? "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new DomainError("INVALID_FETCH_SITE", "Cross-site write request rejected.");
  }
}

async function serveStatic(response: ServerResponse, uiDir: string, pathname: string): Promise<void> {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  let candidate: string;
  try {
    candidate = assertPathInside(uiDir, path.join(uiDir, requested));
  } catch {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  let info = await stat(candidate).catch(() => null);
  if (!info?.isFile() && !path.extname(requested)) {
    candidate = path.join(uiDir, "index.html");
    info = await stat(candidate).catch(() => null);
  }
  if (!info?.isFile()) {
    sendJson(response, 503, { error: "VisualHyper UI has not been built. Run pnpm build." });
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[path.extname(candidate).toLowerCase()] ?? "application/octet-stream",
    "cache-control": candidate.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' http://127.0.0.1:* blob:; font-src 'self' data:; frame-src http://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  });
  createReadStream(candidate).pipe(response);
}

export async function startPanelServer(options: { projectDir: string; port?: number; uiDir?: string }): Promise<PanelHandle> {
  const projectDir = await canonicalProjectDir(options.projectDir);
  const store = await ProjectStore.open(projectDir);
  if (!await store.exists()) await store.create();
  const workflows = new WorkflowRegistry(projectDir);
  const artifacts = new ArtifactStore(projectDir);
  const renderJobs = new RenderJobManager({ projectStore: store, artifactStore: artifacts });
  const previews = new PreviewManager();
  await renderJobs.recover();
  const instanceId = randomUUID();
  const uiDir = options.uiDir ?? defaultUiDir;
  const eventClients = new Set<ServerResponse>();
  const artifactWatcher = new ArtifactWatcher({
    store: artifacts,
    onUpdate: (artifact) => {
      for (const client of eventClients) {
        client.write(`event: artifact\ndata: ${JSON.stringify({
          artifactId: artifact.artifact.artifactId,
          sourceRevision: artifact.artifact.sourceRevision,
          status: artifact.artifact.status,
        })}\n\n`);
      }
    },
    onError: (error) => {
      for (const client of eventClients) client.write(`event: artifact-error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
    },
  });
  let baseUrl = "";

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://visualhyper.local");
      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { ok: true, instanceId, projectDir, projectFile: store.projectFile });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/project") {
        sendJson(response, 200, await store.load());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/assets") {
        sendJson(response, 200, { assets: (await store.load()).assets });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workflows") {
        const mode = url.searchParams.get("mode") ?? undefined;
        if (mode && !["animation", "avatar", "footage"].includes(mode)) throw new DomainError("INVALID_MODE", `Unknown creation mode: ${mode}`);
        sendJson(response, 200, { workflows: await workflows.list(mode as "animation" | "avatar" | "footage" | undefined) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/style-skills") {
        const materialType = url.searchParams.get("materialType") ?? undefined;
        if (materialType && !["animation", "avatar", "footage"].includes(materialType)) {
          throw new DomainError("INVALID_MATERIAL_TYPE", `Unknown material type: ${materialType}`);
        }
        sendJson(response, 200, {
          styleSkills: await workflows.listStyleSkills(materialType as "animation" | "avatar" | "footage" | undefined),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/style-skills/import") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({
          skillDir: z.string().min(1).max(2_048),
          mode: z.enum(["animation", "avatar", "footage"]).default("avatar"),
        }).strict().parse(await readJson(request));
        const imported = await workflows.importStyleSkill(input.skillDir, input.mode);
        const summary = (await workflows.listStyleSkills(input.mode)).find((entry) => entry.workflowId === imported.manifest.id);
        if (!summary) throw new DomainError("STYLE_SKILL_IMPORT_FAILED", "Imported Style Skill was not registered.");
        sendJson(response, 201, { styleSkill: summary });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/projects/open") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({ projectDir: z.string().min(1).max(2_048) }).strict().parse(await readJson(request));
        const targetDir = await canonicalProjectDir(input.projectDir).catch(() => {
          throw new DomainError("INVALID_PROJECT_DIR", `工程文件夹不存在或无法访问：${path.resolve(input.projectDir)}`);
        });
        const hasProject = await Promise.all([
          stat(path.join(targetDir, "visualhyper.project.json")).then((info) => info.isFile()).catch(() => false),
          stat(path.join(targetDir, "visualhyper.artifact.json")).then((info) => info.isFile()).catch(() => false),
        ]).then((results) => results.some(Boolean));
        if (!hasProject) throw new DomainError("NOT_A_KANVIS_PROJECT", "该目录不是 Kanvis 工程：未找到 visualhyper.project.json 或 visualhyper.artifact.json。只有 MP4 时请作为扁平视频素材导入。");
        const panel = await openPanelForProject({ projectDir: targetDir, uiDir });
        sendJson(response, 200, { projectDir: panel.runtime.projectDir, url: panel.runtime.url, reused: panel.reused });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/artifact") {
        sendJson(response, 200, { artifact: await artifacts.load() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/preview") {
        sendJson(response, 200, { preview: previews.current() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/artifact-output") {
        const index = Number(url.searchParams.get("index"));
        if (!Number.isInteger(index) || index < 0 || index > 99) throw new DomainError("INVALID_OUTPUT_INDEX", "Output index must be between 0 and 99.");
        await serveArtifactOutput(request, response, artifacts, index);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        response.write(`event: connected\ndata: ${JSON.stringify({ instanceId })}\n\n`);
        eventClients.add(response);
        request.on("close", () => eventClients.delete(response));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/operations") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = applyOperationsInputSchema.parse(await readJson(request));
        const project = await store.apply(input);
        for (const client of eventClients) client.write(`event: project\ndata: ${JSON.stringify({ revision: project.revision })}\n\n`);
        sendJson(response, 200, project);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow-prompt") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({
          workflowId: z.string().min(1).max(64),
          values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
        }).strict().parse(await readJson(request));
        const registered = await workflows.get(input.workflowId);
        if (!registered) throw new DomainError("WORKFLOW_NOT_FOUND", `Workflow is not registered: ${input.workflowId}`);
        if (!registered.capability.available) throw new DomainError("WORKFLOW_UNAVAILABLE", registered.capability.message);
        sendJson(response, 200, {
          prompt: buildWorkflowPrompt({ manifest: registered.manifest, values: input.values, projectDir }),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/render") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({ quality: z.enum(["draft", "standard", "high"]).default("high") }).strict().parse(await readJson(request));
        const job = await renderJobs.start(input.quality);
        sendJson(response, 202, { job });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/preview") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        await readJson(request);
        const resolved = await artifacts.load();
        if (!resolved?.artifact.capabilities.preview) throw new DomainError("PREVIEW_UNAVAILABLE", "This video project does not support preview.");
        sendJson(response, 200, { preview: await previews.start(resolved.engineProjectDir) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/artifact/parameter") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({
          baseRevision: z.number().int().nonnegative(),
          parameterId: z.string().min(1),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
        }).strict().parse(await readJson(request));
        sendJson(response, 200, { artifact: await artifacts.updateParameter(input) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/artifact/layer") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({
          baseRevision: z.number().int().nonnegative(),
          layerId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
          patch: z.object({
            startFrame: z.number().int().nonnegative().optional(), durationFrames: z.number().int().positive().optional(),
            x: z.number().finite().optional(), y: z.number().finite().optional(),
            width: z.number().finite().nonnegative().optional(), height: z.number().finite().nonnegative().optional(),
            rotation: z.number().finite().optional(), opacity: z.number().finite().min(0).max(1).optional(),
            visible: z.boolean().optional(), locked: z.boolean().optional(),
            text: z.string().max(20_000).optional(),
          }).strict().refine((patch) => Object.keys(patch).length > 0, "Layer patch cannot be empty."),
        }).strict().parse(await readJson(request));
        sendJson(response, 200, { artifact: await artifacts.updateLayer(input) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/artifact/layer/split") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({
          baseRevision: z.number().int().nonnegative(),
          layerId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
          splitFrame: z.number().int().nonnegative(),
        }).strict().parse(await readJson(request));
        sendJson(response, 200, { artifact: await artifacts.splitLayer(input) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/artifact/layer/delete") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({
          baseRevision: z.number().int().nonnegative(),
          layerId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
        }).strict().parse(await readJson(request));
        sendJson(response, 200, { artifact: await artifacts.deleteLayer(input) });
        return;
      }
      if (request.method === "POST" && (url.pathname === "/api/artifact/undo" || url.pathname === "/api/artifact/redo")) {
        requireLocalWrite(request, new URL(baseUrl).origin);
        await readJson(request);
        sendJson(response, 200, { artifact: url.pathname.endsWith("undo") ? await artifacts.undoEdit() : await artifacts.redoEdit() });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/render/cancel") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const input = z.object({ jobId: z.string().min(1) }).strict().parse(await readJson(request));
        const canceled = await renderJobs.cancel(input.jobId);
        if (!canceled) throw new DomainError("JOB_NOT_RUNNING", `Render job is not running: ${input.jobId}`);
        sendJson(response, 202, { canceled: true, jobId: input.jobId });
        return;
      }
      if (request.method === "POST" && (url.pathname === "/api/undo" || url.pathname === "/api/redo")) {
        requireLocalWrite(request, new URL(baseUrl).origin);
        await readJson(request);
        const project = url.pathname.endsWith("undo") ? await store.undo() : await store.redo();
        for (const client of eventClients) client.write(`event: project\ndata: ${JSON.stringify({ revision: project.revision })}\n\n`);
        sendJson(response, 200, project);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/shutdown") {
        requireLocalWrite(request, new URL(baseUrl).origin);
        const body = await readJson(request) as { instanceId?: string };
        if (body.instanceId !== instanceId) throw new DomainError("INSTANCE_CHANGED", "Server instance changed; refresh status before stopping it.");
        sendJson(response, 200, { ok: true });
        setTimeout(() => server.close(), 25);
        return;
      }
      if (request.method === "GET") {
        await serveStatic(response, uiDir, url.pathname);
        return;
      }
      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      const status = error instanceof RevisionConflictError ? 409
        : error instanceof DomainError && error.code === "REQUEST_TOO_LARGE" ? 413
          : error instanceof DomainError && error.code === "UNSUPPORTED_MEDIA_TYPE" ? 415
            : error instanceof DomainError && ["INVALID_ORIGIN", "INVALID_FETCH_SITE"].includes(error.code) ? 403
              : 400;
      sendJson(response, status, {
        error: error instanceof Error ? error.message : "Unknown server error",
        code: error instanceof DomainError ? error.code : "BAD_REQUEST",
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  await artifactWatcher.start();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("VisualHyper server did not receive a TCP address.");
  baseUrl = `http://127.0.0.1:${address.port}/`;
  const runtime: PanelRuntime = {
    pid: process.pid,
    instanceId,
    projectDir,
    projectFile: store.projectFile,
    url: baseUrl,
    startedAt: new Date().toISOString(),
  };
  await writeRuntime(runtime);

  const close = async (): Promise<void> => {
    artifactWatcher.stop();
    await previews.stop();
    for (const client of eventClients) client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await clearRuntime(projectDir, instanceId);
    localPanels.delete(projectDir);
  };
  const handle: PanelHandle = { runtime, reused: false, close };
  server.once("close", () => {
    artifactWatcher.stop();
    void previews.stop();
    void clearRuntime(projectDir, instanceId);
    localPanels.delete(projectDir);
  });
  localPanels.set(projectDir, handle);
  return handle;
}

export async function openPanelForProject(options: { projectDir: string; port?: number; uiDir?: string }): Promise<PanelHandle> {
  const projectDir = await canonicalProjectDir(options.projectDir);
  const local = localPanels.get(projectDir);
  if (local) return { ...local, reused: true };
  const runtime = await readRuntime(projectDir);
  if (runtime && await probeRuntime(runtime)) {
    return { runtime, reused: true, close: async () => { await stopPanelForProject(projectDir); } };
  }
  if (runtime) await clearRuntime(projectDir, runtime.instanceId);
  return startPanelServer({ ...options, projectDir });
}

export async function getPanelStatus(projectDirInput: string): Promise<PanelRuntime | null> {
  const projectDir = await canonicalProjectDir(projectDirInput);
  const runtime = await readRuntime(projectDir);
  if (!runtime) return null;
  if (await probeRuntime(runtime)) return runtime;
  await clearRuntime(projectDir, runtime.instanceId);
  return null;
}

export async function stopPanelForProject(projectDirInput: string): Promise<boolean> {
  const projectDir = await canonicalProjectDir(projectDirInput);
  const local = localPanels.get(projectDir);
  if (local) {
    await local.close();
    return true;
  }
  const runtime = await readRuntime(projectDir);
  if (!runtime || !await probeRuntime(runtime)) {
    if (runtime) await clearRuntime(projectDir, runtime.instanceId);
    return false;
  }
  const response = await fetch(new URL("/api/shutdown", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instanceId: runtime.instanceId }),
  });
  if (!response.ok) throw new Error(`VisualHyper shutdown failed with ${response.status}.`);
  await clearRuntime(projectDir, runtime.instanceId);
  return true;
}
