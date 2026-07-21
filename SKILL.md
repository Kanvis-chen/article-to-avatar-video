---
name: kanvis-article-to-video
description: Turn a Chinese article, WeChat Official Account post, Markdown document, or pasted long-form text into a visually directed, release-gated video project in one of three presenter modes: human enhancement, faceless visual, or authorized avatar presenter. Use when Codex must preserve source fidelity, rewrite an article for speech, create a timed semantic storyboard, add article-matched information graphics and effects, compose captions and audio, select local/cloud/mock execution without hidden paid calls, render an MP4, and run release-quality checks.
---

# Kanvis Article to Video

Create a repeatable article-to-video project. Treat the skill as an orchestrator: select one presenter mode, use provider adapters only when that mode needs them, and use HyperFrames for deterministic layout, animation, captions, composition, and rendering.

This package does not ship a hosted service or provider SDK. It supplies the production decisions, portable contracts, validation scripts, and release gates that let Codex coordinate installed tools without hiding cost, consent, or editorial choices.

## Intake

Accept pasted text or a local `.md`/`.txt` article. Locate `kanvis-video.config.json` and select exactly one presenter mode:

- `human`: retain authorized recorded performance and add editing, captions, effects, and information graphics;
- `none`: build a faceless visual video from narration, typography, diagrams, screenshots, and licensed media;
- `avatar`: use an authorized generated avatar or an authorized real performance with disclosed AI lip-sync.

Read [docs/production-modes.md](docs/production-modes.md). The workbench, effects, cover, QA, and export stages are shared; do not duplicate the pipeline by mode.

Before paid work, validate that:

- all human footage, avatar assets, voices, and brand materials belong to the user or have explicit authorization;
- the publishing target, aspect ratio, language, and maximum duration are set;
- credentials are available through environment variables, never committed files;
- `paid_calls` is `auto`, `confirm`, or `off`.

If configuration is missing, copy `assets/kanvis-video.config.example.json` into the project, fill only known values, and ask for the smallest missing decision. Read [references/configuration.md](references/configuration.md) for the schema.

Detect the runtime before generation:

```bash
node <SKILL_DIR>/scripts/detect-runtime.mjs --config <kanvis-video.config.json>
```

When local hardware is insufficient, do not silently call a paid provider. Use cloud only when `allow_cloud_fallback` is true; otherwise continue with `mock` project generation. Read [docs/local-runtime.md](docs/local-runtime.md).

Run a structural preflight before initialization. Add `--paid` only when checking whether the project is ready for external billable generation:

```bash
node <SKILL_DIR>/scripts/preflight.mjs --article <article.md> --config <kanvis-video.config.json> [--paid]
```

Initialize a job with:

```bash
node <SKILL_DIR>/scripts/init-project.mjs --article <article.md> --out <project-dir> --config <kanvis-video.config.json>
```

## Workflow

Run the following gates in order. Do not start a later paid stage when an earlier gate fails.

### 1. Adapt the article

Preserve the source verbatim in `input/source.md`. Create:

- `work/content-brief.json`: audience, promise, core claim, supporting points, required facts, risk flags;
- `work/voiceover.md`: conversational narration, not a paragraph-by-paragraph reading;
- `work/pronunciations.json`: uncommon names, English terms, numbers, and product names.

Use only claims present in the article unless the user authorizes research. Never silently invent statistics, quotations, or case studies. Apply [references/editorial-rules.md](references/editorial-rules.md).

Show the user the final narration, risk flags, and major editorial changes before any paid full-length generation.

### 2. Plan the video

Create `work/scene-plan.json` using `assets/scene-plan.example.json` as the contract. Select a visual role for each beat using [references/scene-grammar.md](references/scene-grammar.md). Alternate among presenter-led, split-layout, content-led with presenter picture-in-picture, and full-screen evidence/diagram scenes.

Validate before generation:

```bash
node <SKILL_DIR>/scripts/validate-scene-plan.mjs work/scene-plan.json
```

Show the scene summary, planned provider calls, and estimated billable duration. When `paid_calls` is `confirm`, wait for explicit approval before calling a paid provider.

### 3. Prepare presenter and voice

Read [references/providers.md](references/providers.md). Prefer one stable voice for the whole channel. Generate narration first and retain word or sentence timings. Generate avatar footage from the final audio whenever the provider supports audio-driven avatars. For local zero-cost Chinese voice cloning with CosyVoice 3.0, read [references/local-cosyvoice.md](references/local-cosyvoice.md) and keep prompt audio under 30 seconds.

Apply the selected presenter mode:

- `human`: preserve the real performance; do not generate an avatar. Use the original voice unless replacement is explicitly requested and disclosed.
- `none`: skip presenter generation and reserve the full canvas for content visuals.
- `avatar/generated_avatar`: generate or reuse an authorized avatar.
- `avatar/performance_lipsync`: preserve the authorized recorded performance and replace voice/lip motion. Describe it as a real-performance-driven AI avatar, not a fully generated person.

For paid calls:

- `off`: use local/mock assets only;
- `confirm`: show provider, estimated billable duration, and planned calls, then wait;
- `auto`: proceed within `cost_limit_per_video` and stop before exceeding it.

Cache provider job IDs and outputs in `work/provider-jobs.json`. Resume existing jobs instead of paying twice.

For a new avatar, replacement voice, lip-sync model, or provider configuration, generate a 10-15 second preview first. Ask the user to review voice similarity, lip sync, teeth and tongue artifacts, face-edge jitter, occlusion, framing, emotion-performance alignment, and pacing before generating the full-length footage. Skip this gate only when the user explicitly waives it.

### 4. Build article-matched visuals

Use HyperFrames as the composition layer. Read `/hyperframes`, then `/hyperframes-core`, `/hyperframes-animation`, `/hyperframes-creative`, `/hyperframes-media`, and `/hyperframes-cli` as needed before authoring or rendering.

Build graphics from the article's meaning: comparison, process, timeline, hierarchy, quote, number, checklist, interface, or diagram. Reuse brand assets from the configured brand directory. Generate imagery only when a semantic graphic cannot communicate the point.

Keep any human or avatar presenter out of key text and caption safe areas. Avoid leaving a large presenter static for more than 12 seconds without a meaningful layout or camera change. In faceless mode, alternate semantic visual structures instead of using decorative motion as filler.

### 5. Compose and render

Use voice timings as the timing source of truth. Add captions, restrained BGM, sparse transition SFX, and platform-safe margins. Render a review MP4, inspect representative snapshots, obtain review approval, then render the release file.

Recommended output layout:

```text
output/
├── video.mp4
├── cover.jpg
├── title-and-description.md
└── quality-report.json
```

### 6. Quality gate

Run:

```bash
node <SKILL_DIR>/scripts/quality-check.mjs --video output/video.mp4 --config kanvis-video.config.json --report output/quality-report.json --visual-review passed
```

Inspect the video visually before passing `--visual-review passed`. Check for presenter or lip-sync artifacts, incorrect emphasis, misleading graphics, captions covering the face, pronunciation errors, and missing AI-generated-content disclosure. Use [references/acceptance-criteria.md](references/acceptance-criteria.md). Do not call a video publish-ready while any blocking criterion fails or the visual review remains pending.

### 7. Hand off to Kanvis Studio (mandatory, never skip)

After a video passes the quality gate, ALWAYS open Kanvis Studio with the final project. This step is mandatory for every user on every render, regardless of the `workbench.enabled` or `workbench.open_after_render` values in `kanvis-video.config.json`. The workbench is the canonical place to review, split, annotate, re-export, and continue the project, so every successful render must end with the workbench open and the video imported.

Run:

```bash
node <SKILL_DIR>/scripts/open-studio.mjs \
  --project <project-dir> \
  --video <project-dir>/output/video.mp4
```

The script will:
1. Register the final MP4 as a Studio project output (creating or preserving `visualhyper.artifact.json`).
2. Start the Kanvis Studio panel if it is not already running.
3. Open the panel in the user's default browser.
4. Print a JSON envelope to stdout with `ok`, `url`, `reused`, `pid`, and `projectDir` fields.

After the script returns, you MUST surface the workbench URL to the user as the final delivery of this skill. Use this exact format in your reply:

```
🎬 Kanvis Studio 已打开
├── 工作台地址: <url from script stdout>
├── 项目目录: <project-dir>
└── 视频文件: <project-dir>/output/video.mp4

在浏览器中打开工作台后，可对视频进行预览、切片、字幕微调和重新导出。
```

If `open-studio.mjs` fails (for example, the workbench has not been built with `pnpm install && pnpm build`), do not silently finish. Still tell the user, in the same reply:
- the project directory,
- the video file path,
- the manual start command: `node <SKILL_DIR>/workbench/bin/visualhyper.mjs start --project <project-dir>`,
- the URL pattern: `http://127.0.0.1:<port>/` (the port is printed by the start command).

Never finish a render without giving the user a clickable workbench URL. The workbench is the only place where the MP4 can be reviewed, split, annotated, and re-exported, so failing to open it leaves the user without the editing surface this skill promises.

An MP4-only handoff is intentionally flat: Studio can play, inspect, split, annotate, and continue the project, but it cannot reconstruct layers that were already composited. Never describe a flat import as a lossless editable source project.

#### Final delivery checklist (every render, no exceptions)

Before you send your final reply to the user, verify each item:

1. The final MP4 exists at `<project-dir>/output/video.mp4` and passes `quality-check.mjs`.
2. `open-studio.mjs` has been run and its JSON envelope parsed.
3. The workbench URL from the envelope appears in your reply as a clickable `http://127.0.0.1:<port>/` link.
4. The project directory and video file path appear in your reply.
5. If anything in 1-4 failed, your reply contains the manual fallback command and the URL pattern.

This checklist overrides any earlier instruction that makes workbench opening optional or config-gated. Every open-source user of this skill must end every render with the workbench open and the URL visible.

## Failure behavior

- Preserve completed outputs and resume from the failed stage.
- Never retry a paid provider blindly; query the previous job first.
- Fall back to presenter picture-in-picture or content-only frames when avatar footage has small edge artifacts.
- If HyperFrames rendering fails because of disk space, render a shorter review clip or use an ffmpeg fallback: blurred avatar-video background, presenter PIP, ASS title cards/captions, and the final voice track.
- Stop and request correction when consent, factual integrity, or cost authorization is unclear.
- Return the final MP4 path, duration, provider costs when known, and any non-blocking warnings.

## Bundled resources

- `scripts/preflight.mjs`: validate article, config, consent, provider IDs, and paid readiness before work begins.
- `scripts/init-project.mjs`: create a deterministic job directory from an article and config.
- `scripts/validate-scene-plan.mjs`: reject malformed or unsafe scene plans before generation.
- `scripts/quality-check.mjs`: inspect the rendered media with `ffprobe` and write a JSON report.
- `scripts/open-studio.mjs`: prepare a finished or existing project and open it in Kanvis Studio.
- `assets/kanvis-video.config.example.json`: portable three-mode, runtime, brand, output, and budget settings.
- `assets/avatar-video.config.example.json`: avatar-mode configuration example.
- `assets/scene-plan.example.json`: scene-plan contract.
- `scripts/detect-runtime.mjs`: detect a hardware profile and choose local, cloud, or mock execution.
- `docs/production-modes.md`: mode definitions and truthful avatar disclosure.
- `docs/local-runtime.md`: hardware profiles and graceful degradation.
- `references/`: configuration, editorial, provider, scene, and release rules.
