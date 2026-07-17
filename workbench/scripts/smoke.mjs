import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { startPanelServer } from "../packages/server/dist/index.js";

const projectDir = await mkdtemp(path.join(tmpdir(), "visualhyper-smoke-"));
let handle;
try {
  handle = await startPanelServer({ projectDir });
  const project = await fetch(new URL("/api/project", handle.runtime.url)).then((response) => response.json());
  if (project.revision !== 0) throw new Error("Expected a new project at revision 0.");

  const updatedResponse = await fetch(new URL("/api/operations", handle.runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseRevision: 0,
      label: "Smoke edit",
      operations: [{ type: "caption.update", captionId: "caption-01", text: "Smoke test" }],
    }),
  });
  if (!updatedResponse.ok) throw new Error(`Operation smoke failed: ${updatedResponse.status}`);
  const updated = await updatedResponse.json();
  if (updated.revision !== 1) throw new Error("Expected operation to increment revision.");

  const stale = await fetch(new URL("/api/operations", handle.runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseRevision: 0,
      label: "Stale edit",
      operations: [{ type: "caption.update", captionId: "caption-01", text: "Stale" }],
    }),
  });
  if (stale.status !== 409) throw new Error(`Expected revision conflict 409, received ${stale.status}.`);

  const crossOrigin = await fetch(new URL("/api/operations", handle.runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ baseRevision: 1, label: "Rejected", operations: [{ type: "caption.update", captionId: "caption-01", text: "Rejected" }] }),
  });
  if (crossOrigin.status !== 403) throw new Error(`Expected origin rejection 403, received ${crossOrigin.status}.`);

  const oversized = await fetch(new URL("/api/operations", handle.runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024 + 1) }),
  });
  if (oversized.status !== 413) throw new Error(`Expected oversized request 413, received ${oversized.status}.`);

  const ui = await fetch(handle.runtime.url);
  const html = await ui.text();
  if (!ui.ok || !html.includes("Kanvis Studio")) throw new Error("Built Kanvis UI was not served.");
  const csp = ui.headers.get("content-security-policy");
  if (!csp?.includes("default-src 'self'")) throw new Error("VisualHyper UI is missing its CSP header.");

  console.log(JSON.stringify({
    ok: true,
    url: handle.runtime.url,
    revision: updated.revision,
    revisionConflict: stale.status,
    originProtection: crossOrigin.status,
    oversizedRequest: oversized.status,
    csp: true,
    uiServed: true,
  }, null, 2));
} finally {
  if (handle) await handle.close();
  await rm(projectDir, { recursive: true, force: true });
}
