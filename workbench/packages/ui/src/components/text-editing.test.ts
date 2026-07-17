import { describe, expect, it } from "vitest";

import { hasTextDraftChanged, isTextEditCancelShortcut, isTextEditSaveShortcut } from "./text-editing";

describe("text editing shortcuts", () => {
  it("saves with Ctrl+Enter or Command+Enter without treating plain Enter as save", () => {
    expect(isTextEditSaveShortcut({ key: "Enter", ctrlKey: true })).toBe(true);
    expect(isTextEditSaveShortcut({ key: "Enter", metaKey: true })).toBe(true);
    expect(isTextEditSaveShortcut({ key: "Enter" })).toBe(false);
    expect(isTextEditSaveShortcut({ key: "Enter", ctrlKey: true, isComposing: true })).toBe(false);
  });

  it("cancels with Escape and detects real text changes", () => {
    expect(isTextEditCancelShortcut({ key: "Escape" })).toBe(true);
    expect(isTextEditCancelShortcut({ key: "Escape", isComposing: true })).toBe(false);
    expect(hasTextDraftChanged("原字幕", "修改后的字幕")).toBe(true);
    expect(hasTextDraftChanged("原字幕", "原字幕")).toBe(false);
  });
});
