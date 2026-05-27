/**
 * JSON reporter for CI mode (--ci flag).
 * Implements 12-Factor Agent F11: "Trigger from anywhere."
 */

export function reportJson(results, config) {
  const output = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    project: config.args?.project ?? null,
    mode: config.mode,
    results: results.map((r) => ({
      tierId: r.tierId,
      tierName: r.tierName,
      severity: r.severity,
      durationMs: r.durationMs,
      evidence: r.evidence,
      cacheSource: r.cacheSource ?? null,
    })),
  };

  console.log(JSON.stringify(output));
}
