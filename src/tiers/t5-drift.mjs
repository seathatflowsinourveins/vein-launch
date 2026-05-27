import { createResult, Severity } from "../lib/result.mjs";

export const meta = { id: "t5-drift", name: "Drift", modes: ["deep", "repair"] };

export async function check(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "mcp-drift", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}

export async function repair(config, context) {
  const start = performance.now();
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "drift-repair", actual: "stub — not yet implemented" }],
    durationMs: performance.now() - start,
  });
}
