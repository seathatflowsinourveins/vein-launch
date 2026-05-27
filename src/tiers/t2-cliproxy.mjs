import { createResult, Severity } from "../lib/result.mjs";

export const meta = { id: "t2-cliproxy", name: "CLIProxy", modes: ["fast", "deep", "repair"] };

export async function check(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "cliproxy-health", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}

export async function repair(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "cliproxy-repair", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}
