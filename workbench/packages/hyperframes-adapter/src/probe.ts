import { runHyperFramesDoctor } from "./doctor.js";

const result = await runHyperFramesDoctor();
console.log(JSON.stringify({
  readyForLocalRender: result.readyForLocalRender,
  version: result.doctor._meta?.version,
  missingRequiredChecks: result.missingRequiredChecks,
  optionalWarnings: result.optionalWarnings,
}, null, 2));
if (!result.readyForLocalRender) process.exitCode = 1;
