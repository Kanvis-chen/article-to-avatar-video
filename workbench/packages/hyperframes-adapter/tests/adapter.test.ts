import { describe, expect, it } from "vitest";

import { hyperFramesArgs } from "../src/adapter.js";

describe("HyperFrames adapter commands", () => {
  it("builds an argument array without shell concatenation", () => {
    const args = hyperFramesArgs("render", "C:\\Project With Spaces", ["--output", "C:\\out file.mp4", "--strict"]);
    expect(args).toEqual([
      "--yes",
      "hyperframes",
      "render",
      "C:\\Project With Spaces",
      "--output",
      "C:\\out file.mp4",
      "--strict",
    ]);
    expect(args.join(" ")).toContain("Project With Spaces");
  });

  it("keeps serialized variables in one spawn argument", () => {
    const args = hyperFramesArgs("render", "C:\\project", ["--variables", JSON.stringify({ title: "A & B" }), "--strict-variables"]);
    expect(args).toContain('{"title":"A & B"}');
    expect(args.at(-1)).toBe("--strict-variables");
  });
});
