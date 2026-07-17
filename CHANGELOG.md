# Changelog

## 0.2.0

### Added

- Complete MIT-licensed Kanvis Video Workbench source under `workbench/`.
- Visual canvas with draggable and resizable editable layers.
- Multi-track timeline with seek, trim, split, delete, and selection.
- Layer inspector for text, geometry, visibility, opacity, timing, and locking.
- Live HyperFrames preview, rendered playback, revision history, undo, and redo.
- Local project server, render jobs, Codex client, and MCP embedded-app integration.
- Privacy-safe editable fixture and verified workbench screenshot.
- Dedicated workbench CI for typecheck, tests, and production build.

### Changed

- The editor opens as the default workbench view.
- Public documentation now describes the workbench as fully open source.
- Removed course, pricing, one-to-one, and commercial upgrade surfaces from the UI and public documentation.

## 0.1.1

### Fixed

- CI no longer depends on a local `avatar-video.config.json` that is intentionally excluded by `.gitignore`.
- Public release audit now verifies that every required release file is tracked by Git when run inside a repository.

## Unreleased

### Added

- One shared production contract for human enhancement, faceless visual, and avatar presenter modes.
- Transparent distinction between fully generated avatars and real-performance-driven lip sync.
- Local hardware detection with CPU, preview, standard, and high profiles.
- Automatic local, cloud, or mock runtime recommendation without hidden paid calls.
- Generic `kanvis-cut.config.json` example and normalized project manifests.
- Twelve-part Chinese release series for sustained public demonstrations.

### Changed

- Project initialization now records presenter mode and runtime recommendation.
- The default privacy-safe example runs in faceless local mode without paid providers.

All notable changes to this project will be documented in this file.

The format follows Keep a Changelog style, and this project uses semantic versioning for public release tags.

## [0.1.0] - 2026-07-17

### Added

- Codex Skill for turning Chinese long-form content into visually directed, release-gated avatar videos.
- Article-native workflow covering source preservation, content brief, spoken adaptation, pronunciation notes, semantic scene planning, provider jobs, composition, and release QA.
- Privacy-safe example under `examples/knowledge-video/`.
- Configuration and scene-plan contracts.
- Preflight, project initialization, scene-plan validation, Skill validation, and media quality-check scripts.
- Provider-adaptable references for cloud and local generation paths.
- Local CosyVoice guidance.
- Safety, contribution, conduct, GitHub issue templates, and CI.
- Launch playbook for non-copy positioning and first 30-day community growth.

### Security

- Paid-call policy gates for `off`, `confirm`, and `auto`.
- Consent and asset-authorization checks before paid generation.
- README and SECURITY guidance for excluding secrets, signed URLs, private portraits, voice samples, client videos, and local private paths.

### Known Limits

- The first public release is an orchestration Skill, not a hosted service or bundled provider SDK.
- Users bring their own provider accounts, credentials, billing, rights, and rendering environment.
- Maintained HeyGen/MiniMax provider adapters are not included in the initial release.
- Public demo video and cost benchmark are planned but not yet linked.
