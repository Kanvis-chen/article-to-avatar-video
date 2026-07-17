import { describe, expect, it } from "vitest";

import { JsonLineDecoder } from "../src/jsonl.js";

describe("JsonLineDecoder", () => {
  it("decodes split JSONL frames", () => {
    const decoder = new JsonLineDecoder();
    expect(decoder.push('{"id":1')).toEqual([]);
    expect(decoder.push(',"result":{}}\n{"method":"turn/started"}\n')).toEqual([
      { id: 1, result: {} },
      { method: "turn/started" },
    ]);
  });
});
