import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import type {
  CreationMode,
  EditableLayerPatch,
  EditableParameterValue,
  Job,
  ProjectOperation,
  VisualArtifact,
  VisualHyperProject,
  WorkflowInputValues,
  StyleSkillSummary,
} from "@visualhyper/core";

export type ResolvedArtifactClient = {
  artifact: VisualArtifact;
  artifactFile: string;
  engineProjectDir: string;
  outputs: Array<VisualArtifact["outputs"][number] & { absolutePath: string }>;
};
export type PreviewSessionClient = { url: string; port: number; projectDir: string; startedAt: string };

type VisualHyperToolResult = {
  isError?: boolean;
  structuredContent?: {
    project?: VisualHyperProject;
    projectDir?: string;
    preferredDisplayMode?: "fullscreen" | "inline";
    [key: string]: unknown;
  };
};

let mcpSession: { app: McpApp; projectDir: string } | null = null;

export function configureMcpSession(app: McpApp, projectDir: string): void {
  mcpSession = { app, projectDir };
}

export function isMcpSession(): boolean {
  return mcpSession !== null;
}

export async function sendMessageToCodex(prompt: string): Promise<void> {
  if (!mcpSession) throw new Error("当前视图不是 Codex 原生工作区。");
  const result = await mcpSession.app.sendMessage({
    role: "user",
    content: [{
      type: "text",
      text: `请使用 Kanvis/VisualHyper 的结构化工具和已注册视频 Skill，在项目 ${mcpSession.projectDir} 中完成以下任务。\n${prompt}`,
    }],
  });
  if (result.isError) throw new Error("Codex 拒绝了这条修改指令。");
}

export function payloadFromToolResult(result: unknown): VisualHyperToolResult["structuredContent"] | null {
  if (!result || typeof result !== "object") return null;
  const toolResult = result as VisualHyperToolResult;
  return toolResult.structuredContent ?? null;
}

async function callMcpTool(name: string, argumentsValue: Record<string, unknown>): Promise<VisualHyperToolResult> {
  if (!mcpSession) throw new Error("VisualHyper MCP widget session is not ready.");
  const result = await mcpSession.app.callServerTool({ name, arguments: argumentsValue }) as VisualHyperToolResult;
  if (result.isError) throw new Error(`VisualHyper tool ${name} failed.`);
  return result;
}

function projectFromToolResult(result: VisualHyperToolResult): VisualHyperProject {
  const project = result.structuredContent?.project;
  if (!project) throw new Error("VisualHyper tool did not return the current project.");
  return project;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string; code?: string };
    const error = new Error(body.error ?? `Request failed with ${response.status}.`) as Error & {
      code?: string | undefined;
      status?: number | undefined;
    };
    error.code = body.code;
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export function getProject(): Promise<VisualHyperProject> {
  if (mcpSession) {
    return callMcpTool("get_visualhyper_project", { projectDir: mcpSession.projectDir }).then(projectFromToolResult);
  }
  return jsonRequest<VisualHyperProject>("/api/project");
}

export function styleSkillsUrl(materialType?: CreationMode): string {
  return `/api/style-skills${materialType ? `?materialType=${encodeURIComponent(materialType)}` : ""}`;
}

export function listStyleSkills(materialType?: CreationMode): Promise<StyleSkillSummary[]> {
  if (mcpSession) {
    return callMcpTool("list_kanvis_style_skills", { projectDir: mcpSession.projectDir, ...(materialType ? { materialType } : {}) })
      .then((result) => (result.structuredContent?.styleSkills ?? []) as StyleSkillSummary[]);
  }
  return jsonRequest<{ styleSkills: StyleSkillSummary[] }>(styleSkillsUrl(materialType)).then((result) => result.styleSkills);
}

export function importStyleSkill(skillDir: string, mode: CreationMode): Promise<StyleSkillSummary> {
  if (mcpSession) {
    return callMcpTool("import_kanvis_style_skill", { projectDir: mcpSession.projectDir, skillDir, mode })
      .then((result) => result.structuredContent?.styleSkill as StyleSkillSummary);
  }
  return jsonRequest<{ styleSkill: StyleSkillSummary }>("/api/style-skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillDir, mode }),
  }).then((result) => result.styleSkill);
}

export async function openExistingProject(projectDir: string): Promise<{ delegated: boolean; url?: string }> {
  if (mcpSession) {
    await sendMessageToCodex(`请使用 open_visualhyper_panel 打开已有 Kanvis 工程：${projectDir}\n这是从工作台“打开工程”入口发起的操作；请不要覆盖工程内容。`);
    return { delegated: true };
  }
  const result = await jsonRequest<{ url: string }>("/api/projects/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectDir }),
  });
  return { delegated: false, url: result.url };
}

export function getArtifact(): Promise<ResolvedArtifactClient | null> {
  if (mcpSession) {
    return callMcpTool("get_kanvis_artifact", { projectDir: mcpSession.projectDir })
      .then((result) => (result.structuredContent?.artifact ?? null) as ResolvedArtifactClient | null);
  }
  return jsonRequest<{ artifact: ResolvedArtifactClient | null }>("/api/artifact").then((result) => result.artifact);
}

export function startPreview(): Promise<PreviewSessionClient> {
  if (mcpSession) throw new Error("实时 composition 预览当前在本地 Web 工作台提供；Codex 原生面板可播放已验证成片。");
  return jsonRequest<{ preview: PreviewSessionClient }>("/api/preview", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }).then((result) => result.preview);
}

export function prepareWorkflow(workflowId: string, values: WorkflowInputValues): Promise<string> {
  if (mcpSession) {
    return callMcpTool("prepare_kanvis_workflow", { projectDir: mcpSession.projectDir, workflowId, values })
      .then((result) => {
        const prompt = result.structuredContent?.prompt;
        if (typeof prompt !== "string") throw new Error("Kanvis 没有返回可执行的任务提示。");
        return prompt;
      });
  }
  return jsonRequest<{ prompt: string }>("/api/workflow-prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId, values }),
  }).then((result) => result.prompt);
}

export function startRender(quality: "draft" | "standard" | "high" = "high"): Promise<Job> {
  if (mcpSession) {
    return callMcpTool("start_kanvis_render", { projectDir: mcpSession.projectDir, quality }).then((result) => {
      const job = result.structuredContent?.job as Job | undefined;
      if (!job) throw new Error("Kanvis 没有返回渲染任务。");
      return job;
    });
  }
  return jsonRequest<{ job: Job }>("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quality }),
  }).then((result) => result.job);
}

export function cancelRender(jobId: string): Promise<boolean> {
  if (mcpSession) {
    return callMcpTool("cancel_kanvis_render", { projectDir: mcpSession.projectDir, jobId })
      .then((result) => Boolean(result.structuredContent?.canceled));
  }
  return jsonRequest<{ canceled: boolean }>("/api/render/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId }),
  }).then((result) => result.canceled);
}

export function updateArtifactParameter(baseRevision: number, parameterId: string, value: EditableParameterValue): Promise<ResolvedArtifactClient> {
  if (mcpSession) {
    return callMcpTool("update_kanvis_parameter", { projectDir: mcpSession.projectDir, baseRevision, parameterId, value })
      .then((result) => result.structuredContent?.artifact as ResolvedArtifactClient);
  }
  return jsonRequest<{ artifact: ResolvedArtifactClient }>("/api/artifact/parameter", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision, parameterId, value }),
  }).then((result) => result.artifact);
}

export function updateArtifactLayer(baseRevision: number, layerId: string, patch: EditableLayerPatch): Promise<ResolvedArtifactClient> {
  if (mcpSession) {
    return callMcpTool("update_kanvis_layer", { projectDir: mcpSession.projectDir, baseRevision, layerId, patch })
      .then((result) => result.structuredContent?.artifact as ResolvedArtifactClient);
  }
  return jsonRequest<{ artifact: ResolvedArtifactClient }>("/api/artifact/layer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, layerId, patch }),
  }).then((result) => result.artifact);
}

export function splitArtifactLayer(baseRevision: number, layerId: string, splitFrame: number): Promise<ResolvedArtifactClient> {
  if (mcpSession) {
    return callMcpTool("split_kanvis_layer", { projectDir: mcpSession.projectDir, baseRevision, layerId, splitFrame })
      .then((result) => result.structuredContent?.artifact as ResolvedArtifactClient);
  }
  return jsonRequest<{ artifact: ResolvedArtifactClient }>("/api/artifact/layer/split", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, layerId, splitFrame }),
  }).then((result) => result.artifact);
}

export function deleteArtifactLayer(baseRevision: number, layerId: string): Promise<ResolvedArtifactClient> {
  if (mcpSession) {
    return callMcpTool("delete_kanvis_layer", { projectDir: mcpSession.projectDir, baseRevision, layerId })
      .then((result) => result.structuredContent?.artifact as ResolvedArtifactClient);
  }
  return jsonRequest<{ artifact: ResolvedArtifactClient }>("/api/artifact/layer/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, layerId }),
  }).then((result) => result.artifact);
}

export function undoArtifactEdit(): Promise<ResolvedArtifactClient> {
  if (mcpSession) return callMcpTool("undo_kanvis_artifact_edit", { projectDir: mcpSession.projectDir }).then((result) => result.structuredContent?.artifact as ResolvedArtifactClient);
  return jsonRequest<{ artifact: ResolvedArtifactClient }>("/api/artifact/undo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((result) => result.artifact);
}

export function redoArtifactEdit(): Promise<ResolvedArtifactClient> {
  if (mcpSession) return callMcpTool("redo_kanvis_artifact_edit", { projectDir: mcpSession.projectDir }).then((result) => result.structuredContent?.artifact as ResolvedArtifactClient);
  return jsonRequest<{ artifact: ResolvedArtifactClient }>("/api/artifact/redo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((result) => result.artifact);
}

export function applyOperations(input: {
  baseRevision: number;
  label: string;
  operations: ProjectOperation[];
}): Promise<VisualHyperProject> {
  if (mcpSession) {
    return callMcpTool("apply_visualhyper_operations", {
      projectDir: mcpSession.projectDir,
      baseRevision: input.baseRevision,
      label: input.label,
      operations: input.operations,
    }).then(projectFromToolResult);
  }
  return jsonRequest<VisualHyperProject>("/api/operations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function undoProject(): Promise<VisualHyperProject> {
  if (mcpSession) {
    return callMcpTool("undo_visualhyper_project", { projectDir: mcpSession.projectDir }).then(projectFromToolResult);
  }
  return jsonRequest<VisualHyperProject>("/api/undo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export function redoProject(): Promise<VisualHyperProject> {
  if (mcpSession) {
    return callMcpTool("redo_visualhyper_project", { projectDir: mcpSession.projectDir }).then(projectFromToolResult);
  }
  return jsonRequest<VisualHyperProject>("/api/redo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}
