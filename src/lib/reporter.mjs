/**
 * Reporter — structured console output for tier results.
 */

import { Severity } from "./result.mjs";

const SEVERITY_ICONS = {
  [Severity.PASS]: "✓",
  [Severity.INFO]: "ℹ",
  [Severity.WARN]: "⚠",
  [Severity.BLOCK]: "✗",
  [Severity.SKIP]: "—",
  [Severity.ERROR]: "✖",
};

const SEVERITY_COLORS = {
  [Severity.PASS]: "\x1b[32m",
  [Severity.INFO]: "\x1b[36m",
  [Severity.WARN]: "\x1b[33m",
  [Severity.BLOCK]: "\x1b[31m",
  [Severity.SKIP]: "\x1b[90m",
  [Severity.ERROR]: "\x1b[31;1m",
};

const RESET = "\x1b[0m";

export function report(results, config) {
  console.log(`\n  vein-launch [${config.mode}] ${config.projectDir ?? "."}\n`);

  for (const r of results) {
    const icon = SEVERITY_ICONS[r.severity];
    const color = SEVERITY_COLORS[r.severity];
    const time = r.durationMs > 0 ? ` (${Math.round(r.durationMs)}ms)` : "";
    console.log(`  ${color}${icon}${RESET} ${r.tierName}${time}`);

    for (const e of r.evidence) {
      if (
        r.severity === Severity.BLOCK ||
        r.severity === Severity.WARN ||
        r.severity === Severity.ERROR
      ) {
        console.log(`    ${e.check}: ${e.actual}`);
        if (e.remediation) console.log(`    ${color}fix: ${e.remediation}${RESET}`);
      }
    }
    if (r.severity === Severity.ERROR && r.diagnostics?.stack) {
      console.log(
        `    ${SEVERITY_COLORS[Severity.ERROR]}${r.diagnostics.stack.split("\n")[1]?.trim() ?? ""}${RESET}`,
      );
    }
  }

  console.log();
}
