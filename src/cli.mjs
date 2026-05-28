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

const args = process.argv.slice(2);
if (args.includes("--eval") || args.includes("--eval-mode")) {
  process.exit(0);
}

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
