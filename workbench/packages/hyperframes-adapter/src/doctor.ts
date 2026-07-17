import { npxArguments, npxExecutable, runCommand } from "./command.js";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
};

export type HyperFramesDoctorResult = {
  ok: boolean;
  platform: string;
  arch: string;
  checks: DoctorCheck[];
  _meta?: { version?: string; latestVersion?: string; updateAvailable?: boolean };
};

export type HyperFramesEnvironment = {
  doctor: HyperFramesDoctorResult;
  readyForLocalRender: boolean;
  missingRequiredChecks: DoctorCheck[];
  optionalWarnings: DoctorCheck[];
};

const requiredCheckNames = new Set(["Version", "Node.js", "FFmpeg", "FFprobe", "Chrome"]);

export function parseDoctorOutput(output: string): HyperFramesDoctorResult {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("HyperFrames doctor did not return JSON.");
  const parsed = JSON.parse(output.slice(start, end + 1)) as HyperFramesDoctorResult;
  if (!Array.isArray(parsed.checks)) throw new Error("HyperFrames doctor JSON is missing checks.");
  return parsed;
}

export function summarizeDoctor(doctor: HyperFramesDoctorResult): HyperFramesEnvironment {
  const missingRequiredChecks = doctor.checks.filter((check) => requiredCheckNames.has(check.name) && !check.ok);
  const optionalWarnings = doctor.checks.filter((check) => !requiredCheckNames.has(check.name) && !check.ok);
  return {
    doctor,
    readyForLocalRender: missingRequiredChecks.length === 0,
    missingRequiredChecks,
    optionalWarnings,
  };
}

export async function runHyperFramesDoctor(): Promise<HyperFramesEnvironment> {
  const result = await runCommand(npxExecutable(), npxArguments(["--yes", "hyperframes", "doctor", "--json"]), { cwd: process.cwd() });
  if (result.exitCode !== 0) throw new Error(`HyperFrames doctor process failed (${result.exitCode}): ${result.stderr.trim()}`);
  return summarizeDoctor(parseDoctorOutput(result.stdout));
}
