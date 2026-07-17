import { watch, type FSWatcher } from "node:fs";

import { shouldAcceptArtifact } from "@visualhyper/core";

import { ArtifactStore, DEFAULT_ARTIFACT_FILE, type ResolvedArtifact } from "./artifact-store.js";

export type ArtifactWatcherOptions = {
  store: ArtifactStore;
  debounceMs?: number;
  onUpdate: (artifact: ResolvedArtifact) => void;
  onError?: (error: Error) => void;
};

export class ArtifactWatcher {
  private readonly options: ArtifactWatcherOptions;
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: ResolvedArtifact | null = null;

  constructor(options: ArtifactWatcherOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.watcher) return;
    await this.refresh();
    this.watcher = watch(this.options.store.projectDir, { persistent: false }, (_event, fileName) => {
      if (fileName?.toString() !== DEFAULT_ARTIFACT_FILE) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.refresh();
      }, this.options.debounceMs ?? 120);
    });
    this.watcher.on("error", (error) => this.options.onError?.(error));
  }

  async refresh(): Promise<ResolvedArtifact | null> {
    try {
      const incoming = await this.options.store.load();
      if (!incoming) return null;
      if (!shouldAcceptArtifact(this.current?.artifact, incoming.artifact)) return this.current;
      const changed = !this.current
        || incoming.artifact.sourceRevision !== this.current.artifact.sourceRevision
        || incoming.artifact.updatedAt !== this.current.artifact.updatedAt
        || incoming.artifact.status !== this.current.artifact.status;
      this.current = incoming;
      if (changed) this.options.onUpdate(incoming);
      return incoming;
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      return this.current;
    }
  }

  getCurrent(): ResolvedArtifact | null {
    return this.current;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
  }
}
