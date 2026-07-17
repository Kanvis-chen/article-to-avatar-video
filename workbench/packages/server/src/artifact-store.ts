import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deleteArtifactLayer,
  redoArtifactEdit,
  RevisionConflictError,
  splitArtifactLayer,
  undoArtifactEdit,
  updateArtifactLayer,
  updateArtifactParameter,
  visualArtifactSchema,
  type EditableParameterValue,
  type EditableLayerPatch,
  type VisualArtifact,
} from "@visualhyper/core";
import { writeLayoutOverrides } from "@visualhyper/hyperframes-adapter";

import { assertPathInside } from "./paths.js";

const MAX_ARTIFACT_BYTES = 1024 * 1024;
export const DEFAULT_ARTIFACT_FILE = "visualhyper.artifact.json";

export type ResolvedArtifact = {
  artifact: VisualArtifact;
  artifactFile: string;
  engineProjectDir: string;
  outputs: Array<VisualArtifact["outputs"][number] & { absolutePath: string }>;
};

export class ArtifactStore {
  readonly projectDir: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
  }

  async load(fileName = DEFAULT_ARTIFACT_FILE): Promise<ResolvedArtifact | null> {
    if (fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
      throw new Error("Artifact file must be a file name inside the project root.");
    }
    const artifactFile = assertPathInside(this.projectDir, path.join(this.projectDir, fileName));
    const info = await stat(artifactFile).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) return null;
    if (!info.isFile()) throw new Error(`Artifact path is not a file: ${artifactFile}`);
    if (info.size > MAX_ARTIFACT_BYTES) throw new Error(`Artifact exceeds ${MAX_ARTIFACT_BYTES} bytes.`);

    const artifact = visualArtifactSchema.parse(JSON.parse(await readFile(artifactFile, "utf8")));
    const engineProjectDir = assertPathInside(
      this.projectDir,
      path.isAbsolute(artifact.projectDir) ? artifact.projectDir : path.join(this.projectDir, artifact.projectDir),
    );
    const outputs = artifact.outputs.map((output) => ({
      ...output,
      absolutePath: assertPathInside(
        this.projectDir,
        path.isAbsolute(output.relativePath)
          ? output.relativePath
          : path.join(engineProjectDir, output.relativePath),
      ),
    }));
    return { artifact, artifactFile, engineProjectDir, outputs };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = current;
    return current;
  }

  private async writeNow(artifactInput: VisualArtifact, fileName = DEFAULT_ARTIFACT_FILE): Promise<ResolvedArtifact> {
    const artifact = visualArtifactSchema.parse(artifactInput);
    if (fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
      throw new Error("Artifact file must be a file name inside the project root.");
    }
    const artifactFile = assertPathInside(this.projectDir, path.join(this.projectDir, fileName));
    await mkdir(path.dirname(artifactFile), { recursive: true });
    const temporary = `${artifactFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporary, artifactFile);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    const loaded = await this.load(fileName);
    if (!loaded) throw new Error("Artifact disappeared after write.");
    return loaded;
  }

  async write(artifactInput: VisualArtifact, fileName = DEFAULT_ARTIFACT_FILE): Promise<ResolvedArtifact> {
    return this.enqueue(() => this.writeNow(artifactInput, fileName));
  }

  async update(update: (artifact: VisualArtifact) => VisualArtifact, fileName = DEFAULT_ARTIFACT_FILE): Promise<ResolvedArtifact> {
    return this.enqueue(async () => {
      const current = await this.load(fileName);
      if (!current) throw new Error("No Kanvis artifact is available to update.");
      return this.writeNow(update(current.artifact), fileName);
    });
  }

  async updateParameter(input: { baseRevision: number; parameterId: string; value: EditableParameterValue }): Promise<ResolvedArtifact> {
    return this.update((artifact) => updateArtifactParameter({ artifact, ...input }));
  }

  private async writeLayerOverrides(current: ResolvedArtifact, next: VisualArtifact): Promise<void> {
    let writeback = (current.artifact as VisualArtifact & { layoutWriteback?: { relativePath: string } }).layoutWriteback;
    if (!writeback) {
      const declarationFile = assertPathInside(this.projectDir, path.join(this.projectDir, ".visualhyper", "layout-writeback.json"));
      const declaration = JSON.parse(await readFile(declarationFile, "utf8")) as { artifactId?: unknown; relativePath?: unknown };
      if (declaration.artifactId !== current.artifact.artifactId || typeof declaration.relativePath !== "string") {
        throw new Error("Layout writeback declaration does not match the current artifact.");
      }
      writeback = { relativePath: declaration.relativePath };
    }
    await writeLayoutOverrides({ projectDir: current.engineProjectDir, target: writeback.relativePath, editRevision: next.editRevision, layers: next.editableLayers });
  }

  async updateLayer(input: { baseRevision: number; layerId: string; patch: EditableLayerPatch }): Promise<ResolvedArtifact> {
    return this.enqueue(async () => {
      const current = await this.load();
      if (!current) throw new Error("No Kanvis artifact is available to update.");
      if (input.baseRevision !== current.artifact.editRevision) {
        throw new RevisionConflictError(input.baseRevision, current.artifact.editRevision);
      }
      const next = updateArtifactLayer({ artifact: current.artifact, ...input });
      await this.writeLayerOverrides(current, next);
      return this.writeNow(next);
    });
  }

  async splitLayer(input: { baseRevision: number; layerId: string; splitFrame: number }): Promise<ResolvedArtifact> {
    return this.enqueue(async () => {
      const current = await this.load();
      if (!current) throw new Error("No Kanvis artifact is available to update.");
      if (input.baseRevision !== current.artifact.editRevision) {
        throw new RevisionConflictError(input.baseRevision, current.artifact.editRevision);
      }
      const next = splitArtifactLayer({ artifact: current.artifact, ...input });
      await this.writeLayerOverrides(current, next);
      return this.writeNow(next);
    });
  }

  async deleteLayer(input: { baseRevision: number; layerId: string }): Promise<ResolvedArtifact> {
    return this.enqueue(async () => {
      const current = await this.load();
      if (!current) throw new Error("No Kanvis artifact is available to update.");
      if (input.baseRevision !== current.artifact.editRevision) {
        throw new RevisionConflictError(input.baseRevision, current.artifact.editRevision);
      }
      const next = deleteArtifactLayer({ artifact: current.artifact, ...input });
      await this.writeLayerOverrides(current, next);
      return this.writeNow(next);
    });
  }

  async undoEdit(): Promise<ResolvedArtifact> {
    return this.enqueue(async () => {
      const current = await this.load();
      if (!current) throw new Error("No Kanvis artifact is available to update.");
      const next = undoArtifactEdit(current.artifact);
      if (next.editableLayers.length) await this.writeLayerOverrides(current, next);
      return this.writeNow(next);
    });
  }

  async redoEdit(): Promise<ResolvedArtifact> {
    return this.enqueue(async () => {
      const current = await this.load();
      if (!current) throw new Error("No Kanvis artifact is available to update.");
      const next = redoArtifactEdit(current.artifact);
      if (next.editableLayers.length) await this.writeLayerOverrides(current, next);
      return this.writeNow(next);
    });
  }
}
