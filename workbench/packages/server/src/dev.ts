import { openPanelForProject } from "./panel-server.js";

const handle = await openPanelForProject({ projectDir: process.cwd() });
console.log(`VisualHyper development server: ${handle.runtime.url}`);
