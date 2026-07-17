import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const runtimeDir = path.join(root, "dist");
const releaseRoot = path.join(root, "release");
const releaseDir = path.join(releaseRoot, "visualhyper-codex-panel");
const uiDistDir = path.join(root, "packages", "ui", "dist");

await mkdir(runtimeDir, { recursive: true });
await build({
  entryPoints: [path.join(root, "packages", "mcp-server", "src", "index.ts")],
  outfile: path.join(runtimeDir, "mcp-server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  legalComments: "external",
});

await build({
  entryPoints: [path.join(root, "packages", "mcp-server", "src", "http.ts")],
  outfile: path.join(runtimeDir, "mcp-http-server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  legalComments: "external",
});

const uiIndexFile = path.join(uiDistDir, "index.html");
const uiIndexHtml = await readFile(uiIndexFile, "utf8");
const scriptMatch = uiIndexHtml.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/i);
const styleMatch = uiIndexHtml.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/i)
  ?? uiIndexHtml.match(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="stylesheet"[^>]*>/i);
if (!scriptMatch?.[1] || !styleMatch?.[1]) {
  throw new Error("VisualHyper UI build did not contain the expected JavaScript and stylesheet assets.");
}
const assetFile = (href) => path.join(uiDistDir, href.replace(/^\/+/, ""));
const [uiScriptRaw, uiStylesRaw] = await Promise.all([
  readFile(assetFile(scriptMatch[1]), "utf8"),
  readFile(assetFile(styleMatch[1]), "utf8"),
]);
const uiScript = uiScriptRaw
  .replace(/\/\/# sourceMappingURL=.*$/gm, "")
  .replaceAll("</script", "<\\/script")
  .replaceAll("</SCRIPT", "<\\/SCRIPT");
const uiStyles = uiStylesRaw.replaceAll("</style", "<\\/style").replaceAll("</STYLE", "<\\/STYLE");
const widgetHtml = uiIndexHtml
  .replace(scriptMatch[0], "")
  .replace(styleMatch[0], "")
  .replace("</head>", [
    `<style>${uiStyles}</style>`,
    "<script>window.__VISUALHYPER_MCP_WIDGET__=true;</script>",
    `<script type="module">${uiScript}</script>`,
    "</head>",
  ].join("\n"));
await writeFile(path.join(uiDistDir, "widget.html"), widgetHtml, "utf8");

await rm(releaseDir, { recursive: true, force: true });
await mkdir(path.join(releaseDir, "dist"), { recursive: true });
await mkdir(path.join(releaseDir, "packages", "ui"), { recursive: true });

const copies = [
  [path.join(root, ".codex-plugin"), path.join(releaseDir, ".codex-plugin")],
  [path.join(root, ".mcp.json"), path.join(releaseDir, ".mcp.json")],
  [path.join(root, "skills"), path.join(releaseDir, "skills")],
  [path.join(root, "LICENSE"), path.join(releaseDir, "LICENSE")],
  [path.join(runtimeDir, "mcp-server.mjs"), path.join(releaseDir, "dist", "mcp-server.mjs")],
  [path.join(runtimeDir, "mcp-server.mjs.map"), path.join(releaseDir, "dist", "mcp-server.mjs.map")],
  [path.join(runtimeDir, "mcp-http-server.mjs"), path.join(releaseDir, "dist", "mcp-http-server.mjs")],
  [path.join(runtimeDir, "mcp-http-server.mjs.map"), path.join(releaseDir, "dist", "mcp-http-server.mjs.map")],
  [uiDistDir, path.join(releaseDir, "packages", "ui", "dist")],
];

for (const [source, destination] of copies) {
  await cp(source, destination, { recursive: true, force: true });
}

const manifest = JSON.parse(await readFile(path.join(releaseDir, ".codex-plugin", "plugin.json"), "utf8"));
console.log(JSON.stringify({
  ok: true,
  name: manifest.name,
  version: manifest.version,
  releaseDir,
  mcpEntry: path.join(releaseDir, "dist", "mcp-server.mjs"),
  mcpHttpEntry: path.join(releaseDir, "dist", "mcp-http-server.mjs"),
  uiEntry: path.join(releaseDir, "packages", "ui", "dist", "index.html"),
}, null, 2));
