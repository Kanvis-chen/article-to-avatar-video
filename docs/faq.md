# FAQ

## Is this a talking-head generator?

No. The project starts from a Chinese long-form article, not from a finished talking-head script.

The core work is:

```text
source article
-> spoken adaptation
-> semantic scene plan
-> information graphics and presenter PIP
-> release QA
```

Avatar generation is one replaceable edge of the pipeline.

## Why not make the avatar full-screen all the time?

Because many article beats need visual evidence more than a face:

- comparisons need side-by-side structure;
- processes need steps;
- numbers need charts;
- quotes need source context;
- claims need evidence cards.

The presenter should guide the viewer, not cover the information.

## Does this include provider accounts or credits?

No. Users bring their own provider accounts, credentials, billing, and rights to source material.

The repository provides orchestration rules, validation scripts, contracts, and privacy-safe examples. It does not bundle provider SDKs, paid credits, private portraits, voice samples, signed URLs, or hosted infrastructure.

## Can I use it without paid providers?

Yes, for structure and validation.

You can run:

```bash
npm run check
npm run release:audit:local
node scripts/init-project.mjs --article examples/knowledge-video/article.md --config examples/knowledge-video/avatar-video.config.json --out ./demo-project
```

Paid avatar or voice generation is intentionally gated behind configuration, consent, preview, and cost checks.

## Why should someone star this repository?

Star it if this problem is familiar:

```text
I have articles or course drafts.
I need videos.
A digital human reading paragraphs is not enough.
I want a repeatable pipeline for adaptation, scene direction, cost control, and QA.
```

Do not star it expecting a hosted service or one-click viral-video tool.

## What should contributors work on first?

The best first contributions are:

- platform presets;
- scene grammar examples;
- Chinese pronunciation examples;
- local/mock provider notes;
- release QA examples;
- privacy-safe demo cases.

See `docs/good-first-issues.md`.

## What is intentionally not included?

- hosted SaaS backend;
- social-platform auto-publishing;
- scraping workflows;
- account automation;
- private client assets;
- real voice samples or portraits;
- provider secrets or signed URLs.

## Is the visual editor open source?

Yes. The complete Kanvis Video Workbench source is included under `workbench/` with an MIT license. It includes the canvas, timeline, layer inspector, preview, project service, render jobs, and Codex/MCP integration.

## Is this the future Kanvis Cut Skills suite?

This repository is the first public skill in that direction. The suite should grow gradually:

```text
article-to-avatar-video
cut-project-protocol
subtitle-director
effect-director
cover-director
export-checker
```

For v0.1, the public project remains focused on article-to-avatar video. The broader suite direction is documented in `docs/kanvis-cut-suite.md`.
