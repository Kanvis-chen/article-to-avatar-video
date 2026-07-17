import { describe, expect, it, vi } from "vitest";

import { BringYourOwnDigitalHumanProvider, HeyGenDigitalHumanProvider } from "../src/index.js";

describe("digital human providers", () => {
  it("reports missing HeyGen credentials without making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new HeyGenDigitalHumanProvider({ fetchImpl });
    expect((await provider.validateConfig()).available).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the official HeyGen v3 video contract without exposing the key in the body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { video_id: "video-1", status: "pending" } }), { status: 200 }));
    const provider = new HeyGenDigitalHumanProvider({ apiKey: "secret", fetchImpl });
    const job = await provider.createVideo({ requestId: "request-1", script: "你好", avatarId: "avatar-1", voiceId: "voice-1", language: "zh-CN", width: 1080, height: 1920 });
    expect(job.jobId).toBe("video-1");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.heygen.com/v3/videos");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("secret");
    expect(init?.body).not.toContain("secret");
    expect(init?.body).toContain('"aspect_ratio":"9:16"');
  });

  it("accepts an existing local avatar clip without remote generation", async () => {
    const provider = new BringYourOwnDigitalHumanProvider();
    const job = await provider.createVideo({ requestId: "request-byo", script: "", language: "zh-CN", width: 1080, height: 1920, sourceVideoPath: "assets/avatar.mp4" });
    expect(job.status).toBe("succeeded");
    expect(job.outputPath).toBe("assets/avatar.mp4");
  });
});
