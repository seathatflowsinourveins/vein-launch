/**
 * Tests for src/setup/github-rulesets.mjs
 * Covers: SAFE_SLUG_RE input validation + exec array-form invocation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
  execArgs: vi.fn(),
}));

const { execArgs } = await import("../../src/lib/shell.mjs");
const setupGithubRulesets = (await import("../../src/setup/github-rulesets.mjs")).default;

function makeExecResult(stdout = "", ok = true) {
  return { ok, stdout, stderr: "", exitCode: ok ? 0 : 1, timedOut: false };
}

beforeEach(() => vi.clearAllMocks());

describe("setupGithubRulesets — input validation", () => {
  it("accepts valid owner and repo slugs", async () => {
    execArgs.mockResolvedValue(makeExecResult("[]"));
    const result = await setupGithubRulesets({ owner: "myorg", repo: "my-repo" });
    expect(result.ok).toBe(true);
  });

  it("rejects owner with shell injection characters: semicolon", async () => {
    const result = await setupGithubRulesets({ owner: "; rm -rf /", repo: "valid" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/[Ii]nvalid/);
  });

  it("rejects repo with shell injection characters: pipe", async () => {
    const result = await setupGithubRulesets({ owner: "valid", repo: "repo | bad" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/[Ii]nvalid/);
  });

  it("rejects owner with backtick injection", async () => {
    const result = await setupGithubRulesets({ owner: "`whoami`", repo: "valid" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/[Ii]nvalid/);
  });

  it("rejects owner with dollar sign injection", async () => {
    const result = await setupGithubRulesets({ owner: "$(cat /etc/passwd)", repo: "valid" });
    expect(result.ok).toBe(false);
  });

  it("rejects owner with path traversal", async () => {
    const result = await setupGithubRulesets({ owner: "../etc", repo: "valid" });
    expect(result.ok).toBe(false);
  });

  it("accepts owner/repo with dots and hyphens", async () => {
    execArgs.mockResolvedValue(makeExecResult("[]"));
    const result = await setupGithubRulesets({ owner: "my.org", repo: "my-repo.js" });
    expect(result.ok).toBe(true);
  });

  it("skips when owner or repo is missing", async () => {
    const result = await setupGithubRulesets({});
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/[Ss]kipping/);
    expect(execArgs).not.toHaveBeenCalled();
  });
});

describe("setupGithubRulesets — execArgs array form", () => {
  it("calls execArgs with array args (not a shell string with owner/repo interpolated)", async () => {
    execArgs.mockResolvedValue(makeExecResult("[]"));
    await setupGithubRulesets({ owner: "myorg", repo: "myrepo" });
    expect(execArgs).toHaveBeenCalledOnce();
    const [cmd, args] = execArgs.mock.calls[0];
    // cmd must be "gh" and args must be an array containing the path
    expect(cmd).toBe("gh");
    expect(Array.isArray(args)).toBe(true);
    // owner and repo should appear as discrete argument values, not embedded in a shell string
    const fullArgs = args.join(" ");
    expect(fullArgs).toContain("myorg");
    expect(fullArgs).toContain("myrepo");
  });

  it("returns skipping message when already configured", async () => {
    execArgs.mockResolvedValue(makeExecResult('{"rules":[{"type":"branch-protection"}]}'));
    const result = await setupGithubRulesets({ owner: "org", repo: "repo" });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/[Aa]lready|[Mm]anual/);
  });
});
