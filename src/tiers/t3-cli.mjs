import { createResult, Severity } from "../lib/result.mjs";

export const meta = { id: "t3-cli", name: "CLI Tools", modes: ["fast", "deep", "repair"] };

export async function check(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "cli-tools", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}

export async function repair(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "cli-repair", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}
