import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.VISUALHYPER_MCP_REMOTE_ENDPOINT?.trim();
const projectDir = process.env.VISUALHYPER_ALLOWED_PROJECT_DIR?.trim();
if (!endpoint) throw new Error("VISUALHYPER_MCP_REMOTE_ENDPOINT is required.");
if (!projectDir) throw new Error("VISUALHYPER_ALLOWED_PROJECT_DIR is required.");

const client = new Client({ name: "visualhyper-remote-probe", version: "0.1.0" });

try {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  await client.connect(transport as Parameters<typeof client.connect>[0]);
  const tools = await client.listTools();
  const project = await client.callTool({
    name: "get_visualhyper_project",
    arguments: { projectDir },
  });
  if (project.isError) throw new Error("Remote bridge could not read the allowed VisualHyper project.");
  const widget = await client.readResource({ uri: "ui://widget/visualhyper/editor.html" });
  const widgetText = widget.contents[0] && "text" in widget.contents[0] ? widget.contents[0].text : "";
  if (!widgetText.includes("__VISUALHYPER_MCP_WIDGET__")) throw new Error("Remote bridge did not return the inlined widget.");
  console.log(JSON.stringify({
    ok: true,
    toolCount: tools.tools.length,
    widgetUri: widget.contents[0]?.uri,
    projectReadable: true,
  }, null, 2));
} finally {
  await client.close().catch(() => undefined);
}
