# SOTA Convergence Umbrella Design — vein-launch v1.3.0+

> Authored: 2026-05-27. Brainstorming skill → superpowers:brainstorming.
> Status: SPEC COMPLETE — convergence verdicts integrated. Awaiting user review.
> Convergence Cycle 1: 2 researchers + GPT-5.5 codex consensus. 20 items judged.

## Overview

Six sub-projects that finalize vein-launch as a production-ready launcher
before the trading-system pivot. Each gets its own implementation plan
after this umbrella spec is approved.

Build order: SP1 → SP3 → SP2 → SP4 → SP5 → SP6.

---

## SP1: Folder & State Organization

**Problem:** vein-launch artifacts are scattered across 8+ directories
with no auto-sync, no discoverability check, and three known first-run
deliverability gaps (PATH, VEIN_LAUNCH_ROOT, CLIProxy api-keys).

**Design:**

### `vein --setup --first-time`
Runs automatically on first invocation (detects `~/.vein/` absence) or
explicitly via flag. Steps:

1. **Create state dirs**: `~/.vein/runs/`, `~/.vein/eval-history/`,
   `~/.vein/sessions/`, `~/.vein/hud/`
2. **Symlink launcher scripts**: `~/bin/vein.ps1` → `<repo>/bin/vein.ps1`,
   `~/bin/vein.cmd` → `<repo>/bin/vein.cmd` (mklink on Windows, ln -s on POSIX)
3. **Add `~/bin` to User PATH** if not present
4. **Set `VEIN_LAUNCH_ROOT`** in User env
5. **Generate CLIProxy client-auth key**: random `sk-ant-vein-<48hex>`,
   write to `~/cliproxy/config.yaml` api-keys + set `ANTHROPIC_API_KEY` in User env
6. **Write `~/.vein/install.json`**: `{ version, repoRoot, installedAt, setupSteps: [...] }`
7. **Prompt to `/logout`** from claude.ai if both token + API key exist

### `vein --doctor`
Audits all 8+ locations. Reports per-location: EXISTS / MISSING / STALE / DRIFT.
Checks:
- `~/bin/vein.ps1` is a symlink pointing to `<repo>/bin/vein.ps1` (not a stale copy)
- `VEIN_LAUNCH_ROOT` matches `~/.vein/install.json`.repoRoot
- `ANTHROPIC_API_KEY` is set AND matches an entry in `~/cliproxy/config.yaml` api-keys
- `~/.vein/runs/` has at least one qualifying deep-mode run
- CLIProxy daemon is online (PM2 status + /healthz)
- All 6 CLI tools from T3 are on PATH with expected versions
- package.json version matches latest git tag

### No reorganization of existing paths
The current locations are correct:
- `~/cliproxy/` = CLIProxy config (daemon reads it)
- `~/.cli-proxy-api/` = OAuth auth files (CLIProxy reads them)
- `~/.claude/` = Claude Code's own config (settings, hooks, plugins, memory)
- `~/.codex/` = Codex CLI config
- `C:\SEA\ref\` = reference repos (read-only)
- `C:\SEA\src\` = source repos

---

## SP2: Claude-HUD Real-Time Dashboard

**Problem:** claude-hud statusline shows hallucinated API cost ($X based
on standard rates) when CLIProxy routes to Max subscription (actual cost
$0). No visibility into which OAuth account is active, cache hit rate, or
account rate-limit status.

**Design:**

### HUD Bridge (new: `tools/hud-bridge.mjs`)
A lightweight PM2 sidecar that polls CLIProxy management API and writes
`~/.vein/hud/external-usage.json` in claude-hud's expected format.

**Data sources** (from CLIProxy management API research):
- `GET /v0/management/api-key-usage` — per-provider success/failed counts
- `GET /v0/management/auth-files` — list of OAuth accounts + enabled status
- `GET /v0/management/logs?limit=5` — recent log lines for active-account detection

**Auth**: Bearer token using the management secret-key (bcrypt'd in config).
Need to store a plaintext management key in `~/.vein/hud-bridge-config.json`
separate from the bcrypt'd version in cliproxy config.

**Output file** (`~/.vein/hud/external-usage.json`):
```json
{
  "five_hour": { "used_percentage": 42, "resets_at": "..." },
  "seven_day": { "used_percentage": 15, "resets_at": "..." },
  "balance_label": "Max ∞",
  "active_account": "claude-pro-1",
  "accounts_online": 4,
  "accounts_total": 5,
  "sessions_active": 2,
  "updated_at": "..."
}
```

**claude-hud config changes** (`~/.claude/plugins/claude-hud/config.json`):
- `display.externalUsagePath`: `"~/.vein/hud/external-usage.json"`
- `--extra-cmd`: script that reads `balance_label` + `active_account` for
  inline status badge

**Poll interval**: 30 seconds (matches claude-hud's freshness window).

### Limitations
- No prompt-cache hit rate from CLIProxy API (not exposed). Would need
  CLIProxy feature request or log parsing.
- No per-account rate-limit status (not exposed). CPA-Manager project
  builds this from usage-queue; we could adopt the same pattern.
- No push/WebSocket from CLIProxy management API — polling is the only option.

---

## SP3: Eval Framework Verdict (Convergence Cycle)

**Problem:** Is promptfoo (OpenAI-acquired) still the right eval
framework? Should we add langfuse LLM-as-judge? What about inspect-ai,
braintrust, or newer frameworks?

**Design:** Run the full convergence cycle per `convergence-cycle-protocol.md`.

### Convergence items to audit
1. promptfoo → KEEP / REPLACE / EXPERIMENT
2. langfuse → ADOPT / DEFER / SKIP
3. inspect-ai → ADOPT / SKIP
4. wshobson plugin-eval pattern → PORT-TO-JS / KEEP-AS-REF / SKIP
5. ruflo trading stack (neural-trader, market-data, ruvector, agentdb) → KEEP / TRIM
6. ECC vs ruflo plugin overlap → per-pair WINNER selection
7. Agent orchestration pattern (worktree + teams) → KEEP / AUGMENT

### Process
- Phase 1: Two independent researchers (already dispatched)
- Phase 2: codex:codex-rescue GPT-5.5 xhigh reads both reports +
  SOTA-HANDOFF.md → verdict matrix
- Phase 3: User reviews verdicts → schedule implementation
- Phase 4: Update deep-audit-backlog with resolutions

### Output
Verdict matrix integrated into this spec doc (Section SP3 Results) after
the cycle completes.

---

## SP4: SOTA GitHub Actions Workflow

**Problem:** Minimal ci.yml. No CodeQL, no release automation, no
fresh-shell integration test, no dependency review.

**Design:**

### `.github/workflows/ci.yml` (enhanced)
```yaml
jobs:
  lint-test:
    runs-on: windows-latest
    strategy:
      matrix:
        node-version: ["24"]
    steps:
      - checkout
      - mise-action (tool versions)
      - npm ci
      - npx biome check . (lint)
      - npx vitest run --coverage (test + coverage from vitest.config.mjs)
      - npx promptfoo eval -c evals/promptfooconfig.yaml (eval gate, blocking)
      - vein --version (fresh-shell smoke test)
      - vein vein-launch --ci (integration test against real tier runner)
```

### `.github/workflows/codeql.yml` (new or enhanced)
- JavaScript CodeQL on push to main + PR
- Security scanning for the shell.mjs injection surface

### `.github/workflows/release.yml` (new)
- Triggered on tag push (`v*.*.*`)
- `npm version` sync (reads tag, writes package.json)
- `gh release create --notes-from-tag`
- `npm publish --dry-run` (or real publish if public)

### `.github/workflows/dependency-review.yml` (new)
- GitHub's dependency review action on PRs
- Blocks on known-vulnerable transitive deps

---

## SP5: Parallel Sessions + Multi-Project

**Problem:** `src/parallel.mjs` spawns tabs but no session tracking.
CLIProxy account distribution across sessions is implicit (round-robin +
session-affinity). No observability into how many sessions are active.

**Design:**

### Session registry (`~/.vein/sessions/`)
Each `vein <project>` launch writes `~/.vein/sessions/<uuid>.json`:
```json
{
  "id": "<uuid>",
  "project": "vein-launch",
  "pid": 12345,
  "startedAt": "...",
  "mode": "fast",
  "cliproxyAccount": null,
  "status": "active"
}
```

### `vein --status` (enhanced)
Reads `~/.vein/sessions/`, checks each pid is still alive, reports:
```
Active sessions:
  #1  vein-launch     pid:12345  fast  2m ago
  #2  trading-system  pid:67890  deep  5m ago
Accounts: 3/5 in use (session-affinity)
```

### Session cleanup
- On launch: sweep `~/.vein/sessions/` for dead pids (process not running)
- `vein --gc`: explicit cleanup

### CLIProxy account distribution
- vein sets `metadata.user_id` = session UUID in the env block
- CLIProxy's session-affinity binds that UUID to a specific OAuth account
- Multiple sessions get different accounts automatically (round-robin first assignment)

---

## SP6: Self-Correcting Worktree Loops

**Problem:** Worktree workers occasionally report "commit successful" but
didn't actually commit. TeammateIdle hook runs test-gate but doesn't
self-correct. No GPT-5.5 review loop until pass.

**Design:**

### `.claude/agents/self-correcting-worker.md`
Agent definition file with frontmatter:
```yaml
---
name: self-correcting-worker
model: sonnet
isolation: worktree
mode: auto
memory: project
---
```

Body includes the loop pattern:
1. Write tests (TDD)
2. Implement
3. `npx vitest run` + `npx biome check --fix`
4. If fail → fix + retry (max 3 iterations)
5. `git add -A && git commit` with conventional message
6. **Commit verification**: `git rev-parse HEAD` before/after — if same, report
   the actual hook error instead of silent success
7. codex:codex-rescue review (GPT-5.5 xhigh)
8. If BLOCKs found → fix + re-test + re-review (max 2 review rounds)
9. Report final status to orchestrator

### TeammateIdle hook enhancement
```js
// Current: runs test-gate, reports pass/fail
// Enhanced: if fail, write failure details to task description
//           so the teammate sees them and self-corrects
const failures = parseTestOutput(stderr);
if (failures.length > 0) {
  // Write failures as structured feedback
  await updateTask(currentTaskId, {
    description: `FIX THESE:\n${failures.join('\n')}`,
  });
  process.exit(2); // teammate retries with the failure context
}
```

### Max-iteration guards
- 3 test-fix iterations per worker
- 2 codex review rounds per worker
- Total wall-clock budget: 10 minutes per worker (timeout kills)
- On exhaustion: report partial results + log to deep-audit-backlog

---

## Shared interfaces

| Interface | Producer | Consumer | Format |
|---|---|---|---|
| `~/.vein/hud/external-usage.json` | SP2 hud-bridge | claude-hud | JSON (claude-hud schema) |
| `~/.vein/sessions/*.json` | SP5 launcher | SP2 hud-bridge, SP1 --status | JSON per-session |
| `~/.vein/install.json` | SP1 --setup | SP1 --doctor | JSON install state |
| `evals/rubric.json` | SP3 verdict | SP4 CI, SP6 loop | JSON rubric |
| `.claude/agents/self-correcting-worker.md` | SP6 | Any wave dispatch | Agent definition |

---

## Build order + effort estimate

| Sub-project | Depends on | Effort | Wave |
|---|---|---|---|
| SP1: Folder org | — | 2-3 hours | v1.3.0 |
| SP3: Eval verdict | — (research) | 1 hour | v1.3.0 (Lane B) |
| SP2: HUD dashboard | SP1 | 3-4 hours | v1.3.0 |
| SP4: GitHub CI | SP3 | 2-3 hours | v1.3.0 |
| SP5: Parallel sessions | SP1 + SP2 | 2-3 hours | v1.4.0 |
| SP6: Self-correcting loops | SP4 | 3-4 hours | v1.4.0 |

---

## Convergence Cycle Results

> **STATUS: COMPLETE** — Cycle ran 2026-05-27. Researcher A (ruflo-core:researcher,
> internal stack, 71K tokens), Researcher B (general-purpose + WebSearch,
> external SOTA, 79K tokens), Codex GPT-5.5 xhigh consensus (20K tokens).
> 20 items judged. Total cycle cost: ~$4.

### KEEP (no action)
- CLIProxyAPI v7.1.24 — dominant, healthy ecosystem
- RTK v0.42.0 — no superior replacement
- context-mode v1.0.151 — no competitors
- Agent orchestration (worktree + teams) — confirmed SOTA, production-proven
- Ship-gate dual-model pattern — SOTA pattern, but fix false implementation (1h)

### REPLACE (concrete migrations)
- **promptfoo → DeepEval v4.0.3** — Apache 2.0, pytest-native, 50+ metrics, no acquisition risk. Keep promptfoo during transition. (8h)
- **Quality gates: user-scoped → project dev-deps** — audit-harness pattern: gates ship as versioned dev-dependencies, not ~/.claude/ config. (6h)
- **GitNexus hook: blanket PreToolUse → selective async** — serial 10s timeout per Grep/Glob/Bash call serializes parallel agent-teams. Replace with debounced async indexing. (8h)

### EXPERIMENT (PoC before committing)
- langfuse — sidecar PoC for trace capture (6h)
- inspect-ai — one non-blocking benchmark job (4h)
- CliRelay — test as optional telemetry fork (5h)
- oh-my-claudecode — port team templates (5h)
- wshobson plugin-eval — scoring rubric for plugins (4h)
- wshobson preset teams — 2-3 presets after worktree wired (4h)
- wshobson 3-tier model routing — behind config flag (5h)
- ruflo-intelligence training hook — opt-in with audit logging (6h)
- CodeRabbit — non-blocking PR comments 2-week trial (3h)
- Laminar — compare vs Langfuse on one workflow (5h)

### RETIRE
- 9 dormant ruflo plugins: autopilot, cost-tracker, daa, graph-intelligence, iot-cognitum, knowledge-graph, rag-memory. DEFER: federation, ruvllm. (3h)

### ECC vs Ruflo overlap (from Researcher A, consensus-confirmed)
| Overlap | Winner |
|---------|--------|
| security-scan | ECC |
| tdd-workflow + testgen | KEEP BOTH (complementary) |
| deep-research | ruflo-goals |
| api-docs + docs | KEEP BOTH (different scope) |
| code-review | codex (independent model) |
| observe | ruflo-observability |
| workflow | ruflo-workflows |

---

## Open questions for user

1. **SP2 management-key**: CLIProxy management API needs a plaintext Bearer key
   for the hud-bridge. Options: (a) set a new plaintext key in config
   (CLIProxy auto-hashes on boot), (b) use `MANAGEMENT_PASSWORD` env var.
   Recommendation: (b) — env var doesn't require modifying the config file.
2. **SP5 parallel**: should `vein trading-system` auto-open a new Windows
   Terminal tab, or require explicit `vein --parallel trading-system`?
   Recommendation: explicit `--parallel` — avoid surprising tab spawns.
3. **SP6 budget**: 10-minute wall-clock per self-correcting worker — enough
   for TDD + implementation + review, or should it be 15-20 min?
   Recommendation: 15 min default, configurable via `.vein.json`.
4. **DeepEval migration timing**: replace promptfoo in SP4 (this wave) or
   defer to a dedicated migration wave? Recommendation: SP4 this wave —
   the CI workflow rewrite is the natural integration point.

## Convergence cycle impact on build order

Updated build order incorporating REPLACE verdicts:
- SP1 (folder org) + SP3 (verdicts done — DeepEval REPLACE, retire 9 plugins)
- SP2 (HUD dashboard)
- SP4 (CI workflow — now includes DeepEval migration + quality-gates-as-dev-deps)
- SP5 (parallel sessions)
- SP6 (self-correcting loops — GitNexus hook async replacement lands here)
