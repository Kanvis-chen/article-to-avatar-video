import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { buildWorkflowPrompt, editableLayerPatchSchema, projectOperationSchema } from "@visualhyper/core";
import { ArtifactStore, openPanelForProject, ProjectStore, RenderJobManager, WorkflowRegistry } from "@visualhyper/server";

const projectArgs = { projectDir: z.string().min(1).describe("Absolute path to the user's active project directory.") };
export const visualHyperWidgetUri = "ui://widget/visualhyper/editor.html";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const widgetFiles = [
  path.resolve(moduleDir, "../../ui/dist/widget.html"),
  path.resolve(moduleDir, "../packages/ui/dist/widget.html"),
];

function toolResult(message: string, structuredContent: Record<string, unknown>, meta?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent,
    ...(meta ? { _meta: meta } : {}),
  };
}

async function readWidgetHtml(): Promise<string> {
  const widgetFile = widgetFiles.find((candidate) => existsSync(candidate));
  if (!widgetFile) {
    throw new Error("VisualHyper widget has not been built. Run pnpm build:plugin.");
  }
  return readFile(widgetFile, "utf8");
}

export type VisualHyperMcpServerOptions = {
  allowedProjectDir?: string;
};

export function createVisualHyperMcpServer(options: VisualHyperMcpServerOptions = {}): McpServer {
  const allowedProjectDir = options.allowedProjectDir
    ? ProjectStore.open(options.allowedProjectDir).then((store) => store.projectDir)
    : null;
  const openStore = async (projectDir: string): Promise<ProjectStore> => {
    const store = await ProjectStore.open(projectDir);
    if (!allowedProjectDir) return store;
    const allowedRoot = await allowedProjectDir;
    const relative = path.relative(allowedRoot, store.projectDir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`VisualHyper App bridge only permits projects inside ${allowedRoot}.`);
    }
    return store;
  };
  const renderManagers = new Map<string, RenderJobManager>();
  const renderManagerFor = (store: ProjectStore): RenderJobManager => {
    const existing = renderManagers.get(store.projectDir);
    if (existing) return existing;
    const manager = new RenderJobManager({ projectStore: store, artifactStore: new ArtifactStore(store.projectDir) });
    renderManagers.set(store.projectDir, manager);
    return manager;
  };

  const server = new McpServer(
    { name: "visualhyper-codex-panel", version: "0.1.0" },
    {
      instructions:
        "Open and modify project-local VisualHyper workspaces. Read the current revision before editing, then apply structured operations. Do not edit generated HyperFrames HTML directly.",
    },
  );

  const resourceMeta = {
    ui: {
      prefersBorder: false,
      csp: {
        connectDomains: [] as string[],
        resourceDomains: [] as string[],
      },
    },
    "openai/widgetDescription": "VisualHyper project-local video workspace with scene, preview, inspector, and timeline editing.",
    "openai/widgetPrefersBorder": false,
    "openai/widgetCSP": {
      connect_domains: [] as string[],
      resource_domains: [] as string[],
    },
  };

  registerAppResource(
    server,
    "VisualHyper Editor",
    visualHyperWidgetUri,
    {
      title: "VisualHyper",
      description: "Native VisualHyper video editor for the active Codex project.",
      _meta: resourceMeta,
    },
    async () => ({
      contents: [{
        uri: visualHyperWidgetUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readWidgetHtml(),
        _meta: resourceMeta,
      }],
    }),
  );

  registerAppTool(
    server,
    "open_visualhyper_panel",
    {
      title: "Open VisualHyper",
      description: "Render the project-local VisualHyper editor directly inside Codex. Use fullscreen unless the user explicitly asks for an inline view.",
      inputSchema: {
        ...projectArgs,
        displayMode: z.enum(["fullscreen", "inline"]).default("fullscreen"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri: visualHyperWidgetUri, visibility: ["model", "app"] },
        "ui/resourceUri": visualHyperWidgetUri,
        "openai/outputTemplate": visualHyperWidgetUri,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening VisualHyper...",
        "openai/toolInvocation/invoked": "VisualHyper is ready",
      },
    },
    async ({ projectDir, displayMode }) => {
      const store = await openStore(projectDir);
      const project = await store.create();
      const payload = {
        version: 1,
        rendering: "native-widget",
        title: project.metadata.title,
        projectDir: store.projectDir,
        projectFile: store.projectFile,
        project: project as unknown as Record<string, unknown>,
        preferredDisplayMode: displayMode,
      };
      return toolResult("Rendered VisualHyper inside Codex.", payload, {
        "openai/outputTemplate": visualHyperWidgetUri,
        widgetData: payload,
      });
    },
  );

  server.registerTool(
    "open_visualhyper_web_panel",
    {
      title: "Open VisualHyper Web Fallback",
      description: "Start or reuse the loopback VisualHyper web panel for development or host fallback, and return its local URL.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const store = await openStore(projectDir);
      const panel = await openPanelForProject({ projectDir: store.projectDir });
      return toolResult(`VisualHyper web fallback is ready at ${panel.runtime.url}`, {
        url: panel.runtime.url,
        projectDir: panel.runtime.projectDir,
        projectFile: panel.runtime.projectFile,
        instanceId: panel.runtime.instanceId,
        reused: panel.reused,
        rendering: "loopback-web",
      });
    },
  );

  server.registerTool(
    "create_visualhyper_project",
    {
      title: "Create VisualHyper Project",
      description: "Create the M0/M1 project model in an existing project directory. Reuses an existing project unless overwrite is explicitly true.",
      inputSchema: {
        ...projectArgs,
        title: z.string().min(1).max(200).optional(),
        overwrite: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, title, overwrite }) => {
      const store = await openStore(projectDir);
      const project = await store.create({ ...(title ? { title } : {}), overwrite });
      return toolResult(`VisualHyper project ${project.projectId} is ready at revision ${project.revision}.`, {
        project: project as unknown as Record<string, unknown>,
        projectFile: store.projectFile,
      });
    },
  );

  server.registerTool(
    "get_visualhyper_project",
    {
      title: "Get VisualHyper Project",
      description: "Read the current VisualHyper project, including its revision, scenes, tracks, selection-ready element IDs, and workflow status.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const store = await openStore(projectDir);
      const project = await store.load();
      return toolResult(`VisualHyper project revision ${project.revision}.`, {
        project: project as unknown as Record<string, unknown>,
        projectFile: store.projectFile,
      });
    },
  );

  server.registerTool(
    "apply_visualhyper_operations",
    {
      title: "Apply VisualHyper Operations",
      description: "Atomically apply validated scene, timing, text, caption, asset, transform, or workflow status operations at a known base revision.",
      inputSchema: {
        ...projectArgs,
        baseRevision: z.number().int().nonnegative(),
        label: z.string().max(200).optional(),
        operations: z.array(projectOperationSchema).min(1).max(100),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir, baseRevision, label, operations }) => {
      const store = await openStore(projectDir);
      const project = await store.apply({ baseRevision, operations, ...(label ? { label } : {}) });
      return toolResult(`Applied ${operations.length} operation(s). Current revision: ${project.revision}.`, {
        project: project as unknown as Record<string, unknown>,
        revision: project.revision,
      });
    },
  );

  server.registerTool(
    "list_kanvis_workflows",
    {
      title: "List Kanvis Creation Workflows",
      description: "List validated built-in and project-local Kanvis workflows for animation, avatar, and真人 footage creation modes.",
      inputSchema: {
        ...projectArgs,
        mode: z.enum(["animation", "avatar", "footage"]).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, mode }) => {
      const store = await openStore(projectDir);
      const workflows = await new WorkflowRegistry(store.projectDir).list(mode);
      return toolResult(`Found ${workflows.length} Kanvis workflow(s).`, { workflows });
    },
  );

  server.registerTool(
    "list_kanvis_style_skills",
    {
      title: "List Kanvis Style Skills",
      description: "List safe creator-facing summaries of built-in and project-local Style Skills. Optionally filter by source material type.",
      inputSchema: {
        ...projectArgs,
        materialType: z.enum(["animation", "avatar", "footage"]).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, materialType }) => {
      const store = await openStore(projectDir);
      const styleSkills = await new WorkflowRegistry(store.projectDir).listStyleSkills(materialType);
      return toolResult(`Found ${styleSkills.length} Kanvis Style Skill(s).`, { styleSkills });
    },
  );

  server.registerTool(
    "import_kanvis_style_skill",
    {
      title: "Import Local Kanvis Style Skill",
      description: "Safely register a local SKILL.md as a project-local Kanvis creation workflow without executing the Skill during import.",
      inputSchema: {
        ...projectArgs,
        skillDir: z.string().min(1),
        mode: z.enum(["animation", "avatar", "footage"]).default("avatar"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, skillDir, mode }) => {
      const store = await openStore(projectDir);
      const registry = new WorkflowRegistry(store.projectDir);
      const imported = await registry.importStyleSkill(skillDir, mode);
      const styleSkill = (await registry.listStyleSkills(mode)).find((entry) => entry.workflowId === imported.manifest.id);
      if (!styleSkill) throw new Error("Imported Style Skill was not registered.");
      return toolResult(`Imported Kanvis Style Skill ${styleSkill.name}.`, { styleSkill });
    },
  );

  server.registerTool(
    "get_kanvis_artifact",
    {
      title: "Get Kanvis Video Project",
      description: "Read and validate the latest project-local Kanvis video artifact without embedding media bytes.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).load();
      return toolResult(artifact ? `Kanvis artifact ${artifact.artifact.artifactId} is ${artifact.artifact.status}.` : "No Kanvis artifact has been created yet.", { artifact });
    },
  );

  server.registerTool(
    "prepare_kanvis_workflow",
    {
      title: "Prepare Kanvis Creation Task",
      description: "Validate user inputs for a registered Kanvis workflow and return the exact prompt to send to the current Codex task. Does not execute a shell command or start another thread.",
      inputSchema: {
        ...projectArgs,
        workflowId: z.string().min(1).max(64),
        values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, workflowId, values }) => {
      const store = await openStore(projectDir);
      const registered = await new WorkflowRegistry(store.projectDir).get(workflowId);
      if (!registered) throw new Error(`Kanvis workflow is not registered: ${workflowId}`);
      if (!registered.capability.available) throw new Error(registered.capability.message);
      const prompt = buildWorkflowPrompt({ manifest: registered.manifest, values, projectDir: store.projectDir });
      return toolResult(`Kanvis workflow ${workflowId} is ready to send to the current task.`, { prompt, workflow: registered });
    },
  );

  server.registerTool(
    "update_kanvis_parameter",
    {
      title: "Update Kanvis Video Parameter",
      description: "Update one artifact-declared parameter without calling Codex or a generation provider. Uses optimistic artifact revision control.",
      inputSchema: {
        ...projectArgs,
        baseRevision: z.number().int().nonnegative(),
        parameterId: z.string().min(1),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir, baseRevision, parameterId, value }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).updateParameter({ baseRevision, parameterId, value });
      return toolResult(`Updated Kanvis parameter ${parameterId} at edit revision ${artifact.artifact.editRevision}.`, { artifact });
    },
  );

  server.registerTool(
    "update_kanvis_layer",
    {
      title: "Update Kanvis Video Layer",
      description: "Update one artifact-declared layer transform, visibility, lock state, or text without calling a generation provider.",
      inputSchema: {
        ...projectArgs,
        baseRevision: z.number().int().nonnegative(),
        layerId: z.string().min(1),
        patch: editableLayerPatchSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir, baseRevision, layerId, patch }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).updateLayer({ baseRevision, layerId, patch });
      return toolResult(`Updated Kanvis layer ${layerId} at edit revision ${artifact.artifact.editRevision}.`, { artifact });
    },
  );

  server.registerTool(
    "split_kanvis_layer",
    {
      title: "Split Kanvis Timeline Layer",
      description: "Split one timing-editable artifact layer at an interior playhead frame as one undoable revision.",
      inputSchema: {
        ...projectArgs,
        baseRevision: z.number().int().nonnegative(),
        layerId: z.string().min(1),
        splitFrame: z.number().int().nonnegative(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir, baseRevision, layerId, splitFrame }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).splitLayer({ baseRevision, layerId, splitFrame });
      return toolResult(`Split Kanvis layer ${layerId} at frame ${splitFrame}. Revision ${artifact.artifact.editRevision}.`, { artifact });
    },
  );

  server.registerTool(
    "delete_kanvis_layer",
    {
      title: "Delete Kanvis Timeline Layer",
      description: "Hide one unlocked artifact layer as an undoable timeline deletion without destroying its source data.",
      inputSchema: {
        ...projectArgs,
        baseRevision: z.number().int().nonnegative(),
        layerId: z.string().min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir, baseRevision, layerId }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).deleteLayer({ baseRevision, layerId });
      return toolResult(`Deleted Kanvis layer ${layerId}. Revision ${artifact.artifact.editRevision}.`, { artifact });
    },
  );

  server.registerTool(
    "undo_kanvis_artifact_edit",
    {
      title: "Undo Kanvis Parameter Edit",
      description: "Undo the latest no-token artifact parameter edit.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).undoEdit();
      return toolResult(`Undid Kanvis artifact edit. Revision ${artifact.artifact.editRevision}.`, { artifact });
    },
  );

  server.registerTool(
    "redo_kanvis_artifact_edit",
    {
      title: "Redo Kanvis Parameter Edit",
      description: "Redo the latest undone no-token artifact parameter edit.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const store = await openStore(projectDir);
      const artifact = await new ArtifactStore(store.projectDir).redoEdit();
      return toolResult(`Redid Kanvis artifact edit. Revision ${artifact.artifact.editRevision}.`, { artifact });
    },
  );

  server.registerTool(
    "start_kanvis_render",
    {
      title: "Render Kanvis Video",
      description: "Start a user-approved HyperFrames render for the current Kanvis artifact. The job verifies lint, runtime, layout, output existence, size, and ffprobe duration.",
      inputSchema: {
        ...projectArgs,
        quality: z.enum(["draft", "standard", "high"]).default("high"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir, quality }) => {
      const store = await openStore(projectDir);
      const job = await renderManagerFor(store).start(quality);
      return toolResult(`Kanvis render ${job.id} is queued.`, { job });
    },
  );

  server.registerTool(
    "cancel_kanvis_render",
    {
      title: "Cancel Kanvis Render",
      description: "Request cancellation of a render started by this MCP server process.",
      inputSchema: { ...projectArgs, jobId: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, jobId }) => {
      const store = await openStore(projectDir);
      const canceled = await renderManagerFor(store).cancel(jobId);
      return toolResult(canceled ? `Cancellation requested for ${jobId}.` : `Render ${jobId} is not running in this server instance.`, { canceled, jobId });
    },
  );

  server.registerTool(
    "list_visualhyper_assets",
    {
      title: "List VisualHyper Assets",
      description: "List project-local asset IDs and metadata without embedding media bytes in MCP output.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const project = await (await openStore(projectDir)).load();
      return toolResult(`Found ${project.assets.length} VisualHyper asset(s).`, { assets: project.assets as unknown as Record<string, unknown>[] });
    },
  );

  server.registerTool(
    "undo_visualhyper_project",
    {
      title: "Undo VisualHyper Project",
      description: "Undo the latest structured project operation batch.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const project = await (await openStore(projectDir)).undo();
      return toolResult(`Undo completed. Current revision: ${project.revision}.`, {
        project: project as unknown as Record<string, unknown>,
        revision: project.revision,
      });
    },
  );

  server.registerTool(
    "redo_visualhyper_project",
    {
      title: "Redo VisualHyper Project",
      description: "Redo the latest undone structured project operation batch.",
      inputSchema: projectArgs,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const project = await (await openStore(projectDir)).redo();
      return toolResult(`Redo completed. Current revision: ${project.revision}.`, {
        project: project as unknown as Record<string, unknown>,
        revision: project.revision,
      });
    },
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createVisualHyperMcpServer();
  await server.connect(new StdioServerTransport());
}
