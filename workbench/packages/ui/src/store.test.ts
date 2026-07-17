import { describe, expect, it } from "vitest";

import { useEditorStore } from "./store";

describe("editor store", () => {
  it("applies local structured edits in demo mode", async () => {
    useEditorStore.setState({ connection: "demo" });
    const before = useEditorStore.getState().project.revision;
    await useEditorStore.getState().commit([
      { type: "caption.update", captionId: "caption-01", text: "本地演示字幕" },
    ], "test edit");
    expect(useEditorStore.getState().project.revision).toBe(before + 1);
    expect(useEditorStore.getState().project.captions[0]?.text).toBe("本地演示字幕");
  });
});
