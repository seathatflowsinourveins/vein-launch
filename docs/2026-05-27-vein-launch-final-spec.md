# vein-launch — SOTA Claude Code Launcher & Project Foundation

> **Status**: Final spec (research-grounded, 10 parallel agents, May 2026)
> **Author**: seathatflowsinourveins + Claude Opus 4.7 (1M context)
> **Repo**: New standalone — `seathatflowsinourveins/vein-launch`
> **Predecessors**: eee.ps1 (ourveins), CLIProxyAPI (myvein), RTK (rtk-ai)
> **Research**: `docs/superpowers/specs/2026-05-27-vein-launch-sota-research.md`

---

## 1. Problem Statement

Launching Claude Code into a production-grade session requires: env vars set, CLI tools pinned, GitHub auth valid, CLIProxy running with healthy multi-account rotation, RTK token compression active, prompt cache verified through proxy, code-graph indexed, and quality gates armed (GPT-5.5 Codex review + test gates). Today these preconditions are manual or scattered. Different projects (trading system, research/evolution) need different configurations. There is no single command that validates everything, routes through the right proxy accounts, enforces quality gates, and adapts per-project.

## 2. Architecture

**One global launcher, per-project `.vein.json` configuration.** Same pattern as mise (.mise.toml), Docker (docker-compose.yml), Claude Code (.claude/settings.json).

```
vein-launch (global CLI)
  │
  ├─ Reads .vein.json from CWD
  ├─ Runs precheck tiers (T0-T6)
  ├─ Manages CLIProxy (PM2 or Docker per project)
  ├─ Arms quality gates (GPT-5.5 Codex + tests + ship-gate)
  ├─ Sets ANTHROPIC_BASE_URL → CLIProxy :8317
  ├─ Launches Claude Code (single / parallel / agent team)
  └─ Post-launch: GitNexus background index
```

```
                    ┌─────────────────────┐
                    │    vein launcher     │
                    │  PS1 → Node.js ESM  │
                    │  reads .vein.json   │
                    └──────────┬──────────┘
                               │
        ┌──────────┬───────────┼───────────┬────────────┐
        ▼          ▼           ▼           ▼            ▼
  ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐
  │ Prechecks│ │CLIProxy│ │  RTK   │ │ Sessions │ │ Quality │
  │  T0-T6   │ │PM2/Dock│ │v0.42.0 │ │Parallel/ │ │  Gates  │
  │  7 tiers │ │ er     │ │native  │ │  Team    │ │GPT-5.5  │
  └──────────┘ └───┬────┘ └────────┘ └──────────┘ └─────────┘
                   │
            ┌──────▼─────────────────────────────┐
            │   CLIProxyAPI v7.1.23              │
            │   Native .exe (PM2) or Docker      │
            │   Round-robin + session affinity    │
            │   ┌─────┐ ┌─────┐ ┌─────┐         │
            │   │Acct1│ │Acct2│ │AcctN│         │
            │   └──┬──┘ └──┬──┘ └──┬──┘         │
            │      └──round-robin──┘             │
            └──────┬─────────────────────────────┘
                   │ ANTHROPIC_BASE_URL=:8317
                   ▼
            Claude Code (Opus 4.7, 1M context)
```

### Design Principles

1. **Thin shell, smart Node.js** — PS1 parses args, Node does everything else
2. **`$PSScriptRoot`-relative** — zero hardcoded paths
3. **Per-project `.vein.json`** — project configures the launcher, not vice versa
4. **Budget-enforced modes** — tiers that exceed budget are skipped with warning
5. **Secrets never in repo** — runtime state in `~/.vein/`, OAuth in `~/.cli-proxy-api/`
6. **Hooks beat instructions** — deterministic enforcement (100%) over CLAUDE.md compliance (~80%)
7. **Max quality by default** — GPT-5.5 review on every stop, tests required, ship-gate before merge
8. **Cache-safe proxy** — validated prompt caching through CLIProxy

## 3. Per-Project Configuration (`.vein.json`)

Each project repo contains a `.vein.json` at root:

```jsonc
// ~/trading/.vein.json — autonomous trading system
{
  "$schema": "https://raw.githubusercontent.com/.../config/schema.json",
  "project": "trading",
  "mode": { "default": "deep" },
  "cliproxy": {
    "hosting": "docker",
    "accounts": ["claude-1", "claude-2", "claude-3"],
    "sessionAffinity": true
  },
  "quality": {
    "codexReview": "every-stop",
    "codexModel": "gpt-5.5",
    "codexEffort": "xhigh",
    "shipGate": true,
    "testsRequired": true,
    "promptfooGate": true
  },
  "modelRouting": {
    "default": "opus",
    "subagents": "haiku",
    "planning": "opusplan"
  },
  "docker": {
    "composeFile": "docker-compose.yml",
    "requiredServices": ["timescaledb", "redis", "cliproxy"]
  },
  "agents": {
    "team": "trading",
    "members": ["strategist", "risk-analyst", "backtester"]
  }
}
```

```jsonc
// ~/evolve/.vein.json — research + self-evolving architecture (merged)
{
  "project": "evolve",
  "mode": { "default": "deep" },
  "cliproxy": {
    "hosting": "pm2",
    "accounts": ["claude-1", "claude-2"]
  },
  "quality": {
    "codexReview": "every-stop",
    "codexModel": "gpt-5.5",
    "codexEffort": "xhigh",
    "shipGate": true,
    "autonomousLoops": true,
    "maxIterations": 50,
    "convergenceThreshold": 0.95
  },
  "agents": {
    "team": "evolve",
    "members": ["architect", "implementer", "evaluator", "adversary"]
  }
}
```

No `.vein.json` → default config (fast mode, PM2, Opus, GPT-5.5 on PR only).

## 4. CLI Surface

```bash
# ─── Launch (reads .vein.json from CWD) ───
vein                                   # Fast mode (≤5s) or .vein.json default
vein --deep                            # All tiers (≤30s)
vein --repair                          # All tiers + auto-heal (≤60s)
vein --setup                           # First-time: all tools installed

# ─── Parallel Sessions ───
vein --parallel [N]                    # N worktree-isolated sessions
vein --parallel 3                      # 3 independent Windows Terminal tabs

# ─── Agent Teams ───
vein --team                            # Launch team from .vein.json agents config
vein --team --agents coder,reviewer    # Ad-hoc team

# ─── Accounts ───
vein --accounts                        # Inventory + health + cache rates
vein --accounts add                    # OAuth login
vein --accounts rotate                 # Force rotation

# ─── Diagnostics ───
vein --status                          # Precheck results
vein --status cliproxy                 # Process + accounts + cache health
vein --status rtk                      # Token savings (rtk gain)
```

## 5. Three-Mode System

| Mode | Budget | Network | Tiers | Quality Gate |
|------|--------|---------|-------|-------------|
| **Fast** | ≤5s | NO | T0+T1+T2(process)+T3 | — |
| **Deep** | ≤30s | YES (24h cache) | T0-T6 | Cache health validated |
| **Repair** | ≤60s | YES | T0-T6 + repair | PM2/Docker restart, account refresh |

## 6. Seven-Tier Precheck System

### Module Contract

```javascript
export const meta = {
  id: 't0-rtk', name: 'RTK Token Compression',
  modes: ['fast', 'deep', 'repair'],
  budgetMs: 3000, blocking: 'required'
};
export async function check(mode, config) { /* → { status, message, remediation? } */ }
export async function repair(config) { /* → { status, message } */ }
```

### Tier Matrix

| Tier | Checks | Fast | Deep | Repair |
|------|--------|------|------|--------|
| **T0 RTK** | Binary on PATH, version pin, `rtk hook claude` in settings.json | ✓ | ✓ | + `rtk init -g` |
| **T1 ENV** | ANTHROPIC_BASE_URL, ENABLE_TOOL_SEARCH, env vars, state-dir | ✓ | ✓ | + prune stale |
| **T2 CLIProxy** | PM2 or Docker process, :8317 health, account count | process check | + account audit + **cache health validation** | + pm2/docker restart |
| **T3 CLI** | mise-managed: node≥24, python≥3.13, gh scopes, claude, rtk, codex | ✓ | ✓ | + mise install |
| **T4 GitHub** | Rulesets v2 active, SSH signing, no stale rebase | skip | ✓ | ✓ |
| **T5 Drift** | MCP roster, version pins, stale refs | roster only | + smoke (24h) | same |
| **T6 CodeGraph** | GitNexus: indexed? stale? | skip | skip | bg post-launch |

### Block Rules (B1, B4-B7, B9-B10)

| Id | Trigger | Remediation |
|----|---------|-------------|
| B1 | Leaked credential in tracked/staged file | `gitleaks protect --staged --redact` |
| B4 | Docker daemon down (when .vein.json requires docker) | Start Docker Desktop |
| B5 | CLIProxy process unhealthy (3 consecutive failures) | `vein --repair` |
| B6 | Zero active CLIProxy accounts | `vein --accounts add` |
| B7 | GitHub auth expired or scopes insufficient | `gh auth login --scopes repo,workflow,security_events` |
| B9 | Critical MCP version drift (major mismatch) | `npm install -g <pkg>@<pin>` |
| B10 | GitHub Action SHA-pin floating | `pinact run` |

## 7. CLIProxyAPI Integration

### Dual Hosting (per-project via `.vein.json`)

**PM2 mode** (default, no Docker needed):
```
~/.vein/cliproxy/cli-proxy-api.exe → PM2 manages process
pm2 start cli-proxy-api.exe --name cliproxy
pm2 startup → auto-start on boot
```

**Docker mode** (when project uses Docker for other services):
```yaml
# Project's docker-compose.yml includes CLIProxy alongside services
services:
  cliproxy:
    image: eceasy/cli-proxy-api:latest
    ports: ["8317:8317"]
    volumes: [./config.yaml:/CLIProxyAPI/config.yaml, ...]
  timescaledb: ...
  redis: ...
```

### Config Generation

Template at `config/cliproxy/config.template.yaml` → generated to `~/.vein/cliproxy/config.yaml`:
- `routing.strategy: "round-robin"` + `session-affinity: true`
- `claude-header-defaults.stabilize-device-profile: true`
- `request-retry: 3`, `max-retry-credentials: 2`
- Account blocks from auth-dir

### Account Rotation (Subscription-Based)

CLIProxy manages OAuth sessions for multiple Claude/Codex/Gemini subscriptions. Cost is subscription-based (not per-token), so budget tracking focuses on:
- **Cache hit rates** per account (most important metric)
- **Account health** (active/quota-exceeded/expiring/cooling)
- **Rotation fairness** (round-robin balance)

### Cache-Safe Proxy Validation (CRITICAL)

T2 deep-mode validates prompt caching works through the proxy:
1. Two identical requests through CLIProxy
2. Second request MUST have `cache_read_input_tokens > 0`
3. Zero = proxy breaking cache keys = **warn loudly**

Cache killers to document: timestamps in system prompt, model switching mid-session, adding MCP tools mid-session, proxy JSON re-serialization.

### ENABLE_TOOL_SEARCH Warning

When `ANTHROPIC_BASE_URL` points to CLIProxy (non-Anthropic host), Claude Code disables MCP Tool Search by default. The launcher must explicitly configure this in `.claude/settings.json`.

## 8. RTK Integration

**Use RTK's native hook. Do NOT build a custom one.**

`rtk init -g` (v0.42.0) on Windows:
1. Writes `~/.claude/RTK.md` (10-line awareness file)
2. Patches CLAUDE.md with `@RTK.md`
3. Adds `"command": "rtk hook claude"` to settings.json PreToolUse
4. Creates `~/.config/rtk/filters.toml`
5. Backs up settings.json before patching

Native Rust binary hook — no bash, no jq, works on Windows natively. 63 commands rewritten transparently.

## 9. Quality Gate Chain (Maximum Rigor)

### Per-Turn: GPT-5.5 Codex Review

The Stop hook triggers Codex review after every Claude Code turn:

```
Claude Code (working)
  └─ [Stop event]
     ├─ Stop hook: codex review (GPT-5.5 @ xhigh)
     │   ├─ PASS → continue
     │   └─ BLOCKER → fix required, re-verify
     ├─ HANDOFF.md written (session state)
     └─ ccusage summary logged
```

Configured via existing Codex plugin stop-review gate (`codex@openai-codex`).

### Pre-Merge: Ship Gate (Dual-Model)

```
Ready to merge?
  └─ /ship-gate
     ├─ Claude Opus 4.7: independent review
     ├─ GPT-5.5 Codex: independent review
     ├─ Both must approve (adversarial convergence)
     └─ PASS → merge allowed
```

### Agent Team Quality: Self-Correcting Loop

```
TeammateIdle hook:
  ├─ Run project tests
  ├─ Run biome lint
  ├─ Tests pass? → exit 0 (teammate can idle)
  └─ Tests fail? → exit 2 (teammate must fix)
```

### Full Chain

```
Prechecks → Launch → [Every Turn: GPT-5.5 review] → [Teams: test gate]
                                                           ↓
                                              [Pre-PR: /ship-gate dual-model]
                                                           ↓
                                              [CI: promptfoo + tests + CodeQL]
```

## 10. Parallel Sessions & Agent Teams

### Parallel (Independent)

```
vein --parallel 3
  ├─ Prechecks ONCE
  ├─ git worktree add .worktrees/session-{a,b}
  └─ wt new-tab for each + claude in current terminal
```

### Agent Teams (Coordinated)

```
vein --team (reads .vein.json agents config)
  ├─ Prechecks ONCE
  ├─ CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  ├─ git worktree add per teammate (manual isolation)
  ├─ TeammateIdle hook wired (quality gate)
  └─ Lead spawns teammates with agent descriptors
```

Agent teams do NOT auto-isolate worktrees — the launcher creates them before spawning.

## 11. SOTA Git Configuration

- **Branch strategy:** Trunk-based (main protected, feature/fix/chore branches)
- **Commits:** commitlint conventional commits, SSH signing (not GPG)
- **Release:** release-please auto-changelog + semver
- **Pre-commit (lefthook):** biome + gitleaks + trufflehog (parallel)
- **Branch protection:** GitHub Rulesets v2 (required reviews, status checks, signatures)
- **Git config:** autocrlf=false, rebase pull, prune fetch, rerere, fsmonitor, longpaths
- **.gitattributes:** LF default, CRLF for .ps1/.cmd, binary for .exe
- **CI (5 workflows):** ci, codeql, commitlint, dependency-review, release-please
- **All actions SHA-pinned** (pinact enforced)

## 12. Session Persistence

- **HANDOFF.md pattern:** Stop hook writes session state (where-am-I, what's-next, affected-files)
- **SessionStart hook:** Reads HANDOFF.md, sets sessionTitle, returns reloadSkills: true
- **`--continue` / `--resume`:** Native Claude Code session resumption
- **cleanupPeriodDays:** Set non-zero to retain session history

## 13. Model Routing (40-60% Cost Savings)

- **Default:** Opus 4.7 (1M context) for main reasoning
- **Subagents:** `CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5` (automatic)
- **Planning:** `/model opusplan` (Opus plans, Sonnet executes)
- **Scouts:** `scout-haiku` agent for mechanical lookups
- **Teams:** Each teammate inherits the routing config

## 14. Token Optimization Stack

Layered compression (cumulative):
1. **RTK** — shell command output (60-90% reduction, 63 commands)
2. **context-mode** — tool output sandboxing (~98% reduction)
3. **Observation masking** — replace old tool outputs with `[output masked]` (52% savings, JetBrains-validated)
4. **MCP Tool Search** — lazy-load MCP tools (~47% reduction) — NOTE: may be disabled through proxy
5. **Proactive /compact** at 70-75% (before 83.5% autocompact trigger)
6. **context:fork** in heavy skills — runs in isolated subagent context

## 15. Ruflo Integration

Ruflo provides the intelligence layer across sessions:

- **ruflo-intelligence:** Model routing rationale, pattern learning across sessions
- **ruflo-agentdb:** Persistent agent memory (HNSW indexing, semantic search)
- **ruflo-neural-trader:** Trading pipeline (market-analyst → trading-strategist → risk-analyst)
- **ruflo-hooks:** TeammateIdle/TaskCompleted quality gates, session-start/end lifecycle
- **ruflo-observability:** Agent execution tracing, metrics collection
- **ruflo-swarm:** Multi-agent coordination when needed beyond Claude Code's native teams

The launcher's SessionStart hook can trigger ruflo session-start for cross-session context restoration.

## 16. Documentation Architecture

```
CLAUDE.md (root, ~200 lines)
  @RTK.md (injected by rtk init -g)
  @include agent_docs/architecture.md
  @include agent_docs/conventions.md

agent_docs/                    # @include'd modular docs
  architecture.md              # System design
  conventions.md               # Coding standards
  tiers.md                     # Tier module contract
  cliproxy.md                  # CLIProxy API contracts
  cache-safety.md              # Prompt caching rules

src/CLAUDE.md                  # Descendant: loaded when editing src/
src/tiers/CLAUDE.md            # Descendant: tier contract
src/cliproxy/CLAUDE.md         # Descendant: CLIProxy specifics
tests/CLAUDE.md                # Descendant: testing conventions
```

Hooks-beat-instructions: any rule with >80% compliance need → write as hook, not CLAUDE.md instruction.

## 17. Setup Flow

```
vein --setup
  ├─ Phase 1: Version Manager
  │   └─ winget install mise → mise install (pins from .mise.toml)
  │
  ├─ Phase 2: RTK
  │   └─ Download RTK v0.42 .exe → PATH → rtk init -g --auto-patch
  │
  ├─ Phase 3: CLIProxy
  │   ├─ Download CLIProxyAPI v7.1.23 .exe → ~/.vein/cliproxy/
  │   ├─ Generate config.yaml
  │   ├─ pm2 start cli-proxy-api.exe --name cliproxy
  │   ├─ pm2 startup → pm2 save
  │   ├─ Health check :8317
  │   └─ Cache validation (2-call test)
  │
  ├─ Phase 4: Security Tools
  │   └─ winget: gitleaks, lefthook, trufflehog, pinact
  │
  ├─ Phase 5: Git Config
  │   └─ SSH signing, rebase, prune, rerere, lefthook install
  │
  ├─ Phase 6: GitHub Rulesets
  │   └─ gh api: configure branch protection
  │
  ├─ Phase 7: Quality Tools
  │   └─ npm install -g pm2 @ryoppippi/ccusage promptfoo
  │
  └─ Phase 8: Docker (if any .vein.json specifies "hosting": "docker")
      └─ winget install Docker.DockerDesktop (WSL2 required, reboot)
```

## 18. Technology Stack (Research-Verified, May 2026)

| Component | Tool | Version | Why SOTA |
|-----------|------|---------|----------|
| Shell entry | PowerShell 7 | — | Windows-native |
| Orchestrator | Node.js 24 LTS (ESM) | 24.14.0 | Async-native |
| Version mgmt + tasks | **mise** | 2026.5.15 | Replaces nvm+pyenv+asdf+just (28.7k★) |
| Linter | **Biome** | 2.4.15 | 24x faster than ESLint+Prettier |
| Tests | **Vitest** | — | ESM-native |
| Eval CI | **Promptfoo** | — | Native Claude Code provider |
| API proxy | **CLIProxyAPI** | 7.1.23 | Native .exe, multi-account (35k★) |
| Process mgr | **PM2** | — | Same ecosystem, monitoring (43k★) |
| Token compression | **RTK** | 0.42.0 | Native Rust hook, 63 commands |
| Git hooks | **Lefthook** | 2.1.8 | Go binary, parallel |
| Release | **release-please** | 17.6.1 | Auto-changelog + semver |
| Secret scan | **Gitleaks** + **TruffleHog** | — | Layered: pre-commit + CI |
| SAST | **CodeQL** | — | GitHub-native, free |
| Cost tracking | **ccusage** + OTel | — | Community standard |
| Quality gate | **Codex CLI** (GPT-5.5) | 0.134.0 | xhigh effort, every stop |
| Code graph | **GitNexus** MCP | — | Background indexing |
| Observability | OTel day 1, **Langfuse** deferred | — | MIT, ClickHouse-backed |
| Intelligence | **Ruflo** | — | Cross-session learning |

**AVOID:** LiteLLM (compromised), Helicone (dead), NSSM (abandoned), Node 20 (EOL), Husky (superseded)

## 19. Project Structure

```
vein-launch/
├── CLAUDE.md
├── PLUGIN.md
├── .claude/
│   ├── settings.json
│   ├── settings.local.json (gitignored)
│   ├── agents/ (coder.md, reviewer.md, tester.md, researcher.md)
│   ├── skills/ (launch/, status/, accounts/, team/)
│   ├── commands/ (setup.md)
│   └── rules/ (cache-safety.md)
├── agent_docs/ (architecture.md, conventions.md, tiers.md, cliproxy.md, cache-safety.md)
├── .devcontainer/ (devcontainer.json)
├── .github/
│   ├── workflows/ (ci, codeql, commitlint, dependency-review, release-please)
│   ├── ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md, dependabot.yml
├── bin/ (vein.cmd, vein.ps1)
├── src/
│   ├── CLAUDE.md
│   ├── orchestrator.mjs
│   ├── parallel.mjs, team.mjs, project-config.mjs
│   ├── setup/ (index, rtk, cliproxy, tools, git-config, mise-init, github-rulesets)
│   ├── cliproxy/ (manager, pm2, docker, accounts, config-gen, cache-check, metrics)
│   ├── tiers/ (index, t0-rtk, t1-env, t2-cliproxy, t3-cli, t4-github, t5-drift, t6-codegraph)
│   ├── hooks/ (session-start, teammate-idle, stop-handler)
│   ├── quality/ (codex-review, ship-gate, test-gate)
│   ├── post-launch/ (gitnexus-index)
│   ├── lib/ (result, config, runner, reporter, download)
│   └── rules/ (block-rules.json)
├── config/
│   ├── default.json, schema.json
│   ├── cliproxy/ (config.template.yaml, docker-compose.yml)
│   └── profiles/ (trading.example.json, evolve.example.json)
├── evals/ (promptfooconfig.yaml, datasets/)
├── tests/ (tiers/, cliproxy/, hooks/, setup/, fixtures/)
├── .editorconfig, .gitattributes, .gitignore, .gitleaks.toml
├── .mise.toml
├── biome.json, lefthook.yml, vitest.config.mjs
├── CONTRIBUTING.md, LICENSE (MIT), README.md
└── package.json
```

## 20. State Directory

```
~/.vein/
├── cliproxy/ (cli-proxy-api.exe, config.yaml, logs/)
├── cache/ (tier-results.json, deep-cache.json, gitnexus-last-index.json)
├── sessions/ (parallel-*.json, HANDOFF.md)
└── metrics/ (daily.jsonl)
```

## 21. Future Extensions (Deferred from v1)

- T7-eval: Promptfoo/inspect-ai as precheck tier
- CLIProxy cluster mode (CLIProxyAPIHome JWT workers)
- Auto-scaling accounts (detect quota pressure → add accounts)
- Langfuse full observability pipeline
- MCP RC stateless-transport support (2026-07-28)
- Depot.dev cross-machine session sync
- Copier project template integration
- chezmoi config sync across machines
- Bifrost enterprise budget caps (when moving to API billing)

---

*Final spec 2026-05-27. 10 research agents, 6 search tools, 100+ sources. All tool versions verified live.*
