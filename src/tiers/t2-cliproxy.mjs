import { createResult, Severity } from "../lib/result.mjs";
import { exec } from "../lib/shell.mjs";

export const meta = { id: "t2-cliproxy", name: "CLIProxy", modes: ["fast", "deep", "repair"] };

/** @returns {import("../lib/result.mjs").TierResult} */
function skipResult(durationMs) {
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.SKIP,
    evidence: [{ check: "cliproxy-configured", actual: "CLIProxy not configured — skipping" }],
    durationMs,
  });
}

/** @param {{ hosting: string }} cliproxy @returns {Promise<{ ok: boolean, evidence: import("../lib/result.mjs").Evidence }>} */
async function checkProcess(cliproxy) {
  if (cliproxy.hosting === "pm2") {
    const res = await exec("pm2 describe cliproxy");
    const online = res.stdout.includes("online");
    return {
      ok: online,
      evidence: {
        check: "cliproxy-process",
        actual: online
          ? "pm2 process online"
          : `pm2 process not online (stdout: ${res.stdout.slice(0, 80)})`,
        ...(online ? {} : { remediation: "Run: pm2 start cliproxy" }),
      },
    };
  }
  const res = await exec("wsl docker compose -f ~/docker/cliproxy/compose.yml ps --format json");
  const running = res.stdout.includes("running");
  return {
    ok: running,
    evidence: {
      check: "cliproxy-process",
      actual: running
        ? "docker container running"
        : `docker container not running (stdout: ${res.stdout.slice(0, 80)})`,
      ...(running
        ? {}
        : { remediation: "Run: wsl docker compose -f ~/docker/cliproxy/compose.yml up -d" }),
    },
  };
}

/** @param {number} port @returns {Promise<{ ok: boolean, body: object|null, evidence: import("../lib/result.mjs").Evidence }>} */
async function checkHttp(port) {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        body: null,
        evidence: {
          check: "cliproxy-health",
          actual: `Health endpoint returned non-JSON response (HTTP ${res.status})`,
          remediation: `Check CLIProxy health endpoint on port ${port} — expected JSON with status field`,
        },
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        body,
        evidence: {
          check: "cliproxy-health",
          actual: `HTTP ${res.status} — status: ${body?.status ?? "unknown"}`,
          remediation: `CLIProxy health check failed (HTTP ${res.status}). Check logs and restart.`,
        },
      };
    }
    return {
      ok: true,
      body,
      evidence: {
        check: "cliproxy-health",
        actual: `HTTP ok — status: ${body?.status ?? "unknown"}`,
      },
    };
  } catch (err) {
    return {
      ok: false,
      body: null,
      evidence: {
        check: "cliproxy-health",
        actual: `Health endpoint unreachable: ${err.message}`,
        remediation: `Ensure CLIProxy is running on port ${port} and /health endpoint is available`,
      },
    };
  }
}

export async function check(config, context) {
  const start = performance.now();

  if (!config.cliproxy?.hosting) {
    return skipResult(performance.now() - start);
  }

  const port = config.cliproxy?.port ?? 8317;
  const processResult = await checkProcess(config.cliproxy);
  const evidence = [processResult.evidence];

  if (!processResult.ok) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.WARN,
      evidence,
      durationMs: performance.now() - start,
    });
  }

  if (context.mode !== "deep") {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.PASS,
      evidence,
      durationMs: performance.now() - start,
    });
  }

  const httpResult = await checkHttp(port);

  if (!httpResult.ok) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.BLOCK,
      evidence: [httpResult.evidence],
      durationMs: performance.now() - start,
    });
  }

  const accounts = httpResult.body?.accounts ?? [];
  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;

  if (!hasAccounts) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.WARN,
      evidence: [
        {
          check: "cliproxy-accounts",
          actual: "No accounts configured",
          remediation: "Add at least one account to CLIProxy configuration",
        },
      ],
      durationMs: performance.now() - start,
    });
  }

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [
      processResult.evidence,
      { check: "cliproxy-accounts", actual: `${accounts.length} account(s) configured` },
    ],
    durationMs: performance.now() - start,
  });
}

export async function repair(config, _context) {
  const start = performance.now();
  const hosting = config.cliproxy?.hosting;

  if (!hosting) {
    return skipResult(performance.now() - start);
  }

  let cmd;
  if (hosting === "pm2") {
    cmd = "pm2 restart cliproxy";
  } else {
    cmd = "wsl docker compose -f ~/docker/cliproxy/compose.yml up -d";
  }

  const res = await exec(cmd);
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: res.ok ? Severity.PASS : Severity.BLOCK,
    evidence: [
      {
        check: "cliproxy-restart",
        actual: res.ok
          ? `Restart succeeded via ${hosting}`
          : `Restart failed: ${res.stderr.slice(0, 120)}`,
        ...(res.ok ? {} : { remediation: `Check ${hosting} logs and retry manually` }),
      },
    ],
    durationMs: performance.now() - start,
  });
}
