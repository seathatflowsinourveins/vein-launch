# vein-launch Waves 1-9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement vein-launch from scaffold to shippable v1.0 — a SOTA Claude Code launcher with 7-tier precheck, CLIProxy dual-hosting, RTK token compression, and GPT-5.5 quality gates.

**Architecture:** Thin PS1 shell → Node.js ESM orchestrator → tier modules (each exports `{ meta, check, repair }`) → environment setup → `exec claude`. Three locations: C:\SEA\ (source), ~/ (tool state), WSL2 ~/docker/ (containers). Per-project `.vein.json` drives all config.

**Tech Stack:** Node 24 ESM, Biome 2.4, Vitest 3.2, mise, Lefthook, RTK 0.42, CLIProxyAPI 7.1, Codex CLI 0.134 (GPT-5.5), release-please, Gitleaks+TruffleHog, CodeQL, GitNexus MCP.

**Existing scaffold:** Wave 0 complete — 77 files, 10 passing tests, 6 interface contracts. All tier stubs exist with `{ meta, check, repair }` exports returning stub `TierResult`s. `src/lib/result.mjs` (TierResult type), `src/lib/config.mjs` (arg parser + config loader), `src/lib/runner.mjs` (tier sequencer), `src/lib/reporter.mjs` (console output) are functional stubs.

**Parallelism:** Waves 2 tasks (T0-T3) are independent — execute with parallel subagents using `isolation: worktree`. Waves 3 tasks (T4-T6) are also independent. Wave 4 (CLIProxy) depends on T2 from Wave 2.

---

## File Map

### Wave 1 — Core Launcher
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/lib/config.mjs` | Add ajv schema validation, project resolution, defaults merge |
| Modify | `src/lib/runner.mjs` | Add repair mode, budget enforcement with early exit |
| Modify | `src/lib/reporter.mjs` | Structured table output with timing and severity colors |
| Modify | `src/orchestrator.mjs` | Wire config→runner→reporter→exec claude pipeline |
| Modify | `bin/vein.ps1` | Handle pass-through args, error display |
| Create | `src/lib/exec.mjs` | Spawn `claude` with configured env vars |
| Create | `tests/lib/config.test.mjs` | Config loading + validation tests |
| Create | `tests/lib/runner.test.mjs` | Runner budget + sequencing tests |
| Create | `tests/orchestrator.test.mjs` | End-to-end orchestration tests |

### Wave 2 — Tiers T0-T3 (parallelizable)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/tiers/t0-rtk.mjs` | Check rtk binary, version, hook registration |
| Modify | `src/tiers/t1-env.mjs` | Check env vars, state-dir, stale sessions |
| Modify | `src/tiers/t2-cliproxy.mjs` | Check process (PM2/Docker), health endpoint, accounts |
| Modify | `src/tiers/t3-cli.mjs` | Check mise-managed tool versions |
| Create | `src/lib/shell.mjs` | Safe child_process wrapper (exec with timeout) |
| Create | `tests/tiers/t0-rtk.test.mjs` | RTK tier tests |
| Create | `tests/tiers/t1-env.test.mjs` | ENV tier tests |
| Create | `tests/tiers/t2-cliproxy.test.mjs` | CLIProxy tier tests |
| Create | `tests/tiers/t3-cli.test.mjs` | CLI tools tier tests |
| Create | `tests/lib/shell.test.mjs` | Shell wrapper tests |

### Wave 3 — Tiers T4-T6 + Block Rules (parallelizable)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/tiers/t4-github.mjs` | Check rulesets, SSH signing, auth scopes |
| Modify | `src/tiers/t5-drift.mjs` | Check MCP roster, version pins, smoke test |
| Modify | `src/tiers/t6-codegraph.mjs` | Check GitNexus index freshness, trigger bg reindex |
| Create | `src/lib/block-engine.mjs` | Load block-rules.json, match tier results to rules |
| Modify | `src/lib/runner.mjs` | Integrate block engine after each tier |
| Create | `tests/tiers/t4-github.test.mjs` | GitHub tier tests |
| Create | `tests/tiers/t5-drift.test.mjs` | Drift tier tests |
| Create | `tests/tiers/t6-codegraph.test.mjs` | CodeGraph tier tests |
| Create | `tests/lib/block-engine.test.mjs` | Block engine tests |

### Wave 4 — CLIProxy Manager
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/cliproxy/manager.mjs` | Lifecycle orchestrator (start/stop/health/restart) |
| Create | `src/cliproxy/pm2.mjs` | PM2 process management |
| Create | `src/cliproxy/docker.mjs` | Docker compose management (via WSL2) |
| Create | `src/cliproxy/accounts.mjs` | Account CRUD, rotation, health |
| Create | `src/cliproxy/config-gen.mjs` | Generate config.yaml from template |
| Create | `src/cliproxy/cache-check.mjs` | Cache validation (two identical requests) |
| Create | `src/cliproxy/metrics.mjs` | Cache rate, token efficiency |
| Create | `tests/cliproxy/manager.test.mjs` | Manager tests |
| Create | `tests/cliproxy/cache-check.test.mjs` | Cache validation tests |

### Wave 5 — Parallel Sessions + Agent Teams
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/parallel.mjs` | Multi-session spawner (Windows Terminal tabs) |
| Create | `src/team.mjs` | Agent team config writer |
| Create | `tests/parallel.test.mjs` | Parallel session tests |

### Wave 6 — Quality Gates
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/quality/codex-review.mjs` | GPT-5.5 stop-review hook |
| Create | `src/quality/ship-gate.mjs` | Dual-model pre-merge gate |
| Create | `src/quality/test-gate.mjs` | TeammateIdle test runner |
| Create | `src/hooks/session-start.mjs` | SessionStart hook |
| Create | `src/hooks/teammate-idle.mjs` | TeammateIdle hook |
| Create | `src/hooks/stop-handler.mjs` | Stop hook for Codex review |
| Create | `tests/quality/codex-review.test.mjs` | Quality gate tests |

### Wave 7 — Setup Automation
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/setup/index.mjs` | Setup wizard orchestrator |
| Create | `src/setup/rtk.mjs` | RTK installation |
| Create | `src/setup/cliproxy.mjs` | CLIProxy setup (Docker or PM2) |
| Create | `src/setup/tools.mjs` | mise tool installation |
| Create | `src/setup/git-config.mjs` | Git config (SSH signing, autocrlf, etc.) |
| Create | `src/setup/mise-init.mjs` | mise initialization |
| Create | `src/setup/github-rulesets.mjs` | GitHub rulesets creation via gh api |
| Create | `tests/setup/index.test.mjs` | Setup wizard tests |

### Wave 8 — Project Management
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/project-config.mjs` | Project registry (~/.vein/projects.json) |
| Modify | `src/lib/config.mjs` | Integrate project registry for alias resolution |
| Create | `tests/project-config.test.mjs` | Project management tests |

### Wave 9 — Packaging + CI
| Action | File | Purpose |
|--------|------|---------|
| Modify | `package.json` | Add bin entry, files list, publishConfig |
| Modify | `.github/workflows/ci.yml` | Add promptfoo eval step |
| Create | `evals/datasets/fast-mode.yaml` | Promptfoo eval dataset |
| Modify | `README.md` | Full documentation |

---

## Wave 1: Core Launcher

### Task 1.1: Config Validation with ajv

**Files:**
- Modify: `src/lib/config.mjs`
- Test: `tests/lib/config.test.mjs`

- [ ] **Step 1: Write failing tests for config validation**

```javascript
// tests/lib/config.test.mjs
import { describe, it, expect } from "vitest";
import { parseArgs, resolveProject, loadConfig, validateProjectConfig } from "../../src/lib/config.mjs";

describe("parseArgs", () => {
  it("parses project name", () => {
    const result = parseArgs(["trading"]);
    expect(result.project).toBe("trading");
    expect(result.mode).toBe("fast");
  });

  it("parses --mode=deep", () => {
    const result = parseArgs(["trading", "--mode=deep"]);
    expect(result.mode).toBe("deep");
  });

  it("parses --setup as command", () => {
    const result = parseArgs(["--setup"]);
    expect(result.command).toBe("setup");
  });

  it("captures pass-through after --", () => {
    const result = parseArgs(["trading", "--", "--model", "opus"]);
    expect(result.passThrough).toEqual(["--model", "opus"]);
  });

  it("returns fast mode by default with no project", () => {
    const result = parseArgs([]);
    expect(result.project).toBeNull();
    expect(result.mode).toBe("fast");
  });
});

describe("validateProjectConfig", () => {
  it("accepts valid .vein.json", () => {
    const config = { project: "trading", mode: { default: "deep" } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(true);
  });

  it("rejects missing project field", () => {
    const config = { mode: { default: "fast" } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects forbidden env vars", () => {
    const config = { project: "test", env: { ANTHROPIC_API_KEY: "sk-xxx" } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects unknown fields", () => {
    const config = { project: "test", scripts: { exec: "rm -rf /" } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
  });

  it("accepts config with all optional fields", () => {
    const config = {
      project: "trading",
      mode: { default: "deep" },
      cliproxy: { hosting: "docker", accounts: ["claude-1"], sessionAffinity: true },
      quality: { codexReview: "every-stop", shipGate: true },
      modelRouting: { default: "opus", subagents: "haiku" },
    };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run tests/lib/config.test.mjs -v`
Expected: FAIL — `validateProjectConfig` is not exported

- [ ] **Step 3: Implement config validation**

Add to `src/lib/config.mjs`:

```javascript
import Ajv from "ajv";

const SCHEMA_PATH = new URL("../../config/schema.json", import.meta.url);
const FORBIDDEN_ENV = ["ANTHROPIC_API_KEY", "PATH", "HOME", "USERPROFILE"];

let _schema = null;
async function getSchema() {
  if (!_schema) _schema = JSON.parse(await readFile(SCHEMA_PATH, "utf-8"));
  return _schema;
}

export function validateProjectConfig(config) {
  const ajv = new Ajv({ allErrors: true });
  // Inline the schema check since we can't async in a sync validator
  // For the forbidden env check, we do it manually
  const schemaPath = new URL("../../config/schema.json", import.meta.url);
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const validate = ajv.compile(schema);
  const valid = validate(config);

  if (!valid) {
    return { valid: false, errors: validate.errors.map((e) => `${e.instancePath} ${e.message}`) };
  }

  // Check forbidden env vars
  if (config.env) {
    for (const key of Object.keys(config.env)) {
      if (FORBIDDEN_ENV.includes(key)) {
        return { valid: false, errors: [`env.${key} is forbidden in .vein.json`] };
      }
    }
  }

  return { valid: true, errors: [] };
}
```

Also add `import { readFileSync } from "node:fs";` at the top.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run tests/lib/config.test.mjs -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.mjs tests/lib/config.test.mjs
git commit -m "feat(config): add ajv schema validation for .vein.json"
```

---

### Task 1.2: Shell Execution Helper

**Files:**
- Create: `src/lib/shell.mjs`
- Test: `tests/lib/shell.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/lib/shell.test.mjs
import { describe, it, expect } from "vitest";
import { exec } from "../../src/lib/shell.mjs";

describe("shell exec", () => {
  it("runs a command and returns stdout", async () => {
    const result = await exec("node --version");
    expect(result.stdout).toMatch(/^v\d+/);
    expect(result.exitCode).toBe(0);
  });

  it("returns stderr on failure", async () => {
    const result = await exec("node -e \"process.exit(1)\"");
    expect(result.exitCode).toBe(1);
  });

  it("times out after budget", async () => {
    const result = await exec("node -e \"setTimeout(()=>{},10000)\"", { timeout: 500 });
    expect(result.timedOut).toBe(true);
  });

  it("returns which result for binary check", async () => {
    const result = await exec("node --version");
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run tests/lib/shell.test.mjs -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement shell helper**

```javascript
// src/lib/shell.mjs
import { execFile } from "node:child_process";

export function exec(command, options = {}) {
  const { timeout = 10_000, cwd } = options;
  const [cmd, ...args] = command.split(/\s+/);

  return new Promise((resolve) => {
    const proc = execFile(cmd, args, { timeout, cwd, shell: true, windowsHide: true }, (err, stdout, stderr) => {
      if (err?.killed) {
        resolve({ ok: false, stdout: "", stderr: "", exitCode: -1, timedOut: true });
        return;
      }
      const exitCode = err?.code ?? 0;
      resolve({
        ok: exitCode === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        timedOut: false,
      });
    });
  });
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run tests/lib/shell.test.mjs -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell.mjs tests/lib/shell.test.mjs
git commit -m "feat(lib): add shell exec helper with timeout support"
```

---

### Task 1.3: Claude Launcher (exec)

**Files:**
- Create: `src/lib/exec.mjs`
- Test: `tests/lib/exec.test.mjs`

- [ ] **Step 1: Write failing test**

```javascript
// tests/lib/exec.test.mjs
import { describe, it, expect } from "vitest";
import { buildLaunchEnv, buildLaunchArgs } from "../../src/lib/exec.mjs";

describe("buildLaunchEnv", () => {
  it("sets ANTHROPIC_BASE_URL when CLIProxy active", () => {
    const config = { cliproxy: { port: 8317 }, _cliproxyActive: true };
    const env = buildLaunchEnv(config);
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:8317");
    expect(env.ENABLE_TOOL_SEARCH).toBe("true");
  });

  it("does not set ANTHROPIC_BASE_URL when CLIProxy inactive", () => {
    const config = { _cliproxyActive: false };
    const env = buildLaunchEnv(config);
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it("sets CLAUDE_CODE_SUBAGENT_MODEL from modelRouting", () => {
    const config = { modelRouting: { subagents: "claude-haiku-4-5" }, _cliproxyActive: false };
    const env = buildLaunchEnv(config);
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("claude-haiku-4-5");
  });

  it("sets agent teams env var", () => {
    const config = { _cliproxyActive: false };
    const env = buildLaunchEnv(config);
    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });
});

describe("buildLaunchArgs", () => {
  it("includes --dangerously-skip-permissions by default", () => {
    const args = buildLaunchArgs({}, []);
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("appends pass-through args", () => {
    const args = buildLaunchArgs({}, ["--model", "opus"]);
    expect(args).toContain("--model");
    expect(args).toContain("opus");
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run tests/lib/exec.test.mjs -v`

- [ ] **Step 3: Implement launch builder**

```javascript
// src/lib/exec.mjs
import { execSync } from "node:child_process";

export function buildLaunchEnv(config) {
  const env = {};

  if (config._cliproxyActive) {
    const port = config.cliproxy?.port ?? 8317;
    env.ANTHROPIC_BASE_URL = `http://localhost:${port}`;
    env.ENABLE_TOOL_SEARCH = "true";
  }

  if (config.modelRouting?.subagents) {
    env.CLAUDE_CODE_SUBAGENT_MODEL = config.modelRouting.subagents;
  }

  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";

  // Merge .vein.json env overrides (already validated, forbidden keys stripped)
  if (config.env) {
    Object.assign(env, config.env);
  }

  return env;
}

export function buildLaunchArgs(config, passThrough) {
  const args = ["--dangerously-skip-permissions"];
  if (passThrough?.length) args.push(...passThrough);
  return args;
}

export function launchClaude(config, passThrough) {
  const env = { ...process.env, ...buildLaunchEnv(config) };
  const args = buildLaunchArgs(config, passThrough);
  const command = ["claude", ...args].join(" ");

  execSync(command, {
    cwd: config.projectDir,
    env,
    stdio: "inherit",
    windowsHide: false,
  });
}
```

- [ ] **Step 4: Run tests — expect pass**
- [ ] **Step 5: Commit**

```bash
git add src/lib/exec.mjs tests/lib/exec.test.mjs
git commit -m "feat(exec): build launch env and args for claude"
```

---

### Task 1.4: Wire Orchestrator End-to-End

**Files:**
- Modify: `src/orchestrator.mjs`
- Test: `tests/orchestrator.test.mjs`

- [ ] **Step 1: Write orchestrator integration test**

```javascript
// tests/orchestrator.test.mjs
import { describe, it, expect, vi } from "vitest";
import { orchestrate } from "../src/orchestrator.mjs";

// Mock the launch to avoid actually spawning claude
vi.mock("../src/lib/exec.mjs", () => ({
  launchClaude: vi.fn(),
  buildLaunchEnv: vi.fn(() => ({})),
  buildLaunchArgs: vi.fn(() => []),
}));

describe("orchestrate", () => {
  it("runs fast mode tiers and returns success", async () => {
    const code = await orchestrate(["--mode=fast"]);
    expect(code).toBe(0);
  });
});
```

- [ ] **Step 2: Update orchestrator to wire exec**

Import `launchClaude` from `./lib/exec.mjs` in orchestrator. After tiers pass, call `launchClaude(config, config.args.passThrough)`. Remove the bare `process.argv` entry point — move it to a separate `src/cli.mjs` to keep orchestrator testable.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/orchestrator.mjs src/cli.mjs tests/orchestrator.test.mjs
git commit -m "feat(orchestrator): wire config→tiers→exec pipeline"
```

---

## Wave 2: Tiers T0-T3 (Parallel)

> **Parallel execution:** T0, T1, T2, T3 are independent modules. Execute with 4 parallel subagents using `isolation: worktree`.

### Task 2.1: T0 — RTK Check

**Files:**
- Modify: `src/tiers/t0-rtk.mjs`
- Test: `tests/tiers/t0-rtk.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/tiers/t0-rtk.test.mjs
import { describe, it, expect, vi } from "vitest";
import { check, repair, meta } from "../../src/tiers/t0-rtk.mjs";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

import { exec } from "../../src/lib/shell.mjs";

describe("t0-rtk check", () => {
  it("passes when rtk is on PATH with correct version", async () => {
    exec.mockResolvedValueOnce({ ok: true, stdout: "rtk 0.42.0" }); // which rtk + version
    exec.mockResolvedValueOnce({ ok: true, stdout: "true" }); // hook registered check
    const result = await check({}, {});
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns when rtk version is outdated", async () => {
    exec.mockResolvedValueOnce({ ok: true, stdout: "rtk 0.40.0" });
    exec.mockResolvedValueOnce({ ok: true, stdout: "true" });
    const result = await check({}, {});
    expect(result.severity).toBe(Severity.WARN);
  });

  it("blocks when rtk is not on PATH", async () => {
    exec.mockResolvedValueOnce({ ok: false, stdout: "" });
    const result = await check({}, {});
    expect(result.severity).toBe(Severity.BLOCK);
  });
});

describe("t0-rtk meta", () => {
  it("has correct id and modes", () => {
    expect(meta.id).toBe("t0-rtk");
    expect(meta.modes).toContain("fast");
  });
});
```

- [ ] **Step 2: Implement T0**

Replace stub in `src/tiers/t0-rtk.mjs`:

```javascript
import { createResult, Severity } from "../lib/result.mjs";
import { exec } from "../lib/shell.mjs";

export const meta = { id: "t0-rtk", name: "RTK", modes: ["fast", "deep", "repair"] };

const RTK_VERSION_PIN = "0.42";

export async function check(config, context) {
  const start = performance.now();
  const evidence = [];

  // Check rtk binary
  const version = await exec("rtk --version");
  if (!version.ok) {
    evidence.push({ check: "rtk-binary", actual: "rtk not found on PATH", remediation: "Install RTK: npm install -g @anthropic/rtk" });
    return createResult({ tierId: meta.id, tierName: meta.name, severity: Severity.BLOCK, evidence, durationMs: performance.now() - start });
  }

  // Check version
  const versionMatch = version.stdout.match(/(\d+\.\d+)/);
  const currentVersion = versionMatch?.[1] ?? "unknown";
  if (!currentVersion.startsWith(RTK_VERSION_PIN)) {
    evidence.push({ check: "rtk-version", actual: `v${currentVersion}`, expected: `v${RTK_VERSION_PIN}.x`, remediation: `npm install -g @anthropic/rtk@${RTK_VERSION_PIN}` });
    return createResult({ tierId: meta.id, tierName: meta.name, severity: Severity.WARN, evidence, durationMs: performance.now() - start });
  }

  // Check hook registration
  const hookCheck = await exec("rtk hook claude --check");
  if (!hookCheck.ok) {
    evidence.push({ check: "rtk-hook", actual: "PreToolUse hook not registered", remediation: "rtk hook claude" });
    return createResult({ tierId: meta.id, tierName: meta.name, severity: Severity.WARN, evidence, durationMs: performance.now() - start });
  }

  evidence.push({ check: "rtk", actual: `v${currentVersion}, hook registered` });
  return createResult({ tierId: meta.id, tierName: meta.name, severity: Severity.PASS, evidence, durationMs: performance.now() - start });
}

export async function repair(config, context) {
  const start = performance.now();
  const initResult = await exec("rtk init -g");
  const hookResult = await exec("rtk hook claude");
  const ok = initResult.ok && hookResult.ok;
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: ok ? Severity.PASS : Severity.BLOCK,
    evidence: [{ check: "rtk-repair", actual: ok ? "rtk init -g + hook claude succeeded" : "repair failed", ...(ok ? {} : { remediation: "Manual: rtk init -g && rtk hook claude" }) }],
    durationMs: performance.now() - start,
  });
}
```

- [ ] **Step 3: Run tests — expect pass**
- [ ] **Step 4: Commit**

```bash
git add src/tiers/t0-rtk.mjs tests/tiers/t0-rtk.test.mjs
git commit -m "feat(t0): implement RTK binary, version, and hook checks"
```

---

### Task 2.2: T1 — ENV Check

**Files:**
- Modify: `src/tiers/t1-env.mjs`
- Test: `tests/tiers/t1-env.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/tiers/t1-env.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";
import { check } from "../../src/tiers/t1-env.mjs";
import { Severity } from "../../src/lib/result.mjs";

describe("t1-env check", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes when required env vars are set", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://localhost:8317");
    const result = await check({ stateDir: "~/.vein" }, {});
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns when ANTHROPIC_BASE_URL is not set", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "");
    const result = await check({ stateDir: "~/.vein" }, {});
    expect([Severity.WARN, Severity.INFO]).toContain(result.severity);
  });
});
```

- [ ] **Step 2: Implement T1** — check env vars, state-dir existence, stale session cleanup
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(t1): implement ENV var and state-dir checks"
```

---

### Task 2.3: T2 — CLIProxy Check

**Files:**
- Modify: `src/tiers/t2-cliproxy.mjs`
- Test: `tests/tiers/t2-cliproxy.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/tiers/t2-cliproxy.test.mjs
import { describe, it, expect, vi } from "vitest";
import { check } from "../../src/tiers/t2-cliproxy.mjs";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs");
import { exec } from "../../src/lib/shell.mjs";

describe("t2-cliproxy check", () => {
  it("passes when process is running and health endpoint responds", async () => {
    exec.mockResolvedValueOnce({ ok: true, stdout: "online" }); // pm2 describe
    // Mock fetch for health check
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: () => ({ status: "ok" }) });
    const config = { cliproxy: { hosting: "pm2", port: 8317 } };
    const result = await check(config, {});
    expect(result.severity).toBe(Severity.PASS);
  });

  it("blocks when health endpoint is unreachable", async () => {
    exec.mockResolvedValueOnce({ ok: true, stdout: "online" });
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const config = { cliproxy: { hosting: "pm2", port: 8317 } };
    const result = await check(config, {});
    expect(result.severity).toBe(Severity.BLOCK);
  });
});
```

- [ ] **Step 2: Implement T2** — process check (PM2/Docker), HTTP health, account count, cache validation (deep mode)
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(t2): implement CLIProxy process, health, and cache checks"
```

---

### Task 2.4: T3 — CLI Tools Check

**Files:**
- Modify: `src/tiers/t3-cli.mjs`
- Test: `tests/tiers/t3-cli.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/tiers/t3-cli.test.mjs
import { describe, it, expect, vi } from "vitest";
import { check } from "../../src/tiers/t3-cli.mjs";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs");
import { exec } from "../../src/lib/shell.mjs";

const TOOLS = ["node", "python3", "gh", "claude", "rtk", "codex"];

describe("t3-cli check", () => {
  it("passes when all tools are present with correct versions", async () => {
    exec.mockResolvedValue({ ok: true, stdout: "v24.14.0" });
    const result = await check({}, {});
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns when a non-critical tool is missing", async () => {
    exec.mockImplementation(async (cmd) => {
      if (cmd.includes("codex")) return { ok: false, stdout: "" };
      return { ok: true, stdout: "v1.0.0" };
    });
    const result = await check({}, {});
    expect(result.severity).toBe(Severity.WARN);
  });
});
```

- [ ] **Step 2: Implement T3** — version probe for each mise-managed tool: node≥24, python≥3.13, gh (+ scopes), claude, rtk, codex
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(t3): implement CLI tool version checks"
```

---

## Wave 3: Tiers T4-T6 + Block Engine

### Task 3.1: Block Rule Engine

**Files:**
- Create: `src/lib/block-engine.mjs`
- Test: `tests/lib/block-engine.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/lib/block-engine.test.mjs
import { describe, it, expect } from "vitest";
import { evaluateBlockRules } from "../../src/lib/block-engine.mjs";
import { Severity } from "../../src/lib/result.mjs";

describe("block-engine", () => {
  it("returns empty array when no rules match", () => {
    const tierResults = [{ tierId: "t0-rtk", severity: Severity.PASS, evidence: [] }];
    const triggered = evaluateBlockRules(tierResults);
    expect(triggered).toHaveLength(0);
  });

  it("triggers B5 when CLIProxy is unhealthy", () => {
    const tierResults = [{
      tierId: "t2-cliproxy",
      severity: Severity.BLOCK,
      evidence: [{ check: "cliproxy-health", actual: "3 consecutive failures" }],
    }];
    const triggered = evaluateBlockRules(tierResults);
    expect(triggered.some((r) => r.id === "B5")).toBe(true);
  });

  it("identifies auto-repairable rules", () => {
    const tierResults = [{
      tierId: "t2-cliproxy",
      severity: Severity.BLOCK,
      evidence: [{ check: "cliproxy-health", actual: "unhealthy" }],
    }];
    const triggered = evaluateBlockRules(tierResults);
    const b5 = triggered.find((r) => r.id === "B5");
    expect(b5.autoRepair).toBe(true);
  });
});
```

- [ ] **Step 2: Implement block engine**

```javascript
// src/lib/block-engine.mjs
import { readFileSync } from "node:fs";
import { Severity } from "./result.mjs";

const RULES_PATH = new URL("../rules/block-rules.json", import.meta.url);
let _rules = null;

function loadRules() {
  if (!_rules) {
    const data = JSON.parse(readFileSync(RULES_PATH, "utf-8"));
    _rules = data.rules;
  }
  return _rules;
}

export function evaluateBlockRules(tierResults) {
  const rules = loadRules();
  const triggered = [];

  for (const rule of rules) {
    const matchingResults = tierResults.filter(
      (r) => rule.tiers.includes(r.tierId) && r.severity === Severity.BLOCK,
    );
    if (matchingResults.length > 0) {
      triggered.push({ ...rule, matchedTiers: matchingResults.map((r) => r.tierId) });
    }
  }

  return triggered;
}
```

- [ ] **Step 3: Run tests — expect pass**
- [ ] **Step 4: Commit**

```bash
git add src/lib/block-engine.mjs tests/lib/block-engine.test.mjs
git commit -m "feat(block-engine): declarative block rule evaluation"
```

---

### Task 3.2: T4 — GitHub Check

**Files:**
- Modify: `src/tiers/t4-github.mjs`
- Test: `tests/tiers/t4-github.test.mjs`

- [ ] **Step 1: Write tests** — mock `gh api` calls for rulesets, SSH signing, auth scopes
- [ ] **Step 2: Implement T4** — `gh api /repos/{owner}/{repo}/rulesets`, `git config gpg.format`, `gh auth status`
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(t4): implement GitHub rulesets, SSH signing, auth checks"
```

---

### Task 3.3: T5 — Drift Check

**Files:**
- Modify: `src/tiers/t5-drift.mjs`
- Test: `tests/tiers/t5-drift.test.mjs`

- [ ] **Step 1: Write tests** — mock MCP roster read from `.mcp.json`, version comparisons
- [ ] **Step 2: Implement T5** — read `.mcp.json` + `~/.claude/.mcp.json`, compare versions against pins in `config/default.json`, 24h cache for smoke tests
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(t5): implement MCP roster drift detection"
```

---

### Task 3.4: T6 — CodeGraph Check

**Files:**
- Modify: `src/tiers/t6-codegraph.mjs`
- Test: `tests/tiers/t6-codegraph.test.mjs`

- [ ] **Step 1: Write tests** — mock GitNexus CLI presence and index freshness
- [ ] **Step 2: Implement T6** — check if repo is indexed, trigger background reindex post-launch if stale
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(t6): implement GitNexus codegraph freshness check"
```

---

## Wave 4: CLIProxy Manager

### Task 4.1: PM2 Provider

**Files:**
- Create: `src/cliproxy/pm2.mjs`
- Test: `tests/cliproxy/pm2.test.mjs`

- [ ] **Step 1: Write tests** — mock `pm2 describe`, `pm2 start`, `pm2 restart`, `pm2 delete`
- [ ] **Step 2: Implement** — PM2 lifecycle: start (with cli-proxy-api.exe path), stop, restart, status
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 4.2: Docker Provider

**Files:**
- Create: `src/cliproxy/docker.mjs`
- Test: `tests/cliproxy/docker.test.mjs`

- [ ] **Step 1: Write tests** — mock `wsl docker compose` commands
- [ ] **Step 2: Implement** — Docker lifecycle via WSL2: `docker compose -f ~/docker/cliproxy/compose.yml up -d`, health check, logs
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 4.3: Manager Orchestrator

**Files:**
- Create: `src/cliproxy/manager.mjs`
- Test: `tests/cliproxy/manager.test.mjs`

- [ ] **Step 1: Write tests** — manager delegates to PM2 or Docker based on config
- [ ] **Step 2: Implement** — read `cliproxy.hosting` from config, delegate to provider
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 4.4: Account Management

**Files:**
- Create: `src/cliproxy/accounts.mjs`

- [ ] **Step 1: Write tests** — account add (interactive), remove, list, health check
- [ ] **Step 2: Implement** — read accounts from `~/.cli-proxy-api/`, validate auth tokens
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 4.5: Config Generation

**Files:**
- Create: `src/cliproxy/config-gen.mjs`

- [ ] **Step 1: Write tests** — template rendering, sentinel preservation, merge with manual edits
- [ ] **Step 2: Implement** — read `config/cliproxy/config.template.yaml`, inject account blocks, write to `~/.vein/cliproxy/config.yaml`
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 4.6: Cache Validation

**Files:**
- Create: `src/cliproxy/cache-check.mjs`
- Test: `tests/cliproxy/cache-check.test.mjs`

- [ ] **Step 1: Write tests**

```javascript
// tests/cliproxy/cache-check.test.mjs
import { describe, it, expect, vi } from "vitest";
import { validateCache } from "../../src/cliproxy/cache-check.mjs";

describe("cache validation", () => {
  it("passes when second request has cache_read_input_tokens > 0", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => ({ usage: { cache_read_input_tokens: 0 } }) })
      .mockResolvedValueOnce({ ok: true, json: () => ({ usage: { cache_read_input_tokens: 1423 } }) });

    const result = await validateCache("http://localhost:8317");
    expect(result.cacheWorking).toBe(true);
  });

  it("fails when second request has zero cache tokens", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => ({ usage: { cache_read_input_tokens: 0 } }) })
      .mockResolvedValueOnce({ ok: true, json: () => ({ usage: { cache_read_input_tokens: 0 } }) });

    const result = await validateCache("http://localhost:8317");
    expect(result.cacheWorking).toBe(false);
  });
});
```

- [ ] **Step 2: Implement** — send two identical API requests through proxy, check cache_read_input_tokens
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(cliproxy): implement cache validation protocol"
```

---

## Wave 5: Parallel Sessions + Agent Teams

### Task 5.1: Parallel Session Spawner

**Files:**
- Create: `src/parallel.mjs`
- Test: `tests/parallel.test.mjs`

- [ ] **Step 1: Write tests** — mock Windows Terminal `wt` command
- [ ] **Step 2: Implement** — spawn multiple Claude sessions in WT tabs, each with its own CWD and worktree. Use `wt -w 0 new-tab -d <path> claude --dangerously-skip-permissions`
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 5.2: Agent Team Config

**Files:**
- Create: `src/team.mjs`

- [ ] **Step 1: Write tests** — team config generation from .vein.json `agents` section
- [ ] **Step 2: Implement** — write team config to `~/.claude/teams/{name}/config.json`, create task directory
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

---

## Wave 6: Quality Gates

### Task 6.1: Codex Review Hook

**Files:**
- Create: `src/quality/codex-review.mjs`
- Create: `src/hooks/stop-handler.mjs`

- [ ] **Step 1: Write tests** — mock codex CLI invocation
- [ ] **Step 2: Implement stop hook** — on Stop event, invoke `codex --review --model gpt-5.5 --effort xhigh`. Parse output for BLOCKers. Return exit code 0 (async, non-blocking).
- [ ] **Step 3: Implement hook registration** — write to `.claude/settings.json` hooks.Stop section
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

### Task 6.2: Ship Gate

**Files:**
- Create: `src/quality/ship-gate.mjs`

- [ ] **Step 1: Write tests** — mock dual-model review (Claude + GPT-5.5)
- [ ] **Step 2: Implement** — orchestrate: run Codex review, run Claude self-review, compare findings, output consensus
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 6.3: TeammateIdle Test Gate

**Files:**
- Create: `src/hooks/teammate-idle.mjs`

- [ ] **Step 1: Write tests** — mock vitest/biome invocation
- [ ] **Step 2: Implement** — on TeammateIdle, run `npx vitest run && npx biome check .`. Exit 2 on failure (forces teammate to fix). Exit 0 on success.
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 6.4: SessionStart Hook

**Files:**
- Create: `src/hooks/session-start.mjs`

- [ ] **Step 1: Implement** — on SessionStart, log session start, optionally trigger ruflo session-start for cross-session context
- [ ] **Step 2: Commit**

---

## Wave 7: Setup Automation

### Task 7.1: Setup Wizard Orchestrator

**Files:**
- Create: `src/setup/index.mjs`
- Test: `tests/setup/index.test.mjs`

- [ ] **Step 1: Write tests** — mock each setup step, verify ordering
- [ ] **Step 2: Implement** — sequential wizard: detect OS → check WSL2 → check Docker Desktop → install RTK → setup CLIProxy → install tools via mise → configure git → create GitHub rulesets
- [ ] **Step 3: Each sub-step is a separate module** (already in file map)
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

### Tasks 7.2-7.7: Individual Setup Steps

Each of `src/setup/{rtk,cliproxy,tools,git-config,mise-init,github-rulesets}.mjs`:
- [ ] Write tests for each step
- [ ] Implement: run the appropriate shell commands with error handling
- [ ] Ensure idempotency (safe to run multiple times)
- [ ] Commit each step separately

---

## Wave 8: Project Management

### Task 8.1: Project Registry

**Files:**
- Create: `src/project-config.mjs`
- Modify: `src/lib/config.mjs`
- Test: `tests/project-config.test.mjs`

- [ ] **Step 1: Write tests** — add project, remove project, list projects, resolve alias
- [ ] **Step 2: Implement** — `~/.vein/projects.json` CRUD: `{ "trading": "C:\\SEA\\src\\trading", "evolve": "C:\\SEA\\src\\evolve" }`
- [ ] **Step 3: Wire into config.mjs** `resolveProject()` — check registry before path convention
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

---

## Wave 9: Packaging + CI

### Task 9.1: npm Package Config

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add bin, files, publishConfig**

```json
{
  "bin": {
    "vein": "./bin/vein.cmd"
  },
  "files": [
    "bin/",
    "src/",
    "config/",
    "agent_docs/"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **Step 2: Commit**

### Task 9.2: Promptfoo Eval CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `evals/datasets/fast-mode.yaml`

- [ ] **Step 1: Add promptfoo step to CI** — after tests pass, run `npx promptfoo eval -c evals/promptfooconfig.yaml`
- [ ] **Step 2: Create eval dataset** — test vectors for fast/deep/repair modes
- [ ] **Step 3: Commit**

### Task 9.3: Full README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write comprehensive README** — installation, quick start, configuration (.vein.json), modes, tiers, CLIProxy, quality gates, contributing
- [ ] **Step 2: Commit**

### Task 9.4: Initial Commit + Tag

- [ ] **Step 1: Run full test suite** — `npx vitest run --coverage`
- [ ] **Step 2: Run biome** — `npx biome check .`
- [ ] **Step 3: Run gitleaks** — `gitleaks detect --source . --redact`
- [ ] **Step 4: Final commit** — `git add -A && git commit -m "feat: vein-launch v1.0.0"`
- [ ] **Step 5: Create GitHub repo** — `gh repo create seath/vein-launch --public --source=.`
- [ ] **Step 6: Push and tag** — `git push -u origin main && git tag v1.0.0 && git push --tags`
- [ ] **Step 7: Verify release-please** — check GitHub for auto-generated release

---

## Dependency Graph

```
Wave 1 (Core) ─────────────┐
                            ├─→ Wave 2 (T0-T3, parallel) ─→ Wave 3 (T4-T6, parallel)
                            │                                        │
                            ├─→ Wave 4 (CLIProxy, depends on T2) ←──┘
                            │
                            ├─→ Wave 5 (Parallel Sessions)
                            │
                            ├─→ Wave 6 (Quality Gates)
                            │
                            ├─→ Wave 7 (Setup, depends on W2+W4)
                            │
                            ├─→ Wave 8 (Projects, depends on W1)
                            │
                            └─→ Wave 9 (Packaging, depends on all)
```

Waves 2, 5, 6, 8 can run in parallel after Wave 1.
Wave 3 depends on Wave 2 (block engine needs real tier results to test against).
Wave 4 depends on Wave 2 (T2 CLIProxy check uses manager).
Wave 7 depends on Waves 2+4 (setup installs what tiers check).
Wave 9 depends on all others.
