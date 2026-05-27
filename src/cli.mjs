/**
 * CLI entry point — parses process.argv and delegates to orchestrate().
 *
 * Separated from orchestrator.mjs so orchestrate() is fully testable
 * without spawning a process.
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

orchestrate(args)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[vein] Internal error: ${err.message}`);
    process.exit(ExitCodes.INTERNAL_ERROR);
  });
