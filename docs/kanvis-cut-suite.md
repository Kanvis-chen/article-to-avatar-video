# Kanvis Cut Suite Direction

`article-to-avatar-video` is the first public skill in the Kanvis Cut direction.

The long-term shape is a small skill suite, not one oversized prompt and not a closed editor:

```text
Kanvis Cut Skills
├── article-to-avatar-video   # article/script -> directed avatar video project
├── cut-project-protocol      # shared project format and validation rules
├── subtitle-director         # caption line breaks, emphasis, platform rhythm
├── effect-director           # transitions, emphasis, camera motion, visual beats
├── cover-director            # cover title, layout, image prompt, click promise
└── export-checker            # release readiness and handoff checks
```

## Why start with one skill?

The public release starts with `article-to-avatar-video` because it proves the hardest part:

- preserve a Chinese long-form source;
- rewrite it for spoken delivery;
- turn meaning into scenes instead of reading paragraphs;
- keep avatar, voice, cost, consent, rendering, and QA behind explicit gates.

The other skills should grow from real usage, issues, and examples. They should not be split out until the project has repeated cases that justify stable contracts.

## Router model

DBS and g-stack use a router pattern: one visible entry point routes to smaller specialist skills. Kanvis Cut should follow the same idea when the suite becomes multi-skill.

Suggested public entry:

```text
/kanvis-cut
```

Routing examples:

| User request | Route |
|---|---|
| "Turn this article into a video project" | `article-to-avatar-video` |
| "Check whether this project file is valid" | `cut-project-protocol` |
| "Make the captions punchier for Xiaohongshu" | `subtitle-director` |
| "Add motion and transitions to scene 3" | `effect-director` |
| "Generate a cover title and image prompt" | `cover-director` |
| "Can this be released or exported?" | `export-checker` |

For v0.1, keep the external name focused on `article-to-avatar-video`. Add the router only after at least two more skills have real examples and tests.

## Naming

Use these names consistently:

- `Article to Avatar Video`: the first open-source skill.
- `Kanvis Cut Skills`: the future open skill suite.
- `Kanvis Video Workbench`: the open-source visual editing workbench.
- `Kanvis Business Skills`: the future higher-level business skill ecosystem.

This keeps the public project from trapping the creator in a narrow "video tool" identity. The video skill is one production module inside a larger business system.
