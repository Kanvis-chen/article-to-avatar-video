import { spawn } from "node:child_process";
import path from "node:path";

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxOutputBytes?: number;
  onOutput?: (stream: "stdout" | "stderr", text: string) => void;
};

export async function runCommand(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  const abort = () => {
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", shell: false });
      killer.unref();
    } else child.kill("SIGTERM");
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  const maxBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
  let bytes = 0;
  let stdout = "";
  let stderr = "";
  const append = (stream: "stdout" | "stderr", chunk: Buffer | string) => {
    const text = String(chunk);
    bytes += Buffer.byteLength(text);
    if (bytes > maxBytes) {
      child.kill();
      return;
    }
    if (stream === "stdout") stdout += text;
    else stderr += text;
    options.onOutput?.(stream, text);
  };
  child.stdout.on("data", (chunk) => append("stdout", chunk));
  child.stderr.on("data", (chunk) => append("stderr", chunk));
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (bytes > maxBytes) reject(new Error(`Command output exceeded ${maxBytes} bytes.`));
      else if (signal && options.signal?.aborted) reject(options.signal.reason ?? new Error("Command canceled."));
      else resolve(code ?? 1);
    });
  });
  options.signal?.removeEventListener("abort", abort);
  return { exitCode, stdout, stderr };
}

export function npxExecutable(): string {
  return process.platform === "win32" ? process.execPath : "npx";
}

export function npxArguments(args: string[]): string[] {
  if (process.platform !== "win32") return args;
  return [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...args];
}

export function ffprobeExecutable(): string {
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}
