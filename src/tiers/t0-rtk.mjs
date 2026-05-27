import { createResult, Severity } from "../lib/result.mjs";
import { exec } from "../lib/shell.mjs";

export const meta = { id: "t0-rtk", name: "RTK", modes: ["fast", "deep", "repair"] };

const RTK_VERSION_PIN = "0.42";
const IS_WINDOWS = process.platform === "win32";

export async function check(_config, _context) {
  const start = performance.now();
  const evidence = [];

  const version = await exec("rtk --version");
  if (!version.ok) {
    evidence.push({
      check: "rtk-binary",
      actual: "rtk not found on PATH",
      remediation: IS_WINDOWS
        ? "Download from https://github.com/rtk-ai/rtk/releases (rtk-x86_64-pc-windows-msvc.zip), extract to ~/bin/"
        : "brew install rtk OR curl -fsSL https://rtk-ai.app/install.sh | sh",
    });
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.BLOCK,
      evidence,
      durationMs: performance.now() - start,
    });
  }

  const versionMatch = version.stdout.match(/(\d+\.\d+)/);
  const currentVersion = versionMatch?.[1] ?? "unknown";
  if (!currentVersion.startsWith(RTK_VERSION_PIN)) {
    evidence.push({
      check: "rtk-version",
      actual: `v${currentVersion}`,
      expected: `v${RTK_VERSION_PIN}.x`,
      remediation: `Update RTK to v${RTK_VERSION_PIN}.x`,
    });
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.WARN,
      evidence,
      durationMs: performance.now() - start,
    });
  }

  const initShow = await exec("rtk init --show");
  if (IS_WINDOWS) {
    if (!initShow.ok || !initShow.stdout.includes("CLAUDE.md")) {
      evidence.push({
        check: "rtk-claudemd-injection",
        actual: "RTK CLAUDE.md injection not configured (Windows does not support hook mode)",
        remediation: "rtk init -g (installs CLAUDE.md injection mode on Windows)",
      });
      return createResult({
        tierId: meta.id,
        tierName: meta.name,
        severity: Severity.WARN,
        evidence,
        durationMs: performance.now() - start,
      });
    }
  } else {
    if (!initShow.ok || !initShow.stdout.includes("hook")) {
      evidence.push({
        check: "rtk-hook",
        actual: "PreToolUse hook not registered",
        remediation: "rtk init -g",
      });
      return createResult({
        tierId: meta.id,
        tierName: meta.name,
        severity: Severity.WARN,
        evidence,
        durationMs: performance.now() - start,
      });
    }
  }

  evidence.push({
    check: "rtk",
    actual: `v${currentVersion}, ${IS_WINDOWS ? "CLAUDE.md mode" : "hook mode"}`,
  });
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence,
    durationMs: performance.now() - start,
  });
}

export async function repair(_config, _context) {
  const start = performance.now();
  const result = await exec("rtk init -g --auto-patch");
  const ok = result.ok;
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: ok ? Severity.PASS : Severity.BLOCK,
    evidence: [
      {
        check: "rtk-repair",
        actual: ok ? "rtk init -g --auto-patch succeeded" : `repair failed: ${result.stderr}`,
        ...(ok ? {} : { remediation: "Manual: rtk init -g" }),
      },
    ],
    durationMs: performance.now() - start,
  });
}
