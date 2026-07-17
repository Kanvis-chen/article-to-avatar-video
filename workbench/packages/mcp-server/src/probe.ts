import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.VISUALHYPER_MCP_ENTRY
  ? path.resolve(process.env.VISUALHYPER_MCP_ENTRY)
  : path.resolve(moduleDir, "index.ts");
const projectDir = await mkdtemp(path.join(tmpdir(), "visualhyper-mcp-"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: serverEntry.endsWith(".ts")
    ? [path.resolve(moduleDir, "../../../node_modules/tsx/dist/cli.mjs"), serverEntry]
    : [serverEntry],
});
const client = new Client({ name: "visualhyper-probe", version: "0.1.0" });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const created = await client.callTool({
    name: "create_visualhyper_project",
    arguments: { projectDir, title: "MCP probe" },
  });
  const styleSkillResult = await client.callTool({
    name: "list_kanvis_style_skills",
    arguments: { projectDir, materialType: "avatar" },
  });
  const styleSkillContent = styleSkillResult.structuredContent as {
    styleSkills?: Array<{ id?: string; materialTypes?: string[]; source?: string }>;
  } | undefined;
  if (styleSkillContent?.styleSkills?.length !== 1
    || styleSkillContent.styleSkills[0]?.id !== "kanvis-avatar-explainer"
    || styleSkillContent.styleSkills[0]?.materialTypes?.[0] !== "avatar") {
    throw new Error("list_kanvis_style_skills did not return the safe filtered BYO avatar Skill.");
  }
  const opened = await client.callTool({
    name: "open_visualhyper_panel",
    arguments: { projectDir, displayMode: "fullscreen" },
  });
  const content = opened.structuredContent as {
    rendering?: string;
    preferredDisplayMode?: string;
    projectDir?: string;
  } | undefined;
  if (content?.rendering !== "native-widget" || content.preferredDisplayMode !== "fullscreen") {
    throw new Error("open_visualhyper_panel did not return the native fullscreen widget payload.");
  }
  const resources = await client.listResources();
  const widget = await client.readResource({ uri: "ui://widget/visualhyper/editor.html" });
  const widgetText = widget.contents[0] && "text" in widget.contents[0] ? widget.contents[0].text : "";
  if (!widgetText.includes("__VISUALHYPER_MCP_WIDGET__")) throw new Error("VisualHyper widget resource was not inlined.");
  if (/(?:src|href)="\/assets\//.test(widgetText) || /from"\.\/index-/.test(widgetText)) {
    throw new Error("VisualHyper widget still references external build chunks.");
  }

  const updated = await client.callTool({
    name: "apply_visualhyper_operations",
    arguments: {
      projectDir,
      baseRevision: 0,
      label: "MCP widget probe",
      operations: [{ type: "caption.update", captionId: "caption-01", text: "Widget probe" }],
    },
  });
  const updatedContent = updated.structuredContent as { revision?: number } | undefined;
  if (updatedContent?.revision !== 1) throw new Error("Widget operation did not increment the project revision.");

  const webFallback = await client.callTool({
    name: "open_visualhyper_web_panel",
    arguments: { projectDir },
  });
  const fallbackContent = webFallback.structuredContent as { url?: string; instanceId?: string } | undefined;
  if (!fallbackContent?.url || !fallbackContent.instanceId) throw new Error("Web fallback did not return a URL and instanceId.");
  const health = await fetch(new URL("/healthz", fallbackContent.url)).then((response) => response.json()) as { ok?: boolean };
  await fetch(new URL("/api/shutdown", fallbackContent.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instanceId: fallbackContent.instanceId }),
  });
  console.log(JSON.stringify({
    ok: !created.isError && health.ok === true,
    tools: listed.tools.map((tool) => tool.name),
    resources: resources.resources.map((resource) => resource.uri),
    rendering: content.rendering,
    displayMode: content.preferredDisplayMode,
    revision: updatedContent.revision,
    avatarStyleSkills: styleSkillContent.styleSkills.length,
    webFallbackUrl: fallbackContent.url,
  }, null, 2));
} finally {
  await client.close();
  await rm(projectDir, { recursive: true, force: true });
}
