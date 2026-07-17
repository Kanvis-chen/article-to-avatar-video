---
name: visual-editor
description: Open or resume the project-local VisualHyper native Codex video workspace, inspect its status, and apply structured visual editing operations. Use when the user asks to open VisualHyper, open the visual editor, inspect a VisualHyper project, or modify scenes, text, captions, assets, timing, or transforms through the embedded panel.
---

# VisualHyper visual editor

Use the VisualHyper MCP tools instead of editing generated composition HTML directly.

## Open inside Codex

1. Resolve the user's active workspace as an absolute `projectDir`.
2. Call `open_visualhyper_panel` with that directory and `displayMode: "fullscreen"`.
3. The tool renders `ui://widget/visualhyper/editor.html` as a native Codex widget. Do not open a browser or navigate to a localhost URL.
4. Report the returned project file and that the editor is embedded in the current Codex task.

Use `open_visualhyper_web_panel` only when the user explicitly requests the web fallback or the current host cannot render MCP Apps. Never silently replace the native widget with a browser window.

## Work with a project

- Call `create_visualhyper_project` only when no project exists or the user explicitly wants a new project.
- Call `get_visualhyper_project` before proposing edits that depend on current scene or selection state.
- Use `apply_visualhyper_operations` for changes. Include the current `baseRevision`; on a revision conflict, reload and rebase instead of overwriting newer work.
- Use `list_visualhyper_assets` to discover media. Never invent asset paths.
- The embedded UI calls these same tools through the Codex MCP host bridge. Keep `visualhyper.project.json` as the shared source of truth.

## Boundaries for this version

- This version provides the M0/M1 project shell and editor layout. Do not claim that article import, cover generation, production rendering, Remotion, digital-human calls, or Obsidian integration are implemented.
- Keep HyperFrames HTML as generated output. The editable source of truth is `visualhyper.project.json`.
- Do not transmit large local media as Base64 through MCP.
