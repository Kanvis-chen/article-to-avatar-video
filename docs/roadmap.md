# Roadmap

This roadmap keeps the project focused on article-to-video direction instead of drifting into a generic avatar wrapper.

## v0.1.x: Public-Ready Skill

Status: current.

- Privacy-safe Chinese article example.
- Content brief, voiceover, pronunciation, and scene-plan contracts.
- Structural preflight.
- Scene-plan validation.
- Media quality gate.
- Public release audit.
- Launch copy, issue templates, contribution rules, and CI.

## v0.2: First-Run Experience

Goal: make a new contributor understand and run the pipeline in under 10 minutes.

- Add a generated demo project snapshot.
- Add a minimal Kanvis Cut project schema example.
- Add a mock provider adapter note or local-only adapter.
- Add one more platform preset.
- Add FAQ entries from first-run issues.
- Add a short before/after demo link once available.

## v0.3: Scene Grammar Library

Goal: make the project visibly stronger than a talking-head workflow.

- Add more scene grammar examples:
  - comparison;
  - process;
  - evidence;
  - number;
  - quote;
  - checklist;
  - presenter PIP.
- Add Chinese pronunciation examples for names, English terms, and product names.
- Add layout acceptance examples for 9:16 and 16:9.

## v0.4: Provider Adapter Kit

Goal: make providers replaceable without making provider calls the center of the project.

- Define adapter contracts for:
  - text-to-speech;
  - avatar preview;
  - full avatar generation;
  - local/mock provider output.
- Add cost-report examples.
- Add retry/resume behavior examples.

## v0.6: Kanvis Cut Skills Split

Goal: split only the pieces that have stable examples and repeated demand.

- Stabilize `cover-director` as a general cover and visual-hook skill.
- Stabilize `subtitle-director` for Chinese short-video caption rhythm.
- Stabilize `effect-director` for scene-level motion and emphasis parameters.
- Keep `/kanvis-cut` as a router only after at least two subskills have tests and examples.

## v0.7: Open Workbench

Goal: make the open skill hand off cleanly to the included visual workbench and third-party editing surfaces.

- Define a stable export asset package.
- Add SRT export guidance.
- Add Jianying/CapCut import-package examples after version testing.
- Keep engine adapters replaceable and project files portable.

## v0.5: Release QA Evidence

Goal: make `publish_ready` mean something.

- Add richer quality-report examples.
- Add sample failure reports.
- Add visual-review checklist examples.
- Add optional ffmpeg-based fallback rendering notes.

## Not Planned

These are intentionally outside the project scope:

- hosted SaaS backend;
- bundled provider accounts or credits;
- automatic social-platform publishing;
- scraping or account automation;
- full-screen avatar generator as the primary product;
- private portrait, voice, client, or signed-URL examples.
- untested Jianying/CapCut draft-package generation.
