# ADR-001: Open-source video workbench

## Capability

Publish the existing VisualHyper editing workbench as reproducible source code: canvas preview, timeline editing, layer inspector, parameter controls, history, project storage, preview, render jobs, and Codex/MCP integration.

## Open-source review

- React (MIT): UI composition and component runtime.
- Vite (MIT): development and production build tooling.
- Zustand (MIT): replaceable local editor state store.
- Lucide React (ISC): interface icons.
- react-rnd (MIT): draggable and resizable canvas layers.
- Model Context Protocol Apps SDK (Apache-2.0): Codex/MCP embedded application boundary.
- HyperFrames: native composition, preview, and render adapter used by this project.
- OpenCut Classic (MIT): architectural and interaction reference only. Required notice is preserved in `THIRD_PARTY_NOTICES.md`.

## Decision

Open the complete existing workbench source under MIT. Keep engine and host integrations behind packages and adapters. Do not include dependency folders, build output, credentials, user projects, client media, commercial links, or private operational documents.

## Rejected alternatives

- Copying a full third-party editor: unnecessary coupling and a larger license/maintenance surface.
- Publishing only screenshots or a nonfunctional mock: does not provide verifiable open-source value.
- Tying project data directly to a proprietary editor schema: prevents portability and independent adapters.
