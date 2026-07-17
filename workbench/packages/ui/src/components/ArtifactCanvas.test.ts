import { describe, expect, it } from "vitest";

import { resolvePreviewMediaUrl } from "./ArtifactCanvas";

describe("resolvePreviewMediaUrl", () => {
  it("resolves project media against the preview origin", () => {
    expect(resolvePreviewMediaUrl("http://127.0.0.1:4321/", "input-video.mp4"))
      .toBe("http://127.0.0.1:4321/input-video.mp4");
  });

  it("rejects cross-origin and non-http media", () => {
    expect(resolvePreviewMediaUrl("http://127.0.0.1:4321/", "http://example.com/audio.mp3")).toBe("");
    expect(resolvePreviewMediaUrl("http://127.0.0.1:4321/", "file:///secret.mp3")).toBe("");
  });
});
