# Repository Setup

Use this checklist after creating the public GitHub repository.

## 1. Configure Local Git Identity

Set a repository-local identity before committing:

```bash
git config user.name "YOUR_NAME"
git config user.email "YOUR_EMAIL"
git commit -m "chore: prepare article-to-avatar-video for public release"
```

Use the same identity you want shown on the first public commit.

## 2. Create The GitHub Repository

Recommended repository name:

```text
article-to-avatar-video
```

Recommended description:

```text
Turn Chinese long-form content into visually directed, release-gated avatar videos with Codex.
```

Recommended topics:

```text
codex-skill
ai-video
avatar-video
article-to-video
digital-human
video-automation
content-creation
chinese-content
hyperframes
open-core
agent-workflow
```

## 3. Add Remote And Push

Replace `YOUR_ACCOUNT` with the actual GitHub owner:

```bash
git remote add origin https://github.com/YOUR_ACCOUNT/article-to-avatar-video.git
git push -u origin main
```

Then replace all `https://github.com/Kanvis-chen/article-to-avatar-video` placeholders:

```bash
npm run release:set-url -- https://github.com/YOUR_ACCOUNT/article-to-avatar-video
```

This updates:

- `README.md`
- `README.en.md`
- `docs/launch-copy.md`
- `docs/repository-setup.md`
- `LAUNCH_PLAYBOOK.md`

## 4. GitHub Settings

Enable:

- Issues;
- Discussions;
- private vulnerability reporting;
- Actions with read-only default permissions;
- automatically delete head branches.

Add branch protection after the first push:

- require CI before merge;
- block force pushes on `main`.

## 5. First Release

Tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Release title:

```text
v0.1.0 - From article to directed avatar video
```

Release summary:

```markdown
The first public release of Article to Avatar Video.

It turns Chinese long-form content into a structured video project with source-faithful spoken adaptation, semantic scene planning, provider-adaptable voice/avatar generation, cost and consent gates, preview approval, and release QA.

This is an orchestration Skill, not a hosted service or bundled provider SDK. Users bring their own tools, provider accounts, credentials, billing, and source-material rights.
```

## 6. Launch Gate

Before posting publicly, verify:

```bash
npm run check
npm run release:audit
```

Also verify:

- README links resolve;
- no real provider keys or client assets are present;
- `https://github.com/Kanvis-chen/article-to-avatar-video` has been replaced;
- demo video or GIF is linked, or the README says it is coming soon;
- `docs/roadmap.md` and `examples/knowledge-video/quality-report.example.json` are present;
- `workbench/README.md` documents how to build and run the open-source visual editor;
- `LAUNCH_PLAYBOOK.md` still matches the public positioning.

Before the GitHub URL exists, use the local prepublish variant:

```bash
npm run release:audit:local
```

## 7. First Issues And Discussions

After the first push:

1. Create the three issues from `docs/good-first-issues.md`.
2. Create the first discussion from `docs/launch-copy.md`.
3. Upload a social preview image following `docs/social-preview-brief.md`.
4. Pin the before/after demo once available.
5. Follow `docs/star-growth-plan.md` for the first seven days.
6. Use `docs/positioning-vs-talking-head-skills.md` when answering comparison questions.
