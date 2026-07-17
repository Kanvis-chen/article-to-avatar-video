import { mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  builtinWorkflowManifests,
  workflowManifestSchema,
  type CreationMode,
  type WorkflowManifest,
  type WorkflowCapability,
  styleSkillSummarySchema,
  type StyleSkillSummary,
} from "@visualhyper/core";

import { assertPathInside } from "./paths.js";

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SKILL_BYTES = 512 * 1024;

export type RegisteredWorkflow = {
  manifest: WorkflowManifest;
  source: "builtin" | "project";
  manifestFile?: string;
  capability: WorkflowCapability;
};

async function capabilityFor(manifest: WorkflowManifest): Promise<WorkflowCapability> {
  if (manifest.skill.localPath) {
    const skillFile = path.join(manifest.skill.localPath, "SKILL.md");
    const info = await stat(skillFile).catch(() => null);
    if (!info?.isFile()) {
      return { available: false, code: "skill-missing", message: "本地 Skill 已移动或删除，请重新导入。" };
    }
  }
  if (manifest.provider === "heygen" && !process.env.HEYGEN_API_KEY) {
    return { available: false, code: "provider-unconfigured", message: "设置 HEYGEN_API_KEY 后可使用；也可以选择已有数字人视频流程。" };
  }
  return { available: true, code: "ready", message: "可以开始制作。" };
}

function readFrontmatter(source: string): { name: string; description: string } {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(normalized);
  if (!match) throw new Error("SKILL.md must start with YAML frontmatter.");
  const fields = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (pair) fields.set(pair[1]!.toLowerCase(), pair[2]!.trim().replace(/^(["'])(.*)\1$/, "$2"));
  }
  const name = fields.get("name") ?? "";
  const description = fields.get("description") ?? "";
  if (!name || !description) throw new Error("SKILL.md frontmatter requires name and description.");
  return { name, description };
}

function workflowIdForSkill(name: string): string {
  const id = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64).replace(/-$/g, "");
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error("Skill name cannot be converted to a valid Kanvis workflow ID.");
  return id;
}

function manifestForLocalSkill(input: { skillDir: string; name: string; description: string; mode: CreationMode }): WorkflowManifest {
  const common = {
    schemaVersion: "1" as const,
    id: workflowIdForSkill(input.name),
    displayName: input.name.slice(0, 100),
    description: input.description.slice(0, 500),
    version: "1.0.0",
    mode: input.mode,
    skill: { invocation: `$${input.name}`, localPath: input.skillDir },
    engine: "hyperframes" as const,
    artifactFile: "visualhyper.artifact.json",
  };
  if (input.mode === "avatar") return workflowManifestSchema.parse({
    ...common,
    provider: "bring-your-own",
    inputs: [
      { id: "article", type: "text", label: "公众号文章 / 长文", required: true, multiline: true, maxLength: 20_000, placeholder: "粘贴文章全文，或填写文章文件路径" },
      { id: "avatar-clip", type: "file", label: "数字人素材视频", required: false, accepts: ["video/*"] },
    ],
  });
  if (input.mode === "footage") return workflowManifestSchema.parse({
    ...common,
    processor: "talking-head",
    inputs: [
      { id: "footage", type: "file", label: "真人原始视频", required: true, accepts: ["video/*"] },
      { id: "brief", type: "text", label: "包装要求", required: false, multiline: true, maxLength: 4_000 },
    ],
  });
  return workflowManifestSchema.parse({
    ...common,
    inputs: [
      { id: "brief", type: "text", label: "视频内容", required: true, multiline: true, maxLength: 20_000 },
      { id: "assets", type: "file", label: "辅助素材", required: false, accepts: ["image/*", "video/*", "audio/*"], multiple: true },
    ],
  });
}

export class WorkflowRegistry {
  readonly projectDir: string;
  readonly workflowDir: string;

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
    this.workflowDir = path.join(this.projectDir, ".visualhyper", "workflows");
  }

  async list(mode?: CreationMode): Promise<RegisteredWorkflow[]> {
    const entries = new Map<string, RegisteredWorkflow>();
    for (const manifest of builtinWorkflowManifests) {
      entries.set(manifest.id, { manifest, source: "builtin", capability: await capabilityFor(manifest) });
    }

    const names = await readdir(this.workflowDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const name of names.sort()) {
      if (!name.endsWith(".json")) continue;
      const manifestFile = assertPathInside(this.workflowDir, path.join(this.workflowDir, name));
      const info = await stat(manifestFile);
      if (!info.isFile()) continue;
      if (info.size > MAX_MANIFEST_BYTES) throw new Error(`Workflow manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${name}`);
      const manifest = workflowManifestSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")));
      entries.set(manifest.id, { manifest, source: "project", manifestFile, capability: await capabilityFor(manifest) });
    }
    return [...entries.values()].filter((entry) => !mode || entry.manifest.mode === mode);
  }

  async get(id: string): Promise<RegisteredWorkflow | undefined> {
    return (await this.list()).find((entry) => entry.manifest.id === id);
  }

  async importStyleSkill(skillDirInput: string, mode: CreationMode = "avatar"): Promise<RegisteredWorkflow> {
    if (!path.isAbsolute(skillDirInput)) throw new Error("Style Skill directory must be an absolute path.");
    const skillDir = await realpath(path.resolve(skillDirInput)).catch(() => null);
    if (!skillDir) throw new Error(`Style Skill directory does not exist: ${path.resolve(skillDirInput)}`);
    const directoryInfo = await stat(skillDir);
    if (!directoryInfo.isDirectory()) throw new Error("Style Skill path must point to a directory.");
    const skillFile = path.join(skillDir, "SKILL.md");
    const skillInfo = await stat(skillFile).catch(() => null);
    if (!skillInfo?.isFile()) throw new Error("The selected directory does not contain SKILL.md.");
    if (skillInfo.size > MAX_SKILL_BYTES) throw new Error(`SKILL.md exceeds ${MAX_SKILL_BYTES} bytes.`);
    const metadata = readFrontmatter(await readFile(skillFile, "utf8"));
    const manifest = manifestForLocalSkill({ skillDir, mode, ...metadata });
    await mkdir(this.workflowDir, { recursive: true });
    const manifestFile = assertPathInside(this.workflowDir, path.join(this.workflowDir, `${manifest.id}.json`));
    const existing = await readFile(manifestFile, "utf8").then((value) => workflowManifestSchema.parse(JSON.parse(value))).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing && (!existing.skill.localPath || path.resolve(existing.skill.localPath) !== skillDir)) {
      throw new Error(`A different local Skill already uses workflow ID ${manifest.id}.`);
    }
    const temporary = `${manifestFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporary, manifestFile);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return { manifest, source: "project", manifestFile, capability: await capabilityFor(manifest) };
  }

  async listStyleSkills(mode?: CreationMode): Promise<StyleSkillSummary[]> {
    return (await this.list(mode)).map(({ manifest, source, capability }) => styleSkillSummarySchema.parse({
      id: manifest.id,
      workflowId: manifest.id,
      name: manifest.displayName,
      description: manifest.description,
      version: manifest.version,
      materialTypes: [manifest.mode],
      source,
      sourceLabel: source === "builtin" ? "Kanvis 内置" : "当前项目",
      availability: capability,
      inputs: manifest.inputs,
    }));
  }
}
