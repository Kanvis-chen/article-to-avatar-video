import { describe, expect, it } from "vitest";

import { parseDoctorOutput, summarizeDoctor } from "../src/doctor.js";

describe("HyperFrames doctor adapter", () => {
  it("treats optional media checks separately from local render requirements", () => {
    const doctor = parseDoctorOutput(`log before\n{
      "ok": false,
      "platform": "win32",
      "arch": "x64",
      "checks": [
        { "name": "Node.js", "ok": true, "detail": "v24" },
        { "name": "Version", "ok": true, "detail": "0.7" },
        { "name": "FFmpeg", "ok": true, "detail": "7.1" },
        { "name": "FFprobe", "ok": true, "detail": "7.1" },
        { "name": "Chrome", "ok": true, "detail": "ready" },
        { "name": "TTS (Kokoro)", "ok": false, "detail": "optional" }
      ]
    }\ntrailing log`);
    const summary = summarizeDoctor(doctor);
    expect(summary.readyForLocalRender).toBe(true);
    expect(summary.optionalWarnings).toHaveLength(1);
  });
});
