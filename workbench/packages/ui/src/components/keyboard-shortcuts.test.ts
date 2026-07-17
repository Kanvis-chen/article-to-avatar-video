import { describe, expect, it } from "vitest";

import { editorShortcutAction } from "./keyboard-shortcuts";

describe("editorShortcutAction", () => {
  it("supports standard undo and redo shortcuts", () => {
    expect(editorShortcutAction({ key: "z", ctrlKey: true })).toBe("undo");
    expect(editorShortcutAction({ key: "Z", metaKey: true })).toBe("undo");
    expect(editorShortcutAction({ key: "z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(editorShortcutAction({ key: "y", ctrlKey: true })).toBe("redo");
  });

  it("maps Space to playback and ignores ordinary typing", () => {
    expect(editorShortcutAction({ key: " ", code: "Space" })).toBe("toggle-playback");
    expect(editorShortcutAction({ key: "a", code: "KeyA" })).toBeNull();
  });
});
