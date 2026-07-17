import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const projectDir = path.resolve(argument("--project", path.resolve(pluginRoot, "..")));
const bridgeEntry = path.resolve(argument(
  "--entry",
  path.join(pluginRoot, "release", "visualhyper-codex-panel", "dist", "mcp-http-server.mjs"),
));
const runtimeDir = path.join(projectDir, ".visualhyper");
const runtimeFile = path.join(runtimeDir, "app-bridge.json");
const cloudflaredPath = path.resolve(argument(
  "--cloudflared",
  path.join(runtimeDir, "bin", "cloudflared.exe"),
));

async function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ensureNoLiveBridge() {
  const current = await readFile(runtimeFile, "utf8")
    .then((value) => JSON.parse(value))
    .catch(() => null);
  if (current && await processExists(current.launcherPid)) {
    throw new Error(`VisualHyper App bridge is already running at ${current.publicEndpoint}.`);
  }
  await unlink(runtimeFile).catch(() => undefined);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("Could not reserve a local port for the VisualHyper App bridge.");
  return port;
}

async function waitForEndpoint(child) {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Local VisualHyper MCP bridge timed out. ${stderr}`)), 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      try {
        const payload = JSON.parse(stdout.slice(0, newline));
        if (!payload.endpoint) throw new Error("Local bridge did not report an endpoint.");
        resolve(payload.endpoint);
      } catch (error) {
        reject(error);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Local VisualHyper MCP bridge exited with code ${code}. ${stderr}`));
    });
  });
}

async function waitForTunnelUrl(child) {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Cloudflare Quick Tunnel timed out. ${output}`)), 30_000);
    const inspect = (chunk) => {
      output += chunk;
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (!match) return;
      clearTimeout(timer);
      resolve(match[0]);
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Cloudflare Quick Tunnel exited with code ${code}. ${output}`));
    });
  });
}

await ensureNoLiveBridge();
await mkdir(runtimeDir, { recursive: true });

const port = await freePort();
const token = randomBytes(32).toString("base64url");
const child = spawn(process.execPath, [bridgeEntry], {
  env: {
    ...process.env,
    VISUALHYPER_HTTP_HOST: "127.0.0.1",
    VISUALHYPER_HTTP_PORT: String(port),
    VISUALHYPER_HTTP_TOKEN: token,
    VISUALHYPER_ALLOWED_PROJECT_DIR: projectDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let tunnelProcess;
let closing = false;
const cleanup = async () => {
  if (closing) return;
  closing = true;
  if (tunnelProcess && await processExists(tunnelProcess.pid)) tunnelProcess.kill();
  if (await processExists(child.pid)) child.kill();
  await unlink(runtimeFile).catch(() => undefined);
};

try {
  const localEndpoint = await waitForEndpoint(child);
  tunnelProcess = spawn(cloudflaredPath, [
    "tunnel",
    "--no-autoupdate",
    "--url",
    `http://127.0.0.1:${port}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const tunnelUrl = await waitForTunnelUrl(tunnelProcess);
  const publicEndpoint = `${tunnelUrl}${new URL(localEndpoint).pathname}`;
  const runtime = {
    version: 1,
    launcherPid: process.pid,
    serverPid: child.pid,
    tunnelPid: tunnelProcess.pid,
    tunnelProvider: "cloudflare-quick-tunnel",
    startedAt: new Date().toISOString(),
    projectDir,
    localEndpoint,
    publicEndpoint,
  };
  await writeFile(runtimeFile, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, runtimeFile, ...runtime }));

  tunnelProcess.once("exit", (code) => {
    if (!closing) console.error(`Cloudflare Quick Tunnel exited with code ${code}.`);
    void cleanup().finally(() => process.exit(code ?? 1));
  });
  child.once("exit", (code) => {
    if (!closing) console.error(`VisualHyper local MCP bridge exited with code ${code}.`);
    void cleanup().finally(() => process.exit(code ?? 1));
  });
  process.once("SIGINT", () => { void cleanup().finally(() => process.exit(0)); });
  process.once("SIGTERM", () => { void cleanup().finally(() => process.exit(0)); });
} catch (error) {
  await cleanup();
  throw error;
}
