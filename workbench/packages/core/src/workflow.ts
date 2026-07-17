import { z } from "zod";

export const creationModes = ["animation", "avatar", "footage"] as const;
export const creationModeSchema = z.enum(creationModes);
export type CreationMode = z.infer<typeof creationModeSchema>;

const identifierSchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/);
const relativeFileNameSchema = z.string()
  .min(1)
  .max(120)
  .refine((value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..", {
    message: "Expected a file name without path separators.",
  });

const textInputSchema = z.object({
  id: identifierSchema,
  type: z.literal("text"),
  label: z.string().min(1).max(80),
  required: z.boolean(),
  multiline: z.boolean().default(true),
  maxLength: z.number().int().min(1).max(20_000).default(4_000),
  placeholder: z.string().max(300).optional(),
}).strict();

const fileInputSchema = z.object({
  id: identifierSchema,
  type: z.literal("file"),
  label: z.string().min(1).max(80),
  required: z.boolean(),
  accepts: z.array(z.string().regex(/^(video|audio|image)\/[a-z0-9.+*-]+$/)).min(1).max(20),
  multiple: z.boolean().default(false),
}).strict();

const selectInputSchema = z.object({
  id: identifierSchema,
  type: z.literal("select"),
  label: z.string().min(1).max(80),
  required: z.boolean(),
  options: z.array(z.object({
    value: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
  }).strict()).min(1).max(100),
}).strict();

export const workflowInputSchema = z.discriminatedUnion("type", [textInputSchema, fileInputSchema, selectInputSchema]);
export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export const workflowManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  id: identifierSchema,
  displayName: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  mode: creationModeSchema,
  skill: z.object({
    invocation: z.string().min(1).max(200),
    localPath: z.string().min(1).max(2_048).refine((value) => /^(?:[a-zA-Z]:[\\/]|\/)/.test(value), "Local Skill path must be absolute.").optional(),
  }).strict(),
  engine: z.literal("hyperframes"),
  processor: z.enum(["talking-head"]).optional(),
  provider: z.enum(["bring-your-own", "heygen"]).optional(),
  inputs: z.array(workflowInputSchema).min(1).max(20),
  artifactFile: relativeFileNameSchema.default("visualhyper.artifact.json"),
}).strict().superRefine((manifest, context) => {
  const ids = new Set<string>();
  for (const input of manifest.inputs) {
    if (ids.has(input.id)) context.addIssue({ code: "custom", path: ["inputs"], message: `Duplicate input id: ${input.id}` });
    ids.add(input.id);
  }
  if (manifest.mode === "avatar" && !manifest.provider) {
    context.addIssue({ code: "custom", path: ["provider"], message: "Avatar workflows require a provider." });
  }
  if (manifest.mode === "footage" && manifest.processor !== "talking-head") {
    context.addIssue({ code: "custom", path: ["processor"], message: "Footage workflows require the talking-head processor." });
  }
  if (manifest.mode === "animation" && (manifest.processor || manifest.provider)) {
    context.addIssue({ code: "custom", path: ["mode"], message: "Animation workflows cannot declare a provider or processor." });
  }
});
export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;

export type WorkflowInputValues = Record<string, string | string[]>;

export type WorkflowCapability = {
  available: boolean;
  code: "ready" | "skill-missing" | "provider-missing" | "provider-unconfigured" | "processor-missing";
  message: string;
};

export function validateWorkflowInputValues(manifest: WorkflowManifest, values: WorkflowInputValues): string[] {
  const errors: string[] = [];
  for (const input of manifest.inputs) {
    const value = values[input.id];
    const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (input.required && empty) {
      errors.push(`${input.label}为必填项。`);
      continue;
    }
    if (input.type === "text" && typeof value === "string" && value.length > input.maxLength) {
      errors.push(`${input.label}不能超过 ${input.maxLength} 个字符。`);
    }
    if (input.type === "select" && typeof value === "string" && value && !input.options.some((option) => option.value === value)) {
      errors.push(`${input.label}包含无效选项。`);
    }
  }
  return errors;
}

export function buildWorkflowPrompt(input: {
  manifest: WorkflowManifest;
  values: WorkflowInputValues;
  projectDir: string;
}): string {
  const errors = validateWorkflowInputValues(input.manifest, input.values);
  if (errors.length) throw new Error(errors.join(" "));
  const fields = input.manifest.inputs.map((field) => {
    const value = input.values[field.id];
    const rendered = Array.isArray(value) ? value.join(", ") : value ?? "";
    return `- ${field.label} (${field.id}): ${rendered || "未提供"}`;
  });
  return [
    `请执行 Kanvis Workflow \`${input.manifest.id}\`。`,
    `制作方式：${input.manifest.mode}。`,
    `调用 Skill：${input.manifest.skill.invocation}。`,
    ...(input.manifest.skill.localPath ? [`本地 Skill 目录：${input.manifest.skill.localPath}。请先完整读取其中的 SKILL.md，再按该 Skill 执行。`] : []),
    `项目目录：${input.projectDir}。`,
    "用户输入：",
    ...fields,
    `请保留引擎原生工程，并在项目目录写入 ${input.manifest.artifactFile}。`,
    "Artifact 必须符合 Kanvis schema 1；不要把媒体编码进 JSON。",
  ].join("\n");
}

export const builtinWorkflowManifests: WorkflowManifest[] = [
  workflowManifestSchema.parse({
    schemaVersion: "1",
    id: "kanvis-motion-explainer",
    displayName: "纯动画视频",
    description: "从文字生成可预览、可微调的 HyperFrames 动画视频。",
    version: "1.0.0",
    mode: "animation",
    skill: { invocation: "$hyperframes" },
    engine: "hyperframes",
    inputs: [
      { id: "brief", type: "text", label: "视频内容", required: true, multiline: true, maxLength: 4_000 },
      { id: "assets", type: "file", label: "辅助素材", required: false, accepts: ["image/*", "video/*", "audio/*"], multiple: true },
    ],
    artifactFile: "visualhyper.artifact.json",
  }),
  workflowManifestSchema.parse({
    schemaVersion: "1",
    id: "kanvis-avatar-explainer",
    displayName: "动画 + 数字人",
    description: "合成数字人讲解与 HyperFrames 动画包装。",
    version: "1.0.0",
    mode: "avatar",
    skill: { invocation: "$hyperframes" },
    engine: "hyperframes",
    provider: "bring-your-own",
    inputs: [
      { id: "brief", type: "text", label: "视频内容", required: true },
      { id: "avatar-clip", type: "file", label: "数字人视频", required: true, accepts: ["video/*"] },
    ],
  }),
  workflowManifestSchema.parse({
    schemaVersion: "1",
    id: "kanvis-talking-head",
    displayName: "动画 + 真人素材",
    description: "为真人口播、访谈或课程视频添加字幕和动画包装。",
    version: "1.0.0",
    mode: "footage",
    skill: { invocation: "$talking-head-recut" },
    engine: "hyperframes",
    processor: "talking-head",
    inputs: [
      { id: "footage", type: "file", label: "真人原始视频", required: true, accepts: ["video/*"] },
      { id: "brief", type: "text", label: "包装要求", required: false },
    ],
  }),
];
