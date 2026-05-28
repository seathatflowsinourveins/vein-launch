#!/usr/bin/env node
// instrument-check.mjs — guards against the broken-instrument trap on Git Bash / MSYS.
//
// Premise: when a port/process check returns "nothing matches," that result is only
// trustworthy if the measurement instrument is itself trustworthy. On MSYS, native
// Win32 consumers (findstr, where, tasklist /fi) behave differently than POSIX
// consumers (grep, ss, ps) depending on which env hardening flags are set. A
// "proxy is down" conclusion derived from a single instrument is only as reliable
// as that instrument.
//
// This tool runs the same query through BOTH a native (findstr) and a POSIX (grep)
// pipeline and fails loud if the two disagree, OR if both agree on "nothing" while
// a third independent witness (Node http probe, ss) says the resource exists.
//
// Background: 2026-05-28 MSYS root-cause investigation
// (docs/superpowers/specs/scans/msys-rootcause-synthesis-2026-05-28.md).
//
// Usage:
//   node tools/instrument-check.mjs port 8317
//   node tools/instrument-check.mjs proc node
//   node tools/instrument-check.mjs --json port 8317
//
// Exit codes:
//   0 — instruments agree, resource confirmed (or both report not-present)
//   1 — instruments disagree (broken-instrument trap detected)
//   2 — usage error

import { execSync } from "node:child_process";
import http from "node:http";

const USAGE = `usage: instrument-check.mjs [--json] (port <num> | proc <pattern>)`;

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], shell: "bash" })
      .toString("utf8")
      .split(/\r?\n/)
      .filter((l) => l.length > 0);
  } catch (e) {
    // Non-zero exit is common (e.g. grep exits 1 on no-match). Keep stdout we got.
    if (e.stdout) {
      return e.stdout
        .toString("utf8")
        .split(/\r?\n/)
        .filter((l) => l.length > 0);
    }
    return [];
  }
}

async function nodeProbe(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return { ok: false, code: "INVALID_PORT", message: `port ${port} out of range 1-65535` };
  }
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${n}/`, { timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ ok: true, status: res.statusCode, body: body.slice(0, 200) }));
    });
    req.on("error", (e) => resolve({ ok: false, code: e.code, message: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, code: "TIMEOUT" });
    });
  });
}

function checkPort(port) {
  const native = run(`netstat -ano | findstr ":${port} "`);
  const posix = run(`netstat -ano | grep ":${port} "`);
  return { native, posix };
}

// Pattern is interpolated into a shell pipeline; restrict to safe chars so
// `node instrument-check.mjs proc "x; rm -rf /"` cannot inject shell syntax.
const SAFE_PATTERN = /^[A-Za-z0-9._-]+$/;

function checkProc(pattern) {
  if (!SAFE_PATTERN.test(pattern)) {
    throw new Error(`unsafe pattern: ${JSON.stringify(pattern)} (allowed: [A-Za-z0-9._-]+)`);
  }
  const native = run(`tasklist | findstr /i ${pattern}`);
  const posix = run(`tasklist | grep -i ${pattern}`);
  return { native, posix };
}

function diff(a, b) {
  const inA = a.filter((x) => !b.includes(x));
  const inB = b.filter((x) => !a.includes(x));
  return { onlyNative: inA, onlyPosix: inB, agree: inA.length === 0 && inB.length === 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const rest = args.filter((a) => a !== "--json");
  const [kind, target] = rest;
  if (!kind || !target) {
    console.error(USAGE);
    process.exit(2);
  }

  let result;
  if (kind === "port") {
    const { native, posix } = checkPort(target);
    const d = diff(native, posix);
    const probe = await nodeProbe(target);
    result = {
      kind,
      target,
      native_lines: native.length,
      posix_lines: posix.length,
      agree: d.agree,
      only_native: d.onlyNative,
      only_posix: d.onlyPosix,
      independent_witness: probe,
    };
    if (!d.agree) {
      result.verdict = "BROKEN_INSTRUMENT";
    } else if (native.length === 0 && probe.ok) {
      result.verdict = "FALSE_NEGATIVE_BOTH_SHELL_TOOLS";
    } else if (native.length > 0 && !probe.ok) {
      result.verdict = "PORT_LISTED_BUT_NOT_RESPONDING";
    } else {
      result.verdict = "OK";
    }
  } else if (kind === "proc") {
    const { native, posix } = checkProc(target);
    const d = diff(native, posix);
    // Proc-mode caveat: findstr (token-literal substring) and grep -i (regex) use
    // different match definitions, so non-zero/different counts are common and don't
    // indicate a broken pipe. Treat empty-both as OK, empty-native-only-while-grep-has-data
    // as the real BROKEN_INSTRUMENT signal.
    let verdict;
    if (native.length === 0 && posix.length === 0) verdict = "OK";
    else if (native.length === 0 && posix.length > 0) verdict = "BROKEN_INSTRUMENT";
    else if (d.agree) verdict = "OK";
    else verdict = "PATTERN_SEMANTICS_DIFFER";
    result = {
      kind,
      target,
      native_lines: native.length,
      posix_lines: posix.length,
      agree: d.agree,
      only_native: d.onlyNative,
      only_posix: d.onlyPosix,
      verdict,
    };
  } else {
    console.error(USAGE);
    process.exit(2);
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[instrument-check] ${result.kind}=${result.target}  verdict=${result.verdict}`);
    console.log(`  findstr lines: ${result.native_lines}`);
    console.log(`  grep    lines: ${result.posix_lines}`);
    if (result.independent_witness) {
      const w = result.independent_witness;
      console.log(
        w.ok
          ? `  http witness:  HTTP ${w.status} ${w.body.slice(0, 80)}`
          : `  http witness:  ${w.code} ${w.message ?? ""}`,
      );
    }
    if (!result.agree) {
      console.log(
        `  only in findstr (${result.only_native.length}): ${result.only_native.slice(0, 3).join(" | ")}`,
      );
      console.log(
        `  only in grep    (${result.only_posix.length}): ${result.only_posix.slice(0, 3).join(" | ")}`,
      );
    }
  }

  if (
    result.verdict === "BROKEN_INSTRUMENT" ||
    result.verdict === "FALSE_NEGATIVE_BOTH_SHELL_TOOLS"
  ) {
    process.exit(1);
  }
  process.exit(0);
}

main();
