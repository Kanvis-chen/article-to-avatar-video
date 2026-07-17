# Kanvis Video Workbench

An open-source visual video editing workbench for Agent-generated projects.

## Features

- visual canvas with selectable, draggable, and resizable layers;
- multi-track timeline with seek, split, delete, and layer selection;
- text, position, size, opacity, timing, and effect parameter editing;
- live preview and rendered-output playback;
- undo/redo with independent edit revisions;
- local project and artifact storage;
- HyperFrames preview/render adapter;
- Codex and MCP embedded-app integration;
- three creation modes: faceless animation, avatar presenter, and real footage enhancement.

## Development

Requirements:

- Node.js 22 or newer;
- pnpm 9;
- HyperFrames only when previewing or rendering a native composition.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm start
```

Open the URL printed by `pnpm start`. The included privacy-safe fixture provides a small editable project for local verification.

## Packages

```text
packages/core                    project and artifact contracts
packages/ui                      React editing interface
packages/server                  project, preview, and render service
packages/hyperframes-adapter     native engine integration
packages/digital-human-provider avatar provider boundary
packages/codex-client            Codex app-server client
packages/mcp-server              MCP tools and embedded app
```

## License

MIT. See `THIRD_PARTY_NOTICES.md` for dependency and reference notices.
