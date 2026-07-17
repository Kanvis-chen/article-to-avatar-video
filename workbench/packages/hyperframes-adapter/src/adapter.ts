import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { ffprobeExecutable, npxArguments, npxExecutable, runCommand, type CommandResult } from "./command.js";

export type HyperFramesQuality = "draft" | "standard" | "high";

export type HyperFramesCheck = {
  command: "lint" | "check";
  ok: boolean;
  output: unknown;
  stderr: string;
};

export type HyperFramesInspection = {
  ok: boolean;
  projectDir: string;
  checks: HyperFramesCheck[];
};

export type VerifiedVideo = {
  filePath: string;
  sizeBytes: number;
  durationSeconds: number;
  formatName: string;
};

function parseJsonOutput(output: string): unknown {
  const firstObject = output.indexOf("{");
  const firstArray = output.indexOf("[");
  const start = firstObject < 0 ? firstArray : firstArray < 0 ? firstObject : Math.min(firstObject, firstArray);
  const end = Math.max(output.lastIndexOf("}"), output.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("HyperFrames command did not return JSON.");
  return JSON.parse(output.slice(start, end + 1));
}

export function hyperFramesArgs(command: string, projectDir: string, extra: string[] = []): string[] {
  return ["--yes", "hyperframes", command, projectDir, ...extra];
}

async function runHyperFramesJson(command: HyperFramesCheck["command"], projectDir: string, signal?: AbortSignal): Promise<HyperFramesCheck> {
  const result = await runCommand(npxExecutable(), npxArguments(hyperFramesArgs(command, projectDir, ["--json"])), {
    cwd: projectDir,
    ...(signal ? { signal } : {}),
  });
  let output: unknown = null;
  try {
    output = parseJsonOutput(result.stdout);
  } catch {
    output = { raw: result.stdout.trim() };
  }
  return { command, ok: result.exitCode === 0, output, stderr: result.stderr.trim() };
}

export async function inspectHyperFramesProject(projectDirInput: string, signal?: AbortSignal): Promise<HyperFramesInspection> {
  const projectDir = path.resolve(projectDirInput);
  const entry = await stat(path.join(projectDir, "index.html")).catch(() => null);
  if (!entry?.isFile()) throw new Error(`HyperFrames project is missing index.html: ${projectDir}`);
  const checks: HyperFramesCheck[] = [];
  for (const command of ["lint", "check"] as const) {
    checks.push(await runHyperFramesJson(command, projectDir, signal));
    if (!checks.at(-1)?.ok) break;
  }
  return { ok: checks.every((check) => check.ok), projectDir, checks };
}

export async function renderHyperFramesProject(input: {
  projectDir: string;
  outputFile: string;
  quality?: HyperFramesQuality;
  fps?: 24 | 30 | 60;
  variables?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
  onOutput?: (stream: "stdout" | "stderr", text: string) => void;
}): Promise<CommandResult> {
  const projectDir = path.resolve(input.projectDir);
  const outputFile = path.resolve(input.outputFile);
  const renderTempDir = path.join(projectDir, ".visualhyper", "temp");
  await mkdir(renderTempDir, { recursive: true });
  const extra = [
    "--output", outputFile,
    "--quality", input.quality ?? "high",
    "--fps", String(input.fps ?? 30),
    "--strict",
  ];
  if (input.variables && Object.keys(input.variables).length > 0) {
    extra.push("--variables", JSON.stringify(input.variables), "--strict-variables");
  }
  const args = hyperFramesArgs("render", projectDir, extra);
  const result = await runCommand(npxExecutable(), npxArguments(args), {
    cwd: projectDir,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.onOutput ? { onOutput: input.onOutput } : {}),
    maxOutputBytes: 8 * 1024 * 1024,
    env: { TEMP: renderTempDir, TMP: renderTempDir, TMPDIR: renderTempDir },
  });
  if (result.exitCode !== 0) throw new Error(`HyperFrames render failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  return result;
}

export async function verifyRenderedVideo(filePathInput: string, signal?: AbortSignal): Promise<VerifiedVideo> {
  const filePath = path.resolve(filePathInput);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile() || info.size < 1_024) throw new Error(`Rendered video is missing or implausibly small: ${filePath}`);
  const result = await runCommand(ffprobeExecutable(), [
    "-v", "error",
    "-show_entries", "format=duration,format_name",
    "-of", "json",
    filePath,
  ], { cwd: path.dirname(filePath), ...(signal ? { signal } : {}) });
  if (result.exitCode !== 0) throw new Error(`ffprobe could not decode rendered video: ${result.stderr.trim()}`);
  const parsed = parseJsonOutput(result.stdout) as { format?: { duration?: string; format_name?: string } };
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Rendered video has no positive duration.");
  return { filePath, sizeBytes: info.size, durationSeconds, formatName: parsed.format?.format_name ?? "unknown" };
}
