import { describe, expect, it } from "vitest";

import { canSplitLayerAtFrame, clipPreviewFrame, timelineSeekFrame, timelineShortcutAction } from "./ArtifactTimeline";

describe("clipPreviewFrame", () => {
  it("seeks past an effect entrance animation", () => {
    expect(clipPreviewFrame({ startFrame: 885, durationFrames: 375 }, 30)).toBe(900);
  });

  it("stays inside very short clips", () => {
    expect(clipPreviewFrame({ startFrame: 20, durationFrames: 3 }, 30)).toBe(22);
  });
});

describe("timelineSeekFrame", () => {
  it("never seeks beyond the final valid frame", () => {
    expect(timelineSeekFrame(1, 300)).toBe(299);
    expect(timelineSeekFrame(2, 300)).toBe(299);
  });

  it("clamps negative pointer positions to frame zero", () => {
    expect(timelineSeekFrame(-0.5, 300)).toBe(0);
  });
});

describe("canSplitLayerAtFrame", () => {
  const layer = { startFrame: 30, durationFrames: 90, locked: false, allowedEdits: ["startFrame", "durationFrames"] } satisfies Parameters<typeof canSplitLayerAtFrame>[0];

  it("allows only an interior integer playhead on editable timing", () => {
    expect(canSplitLayerAtFrame(layer, 60)).toBe(true);
    expect(canSplitLayerAtFrame(layer, 30)).toBe(false);
    expect(canSplitLayerAtFrame(layer, 120)).toBe(false);
    expect(canSplitLayerAtFrame(layer, 60.5)).toBe(false);
  });

  it("rejects locked layers and layers without both timing permissions", () => {
    expect(canSplitLayerAtFrame({ ...layer, locked: true }, 60)).toBe(false);
    expect(canSplitLayerAtFrame({ ...layer, allowedEdits: ["durationFrames"] }, 60)).toBe(false);
  });
});

describe("timelineShortcutAction", () => {
  const layer = { startFrame: 30, durationFrames: 90, locked: false, deleted: false, allowedEdits: ["startFrame", "durationFrames"] } satisfies Parameters<typeof timelineShortcutAction>[1];

  it("matches CapCut split and deletion shortcuts", () => {
    expect(timelineShortcutAction({ key: "b", ctrlKey: true }, layer, 60)).toBe("split");
    expect(timelineShortcutAction({ key: "Delete" }, layer, 60)).toBe("delete");
    expect(timelineShortcutAction({ key: "Backspace" }, layer, 60)).toBe("delete");
  });

  it("keeps arrows on frame navigation and ignores unsafe repeat/deleted actions", () => {
    expect(timelineShortcutAction({ key: "ArrowLeft" }, layer, 60)).toBe("seek-left");
    expect(timelineShortcutAction({ key: "ArrowRight" }, layer, 60)).toBe("seek-right");
    expect(timelineShortcutAction({ key: "Delete", repeat: true }, layer, 60)).toBeNull();
    expect(timelineShortcutAction({ key: "Delete" }, { ...layer, deleted: true }, 60)).toBeNull();
    expect(timelineShortcutAction({ key: "Delete" }, { ...layer, locked: true }, 60)).toBeNull();
  });
});
