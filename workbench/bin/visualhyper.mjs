#!/usr/bin/env node
/**
 * Kanvis Studio - Workbench CLI
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const binFile = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(binFile), "..");
const serverEntry = path.join(pluginRoot, "packages", "server", "dist", "index.js");

function parseArgs(argv) {
  const result = { command: argv[2] ?? "status", projectDir: process.cwd(), noBrowser: false };
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === "--project" && argv[index + 1]) result.projectDir = path.resolve(argv[++index]);
    else if (argv[index] === "--no-browser") result.noBrowser = true;
  }
  return result;
}

async function requireBuiltServer() {
  try {
    await access(serverEntry);
  } catch {
    throw new Error("Kanvis Studio has not been built. Run pnpm install && pnpm build first.");
  }
  return import(pathToFileURL(serverEntry).href);
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function waitForStatus(getPanelStatus, projectDir, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await getPanelStatus(projectDir);
    if (status) return status;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Kanvis Studio did not become ready within ${timeoutMs}ms.`);
}

const options = parseArgs(process.argv);
const server = await requireBuiltServer();

if (options.command === "start" || options.command === "serve") {
  const handle = await server.openPanelForProject({ projectDir: options.projectDir });
  console.log(JSON.stringify({ ok: true, reused: handle.reused, ...handle.runtime }, null, 2));
  const close = async () => {
    await handle.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
} else if (options.command === "open") {
  let runtime = await server.getPanelStatus(options.projectDir);
  let reused = true;
  if (!runtime) {
    reused = false;
    const child = spawn(process.execPath, [binFile, "start", "--project", options.projectDir], {
      cwd: pluginRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    runtime = await waitForStatus(server.getPanelStatus, options.projectDir);
  }
  if (!options.noBrowser) openBrowser(runtime.url);
  console.log(JSON.stringify({ ok: true, reused, ...runtime }, null, 2));
} else if (options.command === "status") {
  const runtime = await server.getPanelStatus(options.projectDir);
  console.log(JSON.stringify(runtime ? { ok: true, running: true, ...runtime } : { ok: true, running: false }, null, 2));
} else if (options.command === "stop") {
  const stopped = await server.stopPanelForProject(options.projectDir);
  console.log(JSON.stringify({ ok: true, stopped }, null, 2));
} else {
  throw new Error(`Unknown Kanvis Studio command: ${options.command}`);
}
