import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

async function executableExists(candidate: string): Promise<boolean> {
  return access(candidate).then(() => true).catch(() => false);
}

async function newestExecutableIn(root: string, executableName: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const candidate = path.join(root, entry.name, executableName);
      const info = await stat(candidate).catch(() => null);
      return info?.isFile() ? { candidate, modified: info.mtimeMs } : null;
    }));
  return candidates
    .filter((item): item is { candidate: string; modified: number } => item !== null)
    .sort((left, right) => right.modified - left.modified)[0]?.candidate ?? null;
}

export async function discoverCodexExecutable(): Promise<string> {
  const override = process.env.VISUALHYPER_CODEX_PATH;
  if (override) {
    const resolved = path.resolve(override);
    if (!await executableExists(resolved)) throw new Error(`VISUALHYPER_CODEX_PATH does not exist: ${resolved}`);
    return resolved;
  }

  const executableName = process.platform === "win32" ? "codex.exe" : "codex";
  for (const segment of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(segment, executableName);
    if (await executableExists(candidate)) return candidate;
  }

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const localCodexRoot = path.join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    const localCodex = await newestExecutableIn(localCodexRoot, "codex.exe");
    if (localCodex) return localCodex;
  }

  throw new Error("Codex CLI was not found. Set VISUALHYPER_CODEX_PATH to the Codex executable.");
}
