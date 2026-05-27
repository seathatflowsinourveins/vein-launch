import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/setup/rtk.mjs", () => ({ default: vi.fn() }));
vi.mock("../../src/setup/cliproxy.mjs", () => ({ default: vi.fn() }));
vi.mock("../../src/setup/tools.mjs", () => ({ default: vi.fn() }));
vi.mock("../../src/setup/git-config.mjs", () => ({ default: vi.fn() }));
vi.mock("../../src/setup/mise-init.mjs", () => ({ default: vi.fn() }));
vi.mock("../../src/setup/github-rulesets.mjs", () => ({ default: vi.fn() }));

const setupRtk = (await import("../../src/setup/rtk.mjs")).default;
const setupCliproxy = (await import("../../src/setup/cliproxy.mjs")).default;
const setupTools = (await import("../../src/setup/tools.mjs")).default;
const setupGitConfig = (await import("../../src/setup/git-config.mjs")).default;
const setupMiseInit = (await import("../../src/setup/mise-init.mjs")).default;
const setupGithubRulesets = (await import("../../src/setup/github-rulesets.mjs")).default;
const { runSetupWizard } = await import("../../src/setup/index.mjs");

const MOCK_SUCCESS = { ok: true, message: "ok" };
const MOCK_FAIL = { ok: false, message: "failed" };

describe("runSetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupRtk.mockResolvedValue(MOCK_SUCCESS);
    setupCliproxy.mockResolvedValue(MOCK_SUCCESS);
    setupTools.mockResolvedValue(MOCK_SUCCESS);
    setupGitConfig.mockResolvedValue(MOCK_SUCCESS);
    setupMiseInit.mockResolvedValue(MOCK_SUCCESS);
    setupGithubRulesets.mockResolvedValue(MOCK_SUCCESS);
  });

  it("runs all steps in order", async () => {
    const callOrder = [];
    setupRtk.mockImplementation(() => {
      callOrder.push("rtk");
      return Promise.resolve(MOCK_SUCCESS);
    });
    setupTools.mockImplementation(() => {
      callOrder.push("tools");
      return Promise.resolve(MOCK_SUCCESS);
    });
    setupGitConfig.mockImplementation(() => {
      callOrder.push("git-config");
      return Promise.resolve(MOCK_SUCCESS);
    });
    setupCliproxy.mockImplementation(() => {
      callOrder.push("cliproxy");
      return Promise.resolve(MOCK_SUCCESS);
    });
    setupGithubRulesets.mockImplementation(() => {
      callOrder.push("github-rulesets");
      return Promise.resolve(MOCK_SUCCESS);
    });

    await runSetupWizard();

    expect(callOrder).toEqual(["rtk", "tools", "git-config", "cliproxy", "github-rulesets"]);
  });

  it("returns ok:true when all steps pass", async () => {
    const { ok, results } = await runSetupWizard();
    expect(ok).toBe(true);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("returns ok:false when any step fails", async () => {
    setupRtk.mockResolvedValue(MOCK_FAIL);

    const { ok } = await runSetupWizard();
    expect(ok).toBe(false);
  });

  it("skips steps not in the steps list", async () => {
    await runSetupWizard({ steps: ["rtk"] });

    expect(setupRtk).toHaveBeenCalledOnce();
    expect(setupTools).not.toHaveBeenCalled();
    expect(setupGitConfig).not.toHaveBeenCalled();
    expect(setupCliproxy).not.toHaveBeenCalled();
    expect(setupGithubRulesets).not.toHaveBeenCalled();
  });

  it("dryRun mode does not execute step functions", async () => {
    await runSetupWizard({ dryRun: true });

    expect(setupRtk).not.toHaveBeenCalled();
    expect(setupCliproxy).not.toHaveBeenCalled();
    expect(setupTools).not.toHaveBeenCalled();
    expect(setupGitConfig).not.toHaveBeenCalled();
    expect(setupMiseInit).not.toHaveBeenCalled();
    expect(setupGithubRulesets).not.toHaveBeenCalled();
  });

  it("dryRun returns [dry-run] message for each step", async () => {
    const { results } = await runSetupWizard({ dryRun: true });

    for (const r of results) {
      expect(r.message).toBe("[dry-run] skipped");
    }
  });

  it("catches and reports step errors", async () => {
    setupRtk.mockRejectedValue(new Error("network error"));

    const { ok, results } = await runSetupWizard();
    const rtkResult = results.find((r) => r.name === "rtk");
    expect(ok).toBe(false);
    expect(rtkResult.ok).toBe(false);
    expect(rtkResult.message).toBe("network error");
  });

  it("each result includes the step name", async () => {
    const { results } = await runSetupWizard();

    for (const r of results) {
      expect(typeof r.name).toBe("string");
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it("partial step list runs only specified steps", async () => {
    const { results } = await runSetupWizard({ steps: ["rtk", "git-config"] });

    const names = results.map((r) => r.name);
    expect(names).toContain("rtk");
    expect(names).toContain("git-config");
    expect(names).not.toContain("cliproxy");
    expect(names).not.toContain("tools");
    expect(names).not.toContain("github-rulesets");
  });

  it("all results have ok and message fields", async () => {
    const { results } = await runSetupWizard();

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.ok).toBe("boolean");
      expect(typeof r.message).toBe("string");
    }
  });
});
