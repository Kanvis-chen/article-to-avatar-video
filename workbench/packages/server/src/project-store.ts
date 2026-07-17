import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applyProjectOperations,
  createVisualHyperProject,
  redoProject,
  interruptRunningJobs,
  upsertProjectJob,
  undoProject,
  visualHyperProjectSchema,
  type ProjectOperation,
  type Job,
  type VisualHyperProject,
} from "@visualhyper/core";

import { canonicalProjectDir, projectFileFor } from "./paths.js";

const writeQueues = new Map<string, Promise<unknown>>();

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  writeQueues.set(key, current);
  const cleanup = () => {
    if (writeQueues.get(key) === current) writeQueues.delete(key);
  };
  void current.then(cleanup, cleanup);
  return current;
}

export class ProjectStore {
  readonly projectDir: string;
  readonly projectFile: string;

  private constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.projectFile = projectFileFor(projectDir);
  }

  static async open(projectDir: string): Promise<ProjectStore> {
    return new ProjectStore(await canonicalProjectDir(projectDir));
  }

  async exists(): Promise<boolean> {
    return readFile(this.projectFile).then(() => true).catch(() => false);
  }

  async create(input: { title?: string; overwrite?: boolean } = {}): Promise<VisualHyperProject> {
    return enqueue(this.projectFile, async () => {
      if (!input.overwrite && await this.exists()) return this.load();
      const project = createVisualHyperProject(input.title ? { title: input.title } : {});
      await atomicWriteJson(this.projectFile, project);
      return project;
    });
  }

  async load(): Promise<VisualHyperProject> {
    const raw = await readFile(this.projectFile, "utf8");
    return visualHyperProjectSchema.parse(JSON.parse(raw));
  }

  async apply(input: { baseRevision: number; operations: ProjectOperation[]; label?: string }): Promise<VisualHyperProject> {
    return enqueue(this.projectFile, async () => {
      const current = await this.load();
      const result = applyProjectOperations(current, input).project;
      await atomicWriteJson(this.projectFile, result);
      return result;
    });
  }

  async undo(): Promise<VisualHyperProject> {
    return enqueue(this.projectFile, async () => {
      const project = undoProject(await this.load());
      await atomicWriteJson(this.projectFile, project);
      return project;
    });
  }

  async redo(): Promise<VisualHyperProject> {
    return enqueue(this.projectFile, async () => {
      const project = redoProject(await this.load());
      await atomicWriteJson(this.projectFile, project);
      return project;
    });
  }

  async upsertJob(job: Job): Promise<VisualHyperProject> {
    return enqueue(this.projectFile, async () => {
      const project = upsertProjectJob(await this.load(), job);
      await atomicWriteJson(this.projectFile, project);
      return project;
    });
  }

  async recoverInterruptedJobs(): Promise<VisualHyperProject> {
    return enqueue(this.projectFile, async () => {
      const current = await this.load();
      const project = interruptRunningJobs(current);
      if (project !== current) await atomicWriteJson(this.projectFile, project);
      return project;
    });
  }
}
