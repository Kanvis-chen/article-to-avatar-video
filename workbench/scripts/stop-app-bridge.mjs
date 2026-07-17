import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const projectDir = path.resolve(argument("--project", path.resolve(pluginRoot, "..")));
const runtimeFile = path.join(projectDir, ".visualhyper", "app-bridge.json");
const runtime = await readFile(runtimeFile, "utf8")
  .then((value) => JSON.parse(value))
  .catch(() => null);

if (!runtime?.launcherPid) {
  console.log(JSON.stringify({ ok: true, stopped: false, reason: "not_running" }));
  process.exit(0);
}

try {
  process.kill(runtime.launcherPid, "SIGTERM");
} catch (error) {
  if (error?.code !== "ESRCH") throw error;
}
await unlink(runtimeFile).catch(() => undefined);
console.log(JSON.stringify({ ok: true, stopped: true, launcherPid: runtime.launcherPid }));
