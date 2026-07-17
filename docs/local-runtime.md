# Local Runtime And Graceful Degradation

The project must remain useful without MiniMax, HeyGen, or another paid provider.

Run hardware detection with:

```bash
node scripts/detect-runtime.mjs --config examples/knowledge-video/kanvis-cut.config.json
```

## Hardware profiles

| Profile | Detected GPU memory | Default capability |
|---|---:|---|
| `cpu` | no supported NVIDIA GPU detected | human/faceless project planning, effects, captions, cover prompt, export |
| `preview` | 4-7.9 GB | short low-resolution lip-sync preview |
| `standard` | 8-17.9 GB | normal local lip-sync workflow |
| `high` | 18 GB+ | higher-resolution or heavier local avatar workflows |

These are routing defaults, not performance guarantees. Model versions, resolution, video length, system memory, and driver setup still matter.

## Auto selection

`runtime.mode: auto` follows these rules:

1. Human and faceless modes stay local.
2. Performance lip-sync uses local execution when at least the preview profile is detected.
3. Fully generated local avatar work requires the high profile by default.
4. Insufficient hardware falls back to cloud only when `allow_cloud_fallback` is true.
5. Otherwise it selects `mock`, preserving project generation without creating a paid call.

## Optional convenience tooling

The open repository includes detection, reference adapters, configuration, fallback behavior, and the visual workbench. Additional distributions may provide:

- one-click Windows installation;
- model download and integrity checks;
- driver and dependency repair;
- optimized presets;
- background queues;
- managed cloud compute;
- remote installation and support.
