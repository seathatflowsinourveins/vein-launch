/**
 * CLI entry point — parses process.argv and delegates to orchestrate().
 *
 * Separated from orchestrator.mjs so orchestrate() is fully testable
 * without spawning a process.
 *
 * Special intercepts (handled before orchestrate):
 *   --doctor               run system health check and exit
 *   --setup --first-time   run first-time setup wizard and exit
 */

import { ExitCodes } from "./lib/result.mjs";
import { orchestrate } from "./orchestrator.mjs";

// Suppress Node DEP0190 — child_process shell:true + array args warning.
// We intentionally use shell:true ONLY for Windows .cmd/.bat shims (pm2, gh, codex)
// in src/lib/shell.mjs, where Node REQUIRES it per CVE-2024-27980 (BatBadBut). Args
// are passed as arrays (not concatenated into a shell string), so the security
// concern DEP0190 raises doesn't apply here. The warning is otherwise noisy.
const __origEmit = process.emit;
process.emit = function (name, data) {
  if (name === "warning" && data?.code === "DEP0190") return false;
  return __origEmit.apply(process, arguments);
};

const args = process.argv.slice(2);

if (args.includes("--manifest")) {
  const { printManifest } = await import("./lib/manifest.mjs");
  const code = await printManifest();
  process.exit(code);
}

// vein --doctor
if (args.includes("--doctor")) {
  const { runDoctorAndPrint } = await import("./setup/doctor.mjs");
  const repoRoot = process.env.VEIN_LAUNCH_ROOT ?? undefined;
  const code = await runDoctorAndPrint({ repoRoot });
  process.exit(code);
}

// vein --setup --first-time  (explicit first-time wizard)
if (args.includes("--setup") && args.includes("--first-time")) {
  const { runFirstTimeSetup, printSetupResult } = await import("./setup/first-time.mjs");
  const repoRoot = process.env.VEIN_LAUNCH_ROOT ?? undefined;
  const result = await runFirstTimeSetup({ repoRoot });
  printSetupResult(result);
  process.exit(result.ok ? ExitCodes.SUCCESS : ExitCodes.TIER_ERROR);
}

orchestrate(args)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[vein] Internal error: ${err.message}`);
    process.exit(ExitCodes.INTERNAL_ERROR);
  });
