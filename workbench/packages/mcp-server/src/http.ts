import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createVisualHyperMcpServer } from "./server.js";

const port = Number.parseInt(process.env.VISUALHYPER_HTTP_PORT ?? "8787", 10);
const host = process.env.VISUALHYPER_HTTP_HOST ?? "127.0.0.1";
const token = process.env.VISUALHYPER_HTTP_TOKEN?.trim();
const allowedProjectDir = process.env.VISUALHYPER_ALLOWED_PROJECT_DIR?.trim();

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error("VISUALHYPER_HTTP_PORT must be an integer between 0 and 65535.");
}
if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) {
  throw new Error("VISUALHYPER_HTTP_TOKEN must be a URL-safe secret with at least 32 characters.");
}
if (!allowedProjectDir) {
  throw new Error("VISUALHYPER_ALLOWED_PROJECT_DIR is required for the HTTPS App bridge.");
}
const allowedRoot = allowedProjectDir;

const mcpPath = `/mcp/${token}`;
const allowedMethods = new Set(["POST", "GET", "DELETE"]);

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

function respondJson(res: ServerResponse, status: number, value: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const server = createVisualHyperMcpServer({ allowedProjectDir: allowedRoot });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req, res);
}

const httpServer = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

  if (requestUrl.pathname === "/") {
    respondJson(res, 200, { ok: true, service: "visualhyper-app-bridge" });
    return;
  }

  if (requestUrl.pathname !== mcpPath) {
    respondJson(res, 404, { error: "not_found" });
    return;
  }

  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!req.method || !allowedMethods.has(req.method)) {
    respondJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    await handleMcpRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      respondJson(res, 500, { error: "mcp_request_failed" });
    } else {
      res.end();
    }
    console.error(error);
  }
});

httpServer.listen(port, host, () => {
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(JSON.stringify({
    ok: true,
    host,
    port: actualPort,
    endpoint: `http://${host}:${actualPort}${mcpPath}`,
    allowedProjectDir: allowedRoot,
  }));
});

const shutdown = () => {
  httpServer.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
