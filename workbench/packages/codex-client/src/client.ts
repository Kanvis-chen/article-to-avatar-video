import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { ClientNotification } from "./generated/ClientNotification.js";
import type { ClientRequest } from "./generated/ClientRequest.js";
import type { InitializeParams } from "./generated/InitializeParams.js";
import type { InitializeResponse } from "./generated/InitializeResponse.js";
import type { ServerNotification } from "./generated/ServerNotification.js";
import type { ThreadStartParams } from "./generated/v2/ThreadStartParams.js";
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse.js";
import type { TurnInterruptParams } from "./generated/v2/TurnInterruptParams.js";
import type { TurnInterruptResponse } from "./generated/v2/TurnInterruptResponse.js";
import type { TurnStartParams } from "./generated/v2/TurnStartParams.js";
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse.js";
import { discoverCodexExecutable } from "./discovery.js";
import { JsonLineDecoder } from "./jsonl.js";

type RequestMethod = ClientRequest["method"];
type RequestParams<M extends RequestMethod> = Extract<ClientRequest, { method: M }> extends { params: infer P } ? P : never;
type ResponseByMethod = {
  initialize: InitializeResponse;
  "thread/start": ThreadStartResponse;
  "turn/start": TurnStartResponse;
  "turn/interrupt": TurnInterruptResponse;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type WireResponse = { id: string | number; result?: unknown; error?: { code?: number; message?: string } };
type NotificationListener = (notification: ServerNotification) => void;
type WireMessageListener = (message: unknown) => void;

export class CodexAppServerClient {
  #process: ChildProcessWithoutNullStreams | null = null;
  #nextId = 1;
  #pending = new Map<number, PendingRequest>();
  #notificationListeners = new Set<NotificationListener>();
  #wireMessageListeners = new Set<WireMessageListener>();
  #stderr = "";

  get stderrTail(): string {
    return this.#stderr.slice(-8_000);
  }

  async connect(options: { codexPath?: string } = {}): Promise<InitializeResponse> {
    if (this.#process) throw new Error("Codex App Server client is already connected.");
    const codexPath = options.codexPath ?? await discoverCodexExecutable();
    const child = spawn(codexPath, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#process = child;
    const decoder = new JsonLineDecoder();
    child.stdout.on("data", (chunk) => {
      for (const message of decoder.push(String(chunk))) this.#handleMessage(message);
    });
    child.stderr.on("data", (chunk) => {
      this.#stderr = `${this.#stderr}${String(chunk)}`.slice(-16_000);
    });
    child.once("error", (error) => this.#rejectAll(error));
    child.once("exit", (code, signal) => {
      this.#process = null;
      this.#rejectAll(new Error(`Codex App Server exited (${signal ?? `code ${code ?? "unknown"}`}). ${this.stderrTail}`));
    });

    const params: InitializeParams = {
      clientInfo: { name: "visualhyper", title: "VisualHyper", version: "0.1.0" },
      capabilities: null,
    };
    const initialized = await this.request("initialize", params);
    this.notify({ method: "initialized" });
    return initialized;
  }

  onNotification(listener: NotificationListener): () => void {
    this.#notificationListeners.add(listener);
    return () => this.#notificationListeners.delete(listener);
  }

  onWireMessage(listener: WireMessageListener): () => void {
    this.#wireMessageListeners.add(listener);
    return () => this.#wireMessageListeners.delete(listener);
  }

  request<M extends keyof ResponseByMethod>(method: M, params: RequestParams<M>): Promise<ResponseByMethod[M]> {
    const child = this.#requireProcess();
    const id = this.#nextId++;
    const message = { method, id, params } as Extract<ClientRequest, { method: M }>;
    return new Promise<ResponseByMethod[M]>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (value) => resolve(value as ResponseByMethod[M]),
        reject,
      });
      child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  notify(notification: ClientNotification): void {
    this.#requireProcess().stdin.write(`${JSON.stringify(notification)}\n`);
  }

  startThread(params: ThreadStartParams): Promise<ThreadStartResponse> {
    return this.request("thread/start", params);
  }

  startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.request("turn/start", params);
  }

  interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
    return this.request("turn/interrupt", params);
  }

  async close(): Promise<void> {
    const child = this.#process;
    if (!child) return;
    this.#process = null;
    child.stdin.end();
    if (!child.killed) child.kill();
    this.#rejectAll(new Error("Codex App Server client closed."));
  }

  #requireProcess(): ChildProcessWithoutNullStreams {
    if (!this.#process) throw new Error("Codex App Server client is not connected.");
    return this.#process;
  }

  #handleMessage(value: unknown): void {
    for (const listener of this.#wireMessageListeners) listener(value);
    if (!value || typeof value !== "object") return;
    const message = value as Partial<WireResponse> & { method?: string; params?: unknown };
    if (message.id !== undefined && ("result" in message || "error" in message)) {
      const pending = this.#pending.get(Number(message.id));
      if (!pending) return;
      this.#pending.delete(Number(message.id));
      if (message.error) pending.reject(new Error(message.error.message ?? `Codex App Server error ${message.error.code ?? "unknown"}.`));
      else pending.resolve(message.result);
      return;
    }
    if (message.method && !("id" in message)) {
      const notification = message as ServerNotification;
      for (const listener of this.#notificationListeners) listener(notification);
    }
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
