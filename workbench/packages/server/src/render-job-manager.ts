import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { Job, VisualArtifact } from "@visualhyper/core";
import {
  inspectHyperFramesProject,
  renderHyperFramesProject,
  verifyRenderedVideo,
  type HyperFramesInspection,
  type VerifiedVideo,
} from "@visualhyper/hyperframes-adapter";

import { ArtifactStore } from "./artifact-store.js";
import { assertPathInside } from "./paths.js";
import { ProjectStore } from "./project-store.js";

export type RenderExecutor = {
  inspect: (projectDir: string, signal?: AbortSignal) => Promise<HyperFramesInspection>;
  render: (input: {
    projectDir: string;
    outputFile: string;
    quality: "draft" | "standard" | "high";
    variables?: Record<string, string | number | boolean>;
    signal?: AbortSignal;
    onOutput?: (stream: "stdout" | "stderr", text: string) => void;
  }) => Promise<unknown>;
  verify: (filePath: string, signal?: AbortSignal) => Promise<VerifiedVideo>;
};

const defaultExecutor: RenderExecutor = {
  inspect: inspectHyperFramesProject,
  render: renderHyperFramesProject,
  verify: verifyRenderedVideo,
};

export class RenderJobManager {
  private readonly projectStore: ProjectStore;
  private readonly artifactStore: ArtifactStore;
  private readonly executor: RenderExecutor;
  private readonly controllers = new Map<string, AbortController>();
  private readonly runs = new Map<string, Promise<Job>>();

  constructor(input: { projectStore: ProjectStore; artifactStore: ArtifactStore; executor?: RenderExecutor }) {
    this.projectStore = input.projectStore;
    this.artifactStore = input.artifactStore;
    this.executor = input.executor ?? defaultExecutor;
  }

  async recover(): Promise<void> {
    await this.projectStore.recoverInterruptedJobs();
    const project = await this.projectStore.load();
    const hasActiveRender = project.jobs.some((job) => job.type === "render" && ["queued", "running"].includes(job.status));
    const resolved = await this.artifactStore.load();
    if (resolved?.artifact.status === "rendering" && !hasActiveRender) {
      await this.artifactStore.update((artifact) => ({ ...artifact, status: "preview-ready", updatedAt: new Date().toISOString() }));
    }
  }

  async start(quality: "draft" | "standard" | "high" = "high"): Promise<Job> {
    if (this.controllers.size > 0) throw new Error("A Kanvis render is already running for this project.");
    const resolved = await this.artifactStore.load();
    if (!resolved) throw new Error("No Kanvis video project is available to render.");
    if (!resolved.artifact.capabilities.render) throw new Error("This video project does not support rendering.");
    if (!resolved.artifact.compositionId) throw new Error("The video project has no HyperFrames composition id.");

    const jobId = `render-${randomUUID()}`;
    // Artifact output paths are resolved relative to the native engine project.
    // Keep renders inside that directory so persisted paths never need `..`.
    const outputDir = assertPathInside(
      this.projectStore.projectDir,
      path.join(resolved.engineProjectDir, ".visualhyper", "renders"),
    );
    await mkdir(outputDir, { recursive: true });
    const outputFile = assertPathInside(outputDir, path.join(outputDir, `${resolved.artifact.artifactId}-r${resolved.artifact.sourceRevision}.mp4`));
    const job: Job = {
      id: jobId,
      type: "render",
      status: "queued",
      progress: 0,
      message: "等待渲染",
      artifactId: resolved.artifact.artifactId,
      outputFile,
    };
    await this.projectStore.upsertJob(job);
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    const run = this.run(job, resolved.artifact, resolved.engineProjectDir, outputFile, quality, controller)
      .finally(() => {
        this.controllers.delete(jobId);
        this.runs.delete(jobId);
      });
    this.runs.set(jobId, run);
    return job;
  }

  async wait(jobId: string): Promise<Job | undefined> {
    return this.runs.get(jobId);
  }

  async cancel(jobId: string): Promise<boolean> {
    const controller = this.controllers.get(jobId);
    if (!controller) return false;
    controller.abort(new Error("用户取消了渲染。"));
    return true;
  }

  private async run(
    queued: Job,
    sourceArtifact: VisualArtifact,
    engineProjectDir: string,
    outputFile: string,
    quality: "draft" | "standard" | "high",
    controller: AbortController,
  ): Promise<Job> {
    const startedAt = new Date().toISOString();
    let job: Job = { ...queued, status: "running", progress: 0.05, message: "检查 HyperFrames 项目", startedAt };
    await this.projectStore.upsertJob(job);
    try {
      const inspection = await this.executor.inspect(engineProjectDir, controller.signal);
      if (!inspection.ok) throw new Error("HyperFrames lint、validate 或 inspect 未通过。请先修复项目错误。");
      job = { ...job, progress: 0.18, message: "正在渲染视频" };
      await this.projectStore.upsertJob(job);
      await this.artifactStore.update((current) => {
        if (current.editRevision !== sourceArtifact.editRevision) return current;
        const { error: _previousError, ...withoutError } = current;
        return { ...withoutError, status: "rendering", updatedAt: new Date().toISOString() };
      });
      let persistedProgress = 0.18;
      await this.executor.render({
        projectDir: engineProjectDir,
        outputFile,
        quality,
        variables: Object.fromEntries(
          sourceArtifact.capabilities.editableParameters
            .filter((parameter) => parameter.value !== null && parameter.type !== "asset")
            .map((parameter) => [parameter.id, parameter.value as string | number | boolean]),
        ),
        signal: controller.signal,
        onOutput: (_stream, text) => {
          const matches = [...text.matchAll(/(\d{1,3})%/g)];
          const percent = Number(matches.at(-1)?.[1]);
          if (!Number.isFinite(percent)) return;
          const progress = Math.min(0.9, 0.18 + percent / 100 * 0.72);
          if (progress - persistedProgress < 0.1) return;
          persistedProgress = progress;
          job = { ...job, progress, message: `正在渲染视频 · ${percent}%` };
          void this.projectStore.upsertJob(job);
        },
      });
      job = { ...job, progress: 0.93, message: "正在验证输出" };
      await this.projectStore.upsertJob(job);
      const verified = await this.executor.verify(outputFile, controller.signal);
      const relativeOutput = path.relative(engineProjectDir, verified.filePath).split(path.sep).join("/");
      let currentRender = true;
      await this.artifactStore.update((current) => {
        currentRender = current.editRevision === sourceArtifact.editRevision;
        if (!currentRender) return { ...current, status: "preview-ready", updatedAt: new Date().toISOString() };
        return {
          ...current,
          status: "rendered",
          outputs: [
            ...current.outputs.filter((output) => output.kind !== "video"),
            { kind: "video" as const, relativePath: relativeOutput, mimeType: "video/mp4" },
          ],
          updatedAt: new Date().toISOString(),
        };
      });
      job = { ...job, status: "succeeded", progress: 1, message: currentRender
        ? `视频已导出 · ${verified.durationSeconds.toFixed(1)} 秒`
        : `视频已导出但布局已更新，输出已标记过期 · ${verified.durationSeconds.toFixed(1)} 秒`, finishedAt: new Date().toISOString() };
      await this.projectStore.upsertJob(job);
      return job;
    } catch (error) {
      const canceled = controller.signal.aborted;
      job = {
        ...job,
        status: canceled ? "canceled" : "failed",
        message: canceled ? "渲染已取消" : "渲染失败",
        finishedAt: new Date().toISOString(),
        error: {
          code: canceled ? "RENDER_CANCELED" : "RENDER_FAILED",
          message: error instanceof Error ? error.message : String(error),
          recovery: canceled ? "可以随时重新渲染。" : "检查项目验证结果后重新渲染。",
        },
      };
      await this.projectStore.upsertJob(job);
      await this.artifactStore.update((current) => current.editRevision !== sourceArtifact.editRevision ? current : ({
        ...current,
        status: canceled ? "preview-ready" : "failed",
        ...(canceled ? {} : { error: job.error }),
        updatedAt: new Date().toISOString(),
      }));
      return job;
    }
  }
}
