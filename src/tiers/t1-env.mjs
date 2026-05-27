import { createResult, Severity } from "../lib/result.mjs";

export const meta = { id: "t1-env", name: "ENV", modes: ["fast", "deep", "repair"] };

export async function check(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "env-vars", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}

export async function repair(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "env-repair", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}
