import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http, { type Server } from "node:http";
import net from "node:net";
import path from "node:path";

import { injectPreviewBridge, PREVIEW_BRIDGE_PATH, PREVIEW_BRIDGE_SOURCE } from "./preview-bridge.js";

export type PreviewSession = { url: string; port: number; projectDir: string; startedAt: string };

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
};

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a preview port.");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function controlledFile(projectDir: string, url: string | undefined): string | null {
  const pathname = decodeURIComponent(new URL(url ?? "/", "http://127.0.0.1").pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(projectDir, requested);
  const relative = path.relative(projectDir, file);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : file;
}

export class PreviewManager {
  private server: Server | null = null;
  private session: PreviewSession | null = null;

  current(): PreviewSession | null { return this.session; }

  async start(projectDirInput: string): Promise<PreviewSession> {
    const projectDir = path.resolve(projectDirInput);
    if (this.server && this.session?.projectDir === projectDir) return this.session;
    await this.stop();
    const port = await reservePort();
    const server = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (requestUrl.pathname === PREVIEW_BRIDGE_PATH) {
          const body = Buffer.from(PREVIEW_BRIDGE_SOURCE, "utf8");
          response.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "content-length": body.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
          if (request.method === "HEAD") response.end(); else response.end(body);
          return;
        }
        const file = controlledFile(projectDir, request.url);
        const info = file ? await stat(file).catch(() => null) : null;
        if (!file || !info?.isFile()) { response.writeHead(404); response.end("Not found"); return; }
        const mime = contentTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream";
        const range = request.headers.range;
        if (!range && path.extname(file).toLowerCase() === ".html") {
          const body = Buffer.from(injectPreviewBridge(await readFile(file, "utf8")), "utf8");
          response.writeHead(200, { "content-type": mime, "content-length": body.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
          if (request.method === "HEAD") response.end(); else response.end(body);
          return;
        }
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          const start = match?.[1] ? Number(match[1]) : 0;
          const end = match?.[2] ? Number(match[2]) : info.size - 1;
          if (!match || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= info.size) {
            response.writeHead(416, { "content-range": `bytes */${info.size}` }); response.end(); return;
          }
          response.writeHead(206, { "content-type": mime, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${info.size}`, "content-length": end - start + 1, "cache-control": "no-store" });
          if (request.method === "HEAD") response.end(); else createReadStream(file, { start, end }).pipe(response);
          return;
        }
        response.writeHead(200, { "content-type": mime, "accept-ranges": "bytes", "content-length": info.size, "cache-control": "no-store", "x-content-type-options": "nosniff" });
        if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
      } catch (error) {
        response.writeHead(500); response.end(error instanceof Error ? error.message : "Preview failed");
      }
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
    this.server = server;
    this.session = { url: `http://127.0.0.1:${port}/`, port, projectDir, startedAt: new Date().toISOString() };
    server.once("close", () => { if (this.server === server) { this.server = null; this.session = null; } });
    return this.session;
  }

  async stop(): Promise<void> {
    const server = this.server; this.server = null; this.session = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
