/**
 * eval_gate.mjs — Wave 10-A / Wave 11-B1 eval regression gate
 *
 * Usage (hook):  node tools/eval_gate.mjs <commit-msg-file>
 * Exit codes:    0 = pass, 2 = blocked
 *
 * Programmatic API:
 *   import { evaluateGate } from "./tools/eval_gate.mjs";
 *   const result = await evaluateGate({ commitMsgPath, historyPath, testRunner, gitSha, behavioralRunner });
 *
 * Wave 11-B1 additions:
 *   - behavioralRunner (injected dep): called after vitest if promptfoo gate enabled
 *   - behavioralScore persisted to history entry
 *   - Gate blocks if EITHER vitest score OR behavioral score regresses by >5pp
 */

import { exec, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** Regression band in percentage points — block when drop exceeds this value */
const REGRESSION_BAND_PP = 5;

/**
 * Resolve the per-project eval-history path outside the repo.
 *
 * WHY outside-repo:
 *   1. Recursion guard — the eval-gate hook APPENDs to this file on every
 *      commit, which makes `docs/eval-history.jsonl` permanently dirty in git.
 *      Keeping it in the repo creates an infinite "modified" loop.
 *   2. Tamper resistance — a file tracked by git could be deleted or reset to
 *      get a free first-run pass. An external path under ~/.vein/ is not
 *      affected by `git clean`, `git checkout`, or worktree operations.
 *
 * Pattern: ~/.vein/eval-history/<slug>-<cwd-hash>.jsonl
 *   <slug>     = basename(cwd) normalized (lowercase, [a-z0-9-]+, ≤80 chars,
 *                falls back to "project" when basename has no safe chars).
 *   <cwd-hash> = first 8 hex chars of sha256(process.cwd()) — disambiguates
 *                worktrees and similarly-named projects that share a slug.
 *
 * @returns {string}
 */
export function defaultHistoryPath() {
  const raw = basename(process.cwd())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const slug = raw || "project";
  const hash = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 8);
  return join(homedir(), ".vein", "eval-history", `${slug}-${hash}.jsonl`);
}

/**
 * Ensure the parent directory of historyPath exists.
 * Safe to call repeatedly — mkdir with { recursive: true } is idempotent.
 *
 * @param {string} historyPath
 * @returns {Promise<void>}
 */
async function ensureHistoryDir(historyPath) {
  await mkdir(dirname(historyPath), { recursive: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse the last non-empty JSONL line from historyPath.
 * Returns null when the file is missing or empty.
 * Returns { warning, baseline: null } on parse errors.
 *
 * @param {string} path
 * @returns {Promise<{ baseline: object | null, warning?: string }>}
 */
async function readLastBaseline(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { baseline: null };
    throw err;
  }

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { baseline: null };

  // Walk from the end to find the last parseable line
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      return { baseline: parsed };
    } catch {
      // continue to previous line
    }
  }

  return { baseline: null, warning: "History file could not be parsed — treating as first run" };
}

/**
 * Extract the OVERRIDE-EVAL-REGRESSION trailer value from a commit message.
 * Only matches within the trailer block (after the last blank line) so a
 * fake `OVERRIDE-EVAL-REGRESSION:` token in the commit body cannot bypass.
 *
 * @param {string} msg
 * @returns {string | null}
 */
function extractOverrideRationale(msg) {
  const lines = msg.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  let trailerStart = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "") {
      trailerStart = i + 1;
      break;
    }
  }
  const trailerBlock = lines.slice(trailerStart).join("\n");
  const match = trailerBlock.match(/^OVERRIDE-EVAL-REGRESSION:\s*(.+)$/m);
  if (!match) return null;
  const rationale = match[1].trim();
  return rationale.length > 0 ? rationale : null;
}

/**
 * Default test runner: spawns `npx vitest run --reporter=json` and parses stdout.
 *
 * @returns {Promise<{ numPassedTests: number, numTotalTests: number }>}
 */
async function defaultTestRunner() {
  let stdout;
  try {
    const result = await execAsync("npx vitest run --reporter=json");
    stdout = result.stdout;
  } catch (err) {
    // vitest exits non-zero when tests fail but still writes JSON to stdout —
    // we MUST parse that JSON or every real regression silently slips the gate.
    stdout = err.stdout ?? "";
    if (!stdout) throw err;
  }
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) throw new Error("vitest --reporter=json produced no JSON output");
  return JSON.parse(stdout.slice(jsonStart));
}

/**
 * Default git SHA resolver: reads HEAD via `git rev-parse --short HEAD`.
 *
 * @returns {Promise<string>}
 */
async function defaultGitSha() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"]);
  return stdout.trim();
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GateResult
 * @property {"PASS"|"BLOCK"|"OVERRIDE"} status
 * @property {number} exitCode  0 or 2
 * @property {number} score     passingTests / totalTests * 100
 * @property {number} [behavioralScore]  0-100 promptfoo pass rate (when gate enabled)
 * @property {string} [overrideReason]
 * @property {string} [warning]
 */

/**
 * Evaluate whether the current test run passes the regression gate.
 *
 * Wave 11-B1: adds optional behavioralRunner (promptfoo gate).
 *   - When behavioralRunner is provided, it is called after vitest.
 *   - Gate blocks if EITHER vitest score OR behavioral score regresses >5pp.
 *   - behavioralScore is persisted to the history entry for trend tracking.
 *
 * @param {{
 *   commitMsgPath: string,
 *   historyPath?: string,
 *   testRunner?: () => Promise<{ numPassedTests: number, numTotalTests: number }>,
 *   gitSha?: () => Promise<string>,
 *   behavioralRunner?: (() => Promise<{ behavioralScore: number }>) | null,
 * }} opts
 * @returns {Promise<GateResult>}
 */
export async function evaluateGate({
  commitMsgPath,
  historyPath = defaultHistoryPath(),
  testRunner = defaultTestRunner,
  gitSha = defaultGitSha,
  behavioralRunner = null,
}) {
  // 1. Read commit message and extract override trailer
  const commitMsg = await readFile(commitMsgPath, "utf8");
  const overrideRationale = extractOverrideRationale(commitMsg);

  // 2. Read baseline from history
  const { baseline, warning } = await readLastBaseline(historyPath);

  // 3. Run vitest
  const testResult = await testRunner();
  const { numPassedTests, numTotalTests } = testResult;
  if (!Number.isFinite(numTotalTests) || numTotalTests <= 0) {
    throw new Error(
      "Eval gate: vitest reported 0 total tests — refusing to seed a 0-score baseline (treat as infrastructure failure)",
    );
  }
  const score = (numPassedTests / numTotalTests) * 100;

  // 3b. Run behavioral eval (promptfoo) if runner is injected
  /** @type {number | undefined} */
  let behavioralScore;
  if (typeof behavioralRunner === "function") {
    // Wave 11 codex review BLOCK fix: errors must throw, not silently become
    // `behavioralScore=undefined`. The old swallow path let behavioral
    // regressions pass as vitest-only PASS — fail closed instead.
    try {
      const behavResult = await behavioralRunner();
      behavioralScore = behavResult.behavioralScore;
    } catch (err) {
      throw new Error(`Eval gate behavioral runner failed: ${err.message}`);
    }
  }

  // 4. Resolve git sha
  const commit = await gitSha();

  // 5. Determine status
  let status;
  let exitCode;

  if (warning !== undefined || baseline === null) {
    // First-run or parse error → always pass
    status = "PASS";
    exitCode = 0;
  } else {
    const vitestDrop = baseline.score - score;
    const baselineBehavioral = baseline.behavioralScore ?? null;
    const behavioralDrop =
      baselineBehavioral !== null && behavioralScore !== undefined
        ? baselineBehavioral - behavioralScore
        : 0;

    const regressed = vitestDrop > REGRESSION_BAND_PP || behavioralDrop > REGRESSION_BAND_PP;

    if (!regressed) {
      status = "PASS";
      exitCode = 0;
    } else if (overrideRationale !== null) {
      status = "OVERRIDE";
      exitCode = 0;
    } else {
      status = "BLOCK";
      exitCode = 2;
    }
  }

  // 6. Build history entry
  /** @type {object} */
  const entry = {
    timestamp: new Date().toISOString(),
    commit,
    score,
    totalTests: numTotalTests,
    passing: numPassedTests,
    status,
  };

  if (behavioralScore !== undefined) {
    entry.behavioralScore = behavioralScore;
  }

  if (status === "OVERRIDE" && overrideRationale !== null) {
    entry.overrideReason = overrideRationale;
  }

  // 7. Append to history (one JSONL line) — ensure parent dir exists first
  await ensureHistoryDir(historyPath);
  await appendFile(historyPath, `${JSON.stringify(entry)}\n`, "utf8");

  /** @type {GateResult} */
  const result = { status, exitCode, score };
  if (behavioralScore !== undefined) result.behavioralScore = behavioralScore;
  if (status === "OVERRIDE") result.overrideReason = overrideRationale ?? undefined;
  if (warning !== undefined) result.warning = warning;

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// Guard: only run as main module
const isMain =
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname.endsWith(
    process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "",
  );

if (isMain || process.argv[1]?.endsWith("eval_gate.mjs")) {
  const commitMsgPath = process.argv[2];
  if (!commitMsgPath) {
    process.stderr.write("Usage: node tools/eval_gate.mjs <commit-msg-file>\n");
    process.exit(1);
  }

  // Wave 11 codex review BLOCK fix: conditionally inject the behavioral runner
  // when `.vein.json` opts in via `quality.promptfooGate: true`. Without this
  // wire the entire promptfoo gating pipeline is unreachable from the CLI
  // (i.e. dead code in production).
  let behavioralRunner;
  try {
    const cfgRaw = await readFile(join(process.cwd(), ".vein.json"), "utf8");
    const cfg = JSON.parse(cfgRaw);
    if (cfg?.quality?.promptfooGate === true) {
      const { runBehavioralEval } = await import("./behavioral_eval.mjs");
      behavioralRunner = runBehavioralEval;
    }
  } catch {
    // Missing or unreadable .vein.json — leave behavioralRunner unset.
  }

  try {
    const result = await evaluateGate({ commitMsgPath, behavioralRunner });

    if (result.status === "BLOCK") {
      process.stderr.write(
        `[eval-gate] BLOCKED: score ${result.score.toFixed(1)}pp dropped more than ${REGRESSION_BAND_PP}pp below baseline.\n`,
      );
    } else if (result.status === "OVERRIDE") {
      process.stdout.write(`[eval-gate] OVERRIDE accepted: ${result.overrideReason}\n`);
    } else {
      if (result.warning) {
        process.stderr.write(`[eval-gate] WARNING: ${result.warning}\n`);
      }
      process.stdout.write(`[eval-gate] PASS: score ${result.score.toFixed(1)}pp\n`);
    }

    process.exit(result.exitCode);
  } catch (err) {
    process.stderr.write(`[eval-gate] ERROR: ${err.message}\n`);
    process.exit(1);
  }
}
