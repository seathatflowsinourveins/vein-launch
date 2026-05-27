import { homedir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs/promises for file I/O
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const { readFile, appendFile, mkdir } = await import("node:fs/promises");
const { evaluateGate, defaultHistoryPath } = await import("../../tools/eval_gate.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal vitest --reporter=json result object */
function makeVitestResult({ numPassedTests = 100, numTotalTests = 100 } = {}) {
  return {
    numPassedTests,
    numTotalTests,
    numFailedTests: numTotalTests - numPassedTests,
    success: numPassedTests === numTotalTests,
  };
}

/** Build a history entry as it would appear in a JSONL file */
function makeHistoryEntry(score, overrides = {}) {
  return JSON.stringify({
    timestamp: "2026-01-01T00:00:00.000Z",
    commit: "abc1234",
    score,
    totalTests: 100,
    passing: Math.round((score / 100) * 100),
    status: "PASS",
    ...overrides,
  });
}

const COMMIT_MSG_PATH = "/tmp/fake-commit-msg";
const HISTORY_PATH = "/tmp/fake-eval-history.jsonl";

/** A testRunner that resolves with the given result object */
function makeTestRunner(result) {
  return async () => result;
}

/** Always returns "deadbeef" as the git sha */
const fakeGitSha = async () => "deadbeef";

describe("evaluateGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- score equal to baseline → pass ----

  it("passes when current score equals baseline score", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: something\n";
      if (path === HISTORY_PATH) return makeHistoryEntry(90) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 90, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
    expect(appendFile).toHaveBeenCalledOnce();
  });

  // ---- regression within band (-4pp) → pass ----

  it("passes when regression is within the 5pp band", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "fix: minor\n";
      if (path === HISTORY_PATH) return makeHistoryEntry(90) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    // 86/100 = 86pp, baseline 90pp → -4pp within band
    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 86, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
  });

  // ---- regression beyond band (-6pp) → block ----

  it("blocks when regression exceeds the 5pp band", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: big change\n";
      if (path === HISTORY_PATH) return makeHistoryEntry(90) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    // 84/100 = 84pp, baseline 90pp → -6pp beyond band
    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 84, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("BLOCK");
    expect(result.exitCode).toBe(2);
    expect(appendFile).toHaveBeenCalledOnce();
    const written = JSON.parse(appendFile.mock.calls[0][1].trim());
    expect(written.status).toBe("BLOCK");
  });

  // ---- override trailer with rationale + regression beyond band → pass ----

  it("allows override with a non-empty OVERRIDE-EVAL-REGRESSION trailer", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) {
        return "feat: risky\n\nOVERRIDE-EVAL-REGRESSION: intentional test removal\n";
      }
      if (path === HISTORY_PATH) return makeHistoryEntry(90) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    // 80pp vs 90pp baseline → -10pp would block without override
    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 80, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("OVERRIDE");
    expect(result.exitCode).toBe(0);
    expect(result.overrideReason).toBe("intentional test removal");
    const written = JSON.parse(appendFile.mock.calls[0][1].trim());
    expect(written.status).toBe("OVERRIDE");
    expect(written.overrideReason).toBe("intentional test removal");
  });

  // ---- override trailer EMPTY rationale → ignored (still blocks) ----

  it("blocks when OVERRIDE-EVAL-REGRESSION trailer has empty rationale", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) {
        return "feat: risky\n\nOVERRIDE-EVAL-REGRESSION: \n";
      }
      if (path === HISTORY_PATH) return makeHistoryEntry(90) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 80, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("BLOCK");
    expect(result.exitCode).toBe(2);
  });

  // ---- empty history → seed entry written, pass ----

  it("passes on first run (empty history) and writes a seed entry", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: initial\n";
      if (path === HISTORY_PATH) return "";
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 100, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
    expect(appendFile).toHaveBeenCalledOnce();
    const written = JSON.parse(appendFile.mock.calls[0][1].trim());
    expect(written.score).toBe(100);
  });

  // ---- malformed history → graceful warning + pass ----

  it("passes gracefully when history file contains invalid JSON", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "fix: hotfix\n";
      if (path === HISTORY_PATH) return 'THIS IS NOT JSON\n{"broken": true\n';
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 50, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
    expect(result.warning).toMatch(/parse/i);
  });

  // ---- new history entry is appended (not overwriting) ----

  it("appends a new entry to history without overwriting existing entries", async () => {
    const existingEntry = makeHistoryEntry(95);
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "chore: cleanup\n";
      if (path === HISTORY_PATH) return existingEntry + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 93, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    // appendFile should be called (not writeFile which would overwrite)
    expect(appendFile).toHaveBeenCalledOnce();
    const [writtenPath, writtenContent] = appendFile.mock.calls[0];
    expect(writtenPath).toBe(HISTORY_PATH);
    const parsed = JSON.parse(writtenContent.trim());
    expect(parsed.score).toBe(93);
    expect(parsed.commit).toBe("deadbeef");
  });

  // ---- score computation: passingTests / totalTests * 100 ----

  it("computes score correctly as passingTests / totalTests * 100", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "test: add tests\n";
      if (path === HISTORY_PATH) return makeHistoryEntry(80) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    // 37/50 = 74pp
    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 37, numTotalTests: 50 })),
      gitSha: fakeGitSha,
    });

    expect(result.score).toBeCloseTo(74);
    // 74 < 80 - 5 = 75 → BLOCK
    expect(result.status).toBe("BLOCK");
  });

  // ---- history file not found → treated as empty history (first run) ----

  it("treats missing history file as empty history and passes", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: new feature\n";
      if (path === HISTORY_PATH) {
        const err = new Error("ENOENT: no such file");
        // @ts-expect-error
        err.code = "ENOENT";
        throw err;
      }
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 100, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
    expect(appendFile).toHaveBeenCalledOnce();
  });

  // ---- security: trailer in commit body should NOT bypass ----

  it("ignores OVERRIDE-EVAL-REGRESSION when it appears in commit body, not the trailer block", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) {
        // Trailer-shaped line appears in BODY (not the actual trailer block).
        // The real trailer block is "Signed-off-by: ..." after the blank line.
        return "feat: something\n\nOVERRIDE-EVAL-REGRESSION: fake-in-body\n\nSigned-off-by: someone\n";
      }
      if (path === HISTORY_PATH) return makeHistoryEntry(90) + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    // 80pp vs 90pp → -10pp, would block without override
    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 80, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("BLOCK");
    expect(result.exitCode).toBe(2);
  });

  // ---- infrastructure failure: 0 total tests → refuse to seed ----

  it("throws when vitest reports 0 total tests (refuses to seed a 0-score baseline)", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: x\n";
      if (path === HISTORY_PATH) return "";
      throw new Error(`Unexpected read: ${path}`);
    });

    await expect(
      evaluateGate({
        commitMsgPath: COMMIT_MSG_PATH,
        historyPath: HISTORY_PATH,
        testRunner: makeTestRunner({
          numPassedTests: 0,
          numTotalTests: 0,
          numFailedTests: 0,
          success: false,
        }),
        gitSha: fakeGitSha,
      }),
    ).rejects.toThrow(/0 total tests/);
  });

  // ---- uses only the LAST line in history as baseline ----

  it("uses the last JSONL entry as the baseline (not the first)", async () => {
    const oldEntry = makeHistoryEntry(60); // old, low baseline
    const newEntry = makeHistoryEntry(95); // most recent, high baseline
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: check\n";
      // Two entries — should use the last one (95) as baseline
      if (path === HISTORY_PATH) return oldEntry + "\n" + newEntry + "\n";
      throw new Error(`Unexpected read: ${path}`);
    });

    // 88pp — within 5pp of 95? No: 95-5=90, 88 < 90 → BLOCK
    const result = await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 88, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    expect(result.status).toBe("BLOCK");
    expect(result.exitCode).toBe(2);
  });

  // ---- Wave 10.5-B: default path resolves to ~/.vein/eval-history/<project>.jsonl ----

  it("default path resolves to ~/.vein/eval-history/<project>.jsonl", () => {
    const project = basename(process.cwd())
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const expected = join(homedir(), ".vein", "eval-history", `${project}.jsonl`);
    expect(defaultHistoryPath()).toBe(expected);
  });

  // ---- Wave 10.5-B: creates parent directory before appending ----

  it("creates parent directory if missing before appending history entry", async () => {
    readFile.mockImplementation(async (path) => {
      if (path === COMMIT_MSG_PATH) return "feat: dircheck\n";
      if (path === HISTORY_PATH) return "";
      throw new Error(`Unexpected read: ${path}`);
    });

    await evaluateGate({
      commitMsgPath: COMMIT_MSG_PATH,
      historyPath: HISTORY_PATH,
      testRunner: makeTestRunner(makeVitestResult({ numPassedTests: 100, numTotalTests: 100 })),
      gitSha: fakeGitSha,
    });

    // mkdir must be called with the parent dir and { recursive: true }
    expect(mkdir).toHaveBeenCalledOnce();
    const [dirArg, optsArg] = mkdir.mock.calls[0];
    expect(dirArg).toContain("tmp"); // /tmp is the parent of HISTORY_PATH
    expect(optsArg).toEqual({ recursive: true });
    // appendFile still happens after mkdir
    expect(appendFile).toHaveBeenCalledOnce();
  });
});
