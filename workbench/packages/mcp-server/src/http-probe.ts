import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.VISUALHYPER_MCP_HTTP_ENTRY
  ? path.resolve(process.env.VISUALHYPER_MCP_HTTP_ENTRY)
  : path.resolve(moduleDir, "http.ts");
const allowedProjectDir = await mkdtemp(path.join(tmpdir(), "visualhyper-http-allowed-"));
const outsideProjectDir = await mkdtemp(path.join(tmpdir(), "visualhyper-http-outside-"));
const token = randomBytes(32).toString("base64url");
const serverArgs = serverEntry.endsWith(".ts")
  ? [path.resolve(moduleDir, "../../../node_modules/tsx/dist/cli.mjs"), serverEntry]
  : [serverEntry];
const serverProcess = spawn(process.execPath, serverArgs, {
  env: {
    ...process.env,
    VISUALHYPER_HTTP_PORT: "0",
    VISUALHYPER_HTTP_TOKEN: token,
    VISUALHYPER_ALLOWED_PROJECT_DIR: allowedProjectDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
serverProcess.stderr.setEncoding("utf8");
serverProcess.stderr.on("data", (chunk) => { stderr += chunk; });

async function readEndpoint(): Promise<string> {
  serverProcess.stdout.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => reject(new Error(`VisualHyper HTTP bridge did not start. ${stderr}`)), 10_000);
    serverProcess.stdout.on("data", (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      try {
        const payload = JSON.parse(stdout.slice(0, newline)) as { endpoint?: string };
        if (!payload.endpoint) throw new Error("Bridge did not report an endpoint.");
        resolve(payload.endpoint);
      } catch (error) {
        reject(error);
      }
    });
    serverProcess.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`VisualHyper HTTP bridge exited with code ${code}. ${stderr}`));
    });
  });
}

const client = new Client({ name: "visualhyper-http-probe", version: "0.1.0" });

try {
  const endpoint = await readEndpoint();
  const wrongPath = new URL(endpoint);
  wrongPath.pathname = `/mcp/${randomBytes(32).toString("base64url")}`;
  const wrongPathStatus = await fetch(wrongPath, { method: "POST" }).then((response) => response.status);
  if (wrongPathStatus !== 404) throw new Error(`Expected secret-path request to return 404, received ${wrongPathStatus}.`);

  const clientTransport = new StreamableHTTPClientTransport(new URL(endpoint));
  await client.connect(clientTransport as Parameters<typeof client.connect>[0]);
  const listed = await client.listTools();
  const created = await client.callTool({
    name: "create_visualhyper_project",
    arguments: { projectDir: allowedProjectDir, title: "HTTP bridge probe" },
  });
  if (created.isError) throw new Error("Allowed project creation failed through the HTTP bridge.");

  const opened = await client.callTool({
    name: "open_visualhyper_panel",
    arguments: { projectDir: allowedProjectDir, displayMode: "fullscreen" },
  });
  const openedContent = opened.structuredContent as { rendering?: string } | undefined;
  if (openedContent?.rendering !== "native-widget") throw new Error("HTTP bridge did not return the native widget payload.");

  const widget = await client.readResource({ uri: "ui://widget/visualhyper/editor.html" });
  const widgetText = widget.contents[0] && "text" in widget.contents[0] ? widget.contents[0].text : "";
  if (!widgetText.includes("__VISUALHYPER_MCP_WIDGET__")) throw new Error("HTTP bridge did not return the inlined widget.");

  const outside = await client.callTool({
    name: "get_visualhyper_project",
    arguments: { projectDir: outsideProjectDir },
  });
  if (!outside.isError) throw new Error("HTTP bridge accepted a project outside the allowed root.");

  console.log(JSON.stringify({
    ok: true,
    endpoint,
    wrongPathStatus,
    toolCount: listed.tools.length,
    rendering: openedContent.rendering,
    widgetUri: widget.contents[0]?.uri,
    outsideProjectRejected: outside.isError === true,
  }, null, 2));
} finally {
  await client.close().catch(() => undefined);
  serverProcess.kill();
  await Promise.all([
    rm(allowedProjectDir, { recursive: true, force: true }),
    rm(outsideProjectDir, { recursive: true, force: true }),
  ]);
}
