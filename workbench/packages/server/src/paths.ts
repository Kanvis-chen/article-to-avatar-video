import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { DomainError } from "@visualhyper/core";

export const PROJECT_FILE_NAME = "visualhyper.project.json";

export async function canonicalProjectDir(input: string): Promise<string> {
  if (!input || typeof input !== "string") throw new DomainError("INVALID_PROJECT_DIR", "projectDir is required.");
  const resolved = path.resolve(input);
  const info = await stat(resolved).catch(() => null);
  if (!info?.isDirectory()) throw new DomainError("INVALID_PROJECT_DIR", `Project directory does not exist: ${resolved}`);
  return realpath(resolved);
}

export function projectFileFor(projectDir: string): string {
  return path.join(projectDir, PROJECT_FILE_NAME);
}

export function runtimeFileFor(projectDir: string): string {
  return path.join(projectDir, ".visualhyper", "runtime.json");
}

export function assertPathInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DomainError("PATH_OUTSIDE_PROJECT", `Path is outside the project directory: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}
