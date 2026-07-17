import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { runtimeFileFor } from "./paths.js";

const runtimeSchema = z.object({
  pid: z.number().int().positive(),
  instanceId: z.string().min(1),
  projectDir: z.string().min(1),
  projectFile: z.string().min(1),
  url: z.string().url(),
  startedAt: z.string(),
});

export type PanelRuntime = z.infer<typeof runtimeSchema>;

export async function writeRuntime(runtime: PanelRuntime): Promise<void> {
  const file = runtimeFileFor(runtime.projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(runtime, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try { await rename(temporary, file); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

export async function readRuntime(projectDir: string): Promise<PanelRuntime | null> {
  try {
    return runtimeSchema.parse(JSON.parse(await readFile(runtimeFileFor(projectDir), "utf8")));
  } catch {
    return null;
  }
}

export async function clearRuntime(projectDir: string, expectedInstanceId?: string): Promise<void> {
  if (expectedInstanceId) {
    const current = await readRuntime(projectDir);
    if (!current || current.instanceId !== expectedInstanceId) return;
  }
  await rm(runtimeFileFor(projectDir), { force: true });
}

export async function probeRuntime(runtime: PanelRuntime): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(new URL("/healthz", runtime.url), { signal: controller.signal });
    if (!response.ok) return false;
    const body = await response.json() as { instanceId?: string };
    return body.instanceId === runtime.instanceId;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
