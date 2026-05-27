import { describe, expect, it } from "vitest";
import { buildLaunchArgs, buildLaunchEnv } from "../../src/lib/exec.mjs";

describe("buildLaunchEnv", () => {
  it("sets ANTHROPIC_BASE_URL when cliproxy is active", () => {
    const env = buildLaunchEnv({ _cliproxyActive: true, cliproxy: { port: 8317 } });
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:8317");
  });

  it("uses default port 8317 when cliproxy.port is not set", () => {
    const env = buildLaunchEnv({ _cliproxyActive: true });
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:8317");
  });

  it("does NOT set ANTHROPIC_BASE_URL when cliproxy is not active", () => {
    const env = buildLaunchEnv({ _cliproxyActive: false });
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it("sets CLAUDE_CODE_SUBAGENT_MODEL from modelRouting.subagents", () => {
    const env = buildLaunchEnv({ modelRouting: { subagents: "claude-haiku-4-5" } });
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("claude-haiku-4-5");
  });

  it("does NOT set CLAUDE_CODE_SUBAGENT_MODEL when modelRouting.subagents is absent", () => {
    const env = buildLaunchEnv({});
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBeUndefined();
  });

  it("always sets CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1", () => {
    const envActive = buildLaunchEnv({ _cliproxyActive: true });
    const envInactive = buildLaunchEnv({});
    expect(envActive.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
    expect(envInactive.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });

  it("merges .vein.json env overrides", () => {
    const env = buildLaunchEnv({ env: { MY_CUSTOM_VAR: "hello", OTHER: "world" } });
    expect(env.MY_CUSTOM_VAR).toBe("hello");
    expect(env.OTHER).toBe("world");
  });

  it("env overrides can overwrite built-in values", () => {
    const env = buildLaunchEnv({
      _cliproxyActive: true,
      cliproxy: { port: 8317 },
      env: { ANTHROPIC_BASE_URL: "http://custom:9999" },
    });
    expect(env.ANTHROPIC_BASE_URL).toBe("http://custom:9999");
  });
});

describe("buildLaunchArgs", () => {
  it("always includes --dangerously-skip-permissions", () => {
    const args = buildLaunchArgs({});
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("appends pass-through args after the fixed flags", () => {
    const args = buildLaunchArgs({}, ["--model", "claude-opus-4-5"]);
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--model");
    expect(args).toContain("claude-opus-4-5");
    const skipIdx = args.indexOf("--dangerously-skip-permissions");
    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThan(skipIdx);
  });

  it("returns only fixed flags when no pass-through args given", () => {
    expect(buildLaunchArgs({})).toEqual(["--dangerously-skip-permissions"]);
    expect(buildLaunchArgs({}, [])).toEqual(["--dangerously-skip-permissions"]);
  });
});
