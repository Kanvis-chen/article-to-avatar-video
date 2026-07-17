export type DigitalHumanJobStatus = "queued" | "processing" | "succeeded" | "failed" | "canceled";

export type DigitalHumanRequest = {
  requestId: string;
  script: string;
  avatarId?: string;
  voiceId?: string;
  language: string;
  width: number;
  height: number;
  sourceVideoPath?: string;
  removeBackground?: boolean;
};

export type DigitalHumanJob = {
  requestId: string;
  jobId: string;
  status: DigitalHumanJobStatus;
  progress?: number;
  retryAfterMs?: number;
  outputUrl?: string;
  outputPath?: string;
  failure?: { code: string; message: string };
};

export type ProviderCapability = {
  available: boolean;
  provider: string;
  code: "ready" | "missing-credential" | "invalid-config";
  message: string;
};

export interface DigitalHumanProvider {
  readonly name: string;
  validateConfig(): Promise<ProviderCapability>;
  createVideo(request: DigitalHumanRequest): Promise<DigitalHumanJob>;
  getJob(jobId: string): Promise<DigitalHumanJob>;
}

export class BringYourOwnDigitalHumanProvider implements DigitalHumanProvider {
  readonly name = "bring-your-own";
  async validateConfig(): Promise<ProviderCapability> {
    return { available: true, provider: this.name, code: "ready", message: "使用已经生成的项目内数字人视频。" };
  }
  async createVideo(request: DigitalHumanRequest): Promise<DigitalHumanJob> {
    if (!request.sourceVideoPath) throw new Error("BYO digital-human mode requires sourceVideoPath.");
    return { requestId: request.requestId, jobId: request.requestId, status: "succeeded", progress: 1, outputPath: request.sourceVideoPath };
  }
  async getJob(jobId: string): Promise<DigitalHumanJob> {
    return { requestId: jobId, jobId, status: "succeeded", progress: 1 };
  }
}

type FetchLike = typeof fetch;

export class HeyGenDigitalHumanProvider implements DigitalHumanProvider {
  readonly name = "heygen";
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly requests = new Map<string, string>();

  constructor(input: { apiKey?: string; fetchImpl?: FetchLike } = {}) {
    this.apiKey = input.apiKey ?? "";
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async validateConfig(): Promise<ProviderCapability> {
    return this.apiKey
      ? { available: true, provider: this.name, code: "ready", message: "HeyGen API 已配置。" }
      : { available: false, provider: this.name, code: "missing-credential", message: "设置 HEYGEN_API_KEY 后可直接生成数字人视频；也可以改用已有数字人视频。" };
  }

  async createVideo(request: DigitalHumanRequest): Promise<DigitalHumanJob> {
    if (!this.apiKey) throw new Error("HEYGEN_API_KEY is not configured.");
    if (!request.avatarId || !request.voiceId) throw new Error("HeyGen requires avatarId and voiceId.");
    const response = await this.fetchImpl("https://api.heygen.com/v3/videos", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({
        type: "avatar",
        avatar_id: request.avatarId,
        script: request.script,
        voice_id: request.voiceId,
        aspect_ratio: aspectRatio(request.width, request.height),
        output_format: "mp4",
        remove_background: request.removeBackground ?? true,
        voice_settings: { locale: request.language },
      }),
    });
    const body = await response.json() as { data?: { video_id?: string; id?: string; status?: string }; error?: { code?: string; message?: string } };
    if (!response.ok || !body.data) throw new Error(`HeyGen create video failed (${response.status}): ${body.error?.message ?? "Unknown API error"}`);
    const jobId = body.data.video_id ?? body.data.id;
    if (!jobId) throw new Error("HeyGen response did not include a video id.");
    this.requests.set(jobId, request.requestId);
    return { requestId: request.requestId, jobId, status: mapStatus(body.data.status), progress: 0, retryAfterMs: 3_000 };
  }

  async getJob(jobId: string): Promise<DigitalHumanJob> {
    if (!this.apiKey) throw new Error("HEYGEN_API_KEY is not configured.");
    const response = await this.fetchImpl(`https://api.heygen.com/v3/videos/${encodeURIComponent(jobId)}`, { headers: { "x-api-key": this.apiKey } });
    const body = await response.json() as { data?: { status?: string; video_url?: string; failure_code?: string; failure_message?: string }; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(`HeyGen get video failed (${response.status}): ${body.error?.message ?? "Unknown API error"}`);
    const status = body.data.failure_code ? "failed" : body.data.video_url ? "succeeded" : mapStatus(body.data.status);
    return {
      requestId: this.requests.get(jobId) ?? jobId,
      jobId,
      status,
      ...(status === "succeeded" ? { progress: 1, ...(body.data.video_url ? { outputUrl: body.data.video_url } : {}) } : { retryAfterMs: 3_000 }),
      ...(status === "failed" ? { failure: { code: body.data.failure_code ?? "HEYGEN_FAILED", message: body.data.failure_message ?? "HeyGen video generation failed." } } : {}),
    };
  }
}

function mapStatus(status?: string): DigitalHumanJobStatus {
  const normalized = status?.toLowerCase();
  if (["completed", "complete", "succeeded", "success"].includes(normalized ?? "")) return "succeeded";
  if (["failed", "error"].includes(normalized ?? "")) return "failed";
  if (["pending", "queued", "waiting"].includes(normalized ?? "")) return "queued";
  return "processing";
}

function aspectRatio(width: number, height: number): "16:9" | "9:16" | "1:1" {
  if (width === height) return "1:1";
  return width > height ? "16:9" : "9:16";
}
