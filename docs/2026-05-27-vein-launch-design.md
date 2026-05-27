# vein-launch — SOTA Claude Code Launcher Design Spec

> **Status**: Design approved 2026-05-27
> **Author**: seathatflowsinourveins + Claude Opus 4.7
> **Repo**: New standalone repo (to be created)
> **Predecessors**: eee.ps1 (ourveins), CLIProxyAPI integration (myvein)

---

## 1. Problem Statement

Launching Claude Code into a production-grade development session requires multiple preconditions: environment variables set, CLI tools at correct versions, GitHub auth valid, MCP servers healthy, CLIProxyAPI running with healthy accounts, RTK token compression configured, and the code-graph indexed. Today these checks are either manual, stale (Z:-drive-dependent eee.ps1 in ourveins), or scattered across shell scripts in myvein. There is no single command that validates everything, manages multi-account CLIProxy routing, and launches Claude Code in an optimal state.

## 2. Solution Overview

**vein-launch** is a standalone CLI tool that validates, configures, and launches Claude Code sessions. It is a thin PowerShell entry point (~50 LOC) backed by a Node.js orchestrator that runs 8 tiers of prechecks, manages CLIProxyAPI (multi-account Docker proxy), configures RTK token compression, and supports parallel session spawning via git worktrees.

### Architecture

```
                    ┌──────────────────┐
                    │   vein launcher   │
                    │   (PS1 + Node)    │
                    └────────┬─────────┘
                             │
         ┌───────────┬───────┴────────┬──────────────┐
         ▼           ▼                ▼              ▼
   ┌──────────┐ ┌──────────┐  ┌───────────┐  ┌───────────┐
   │ Prechecks│ │ CLIProxy │  │    RTK     │  │ Sessions  │
   │ T0-T7   │ │ Manager  │  │   Hooks    │  │ Parallel  │
   │          │ │          │  │            │  │ Worktrees │
   └──────────┘ └────┬─────┘  └────────────┘  └───────────┘
                     │
              ┌──────▼──────────────────────────────┐
              │     CLIProxyAPI (Docker :8317)       │
              │  Round-robin + session affinity      │
              │  Multi-account OAuth management      │
              └──────┬──────────────────────────────┘
                     │
    ┌────────────────┼────────────────────┐
    ▼                ▼                    ▼
┌────────┐    ┌──────────┐        ┌───────────┐
│ Claude │    │  Codex   │        │ Gemini    │
│ Code   │    │  CLI     │        │ CLI       │
└────────┘    └──────────┘        └───────────┘
```

### Design Principles

1. **Thin shell, smart Node.js** — PowerShell only parses args and calls Node; all logic in testable .mjs modules
2. **`$PSScriptRoot`-relative** — no hardcoded absolute paths; portable across machines
3. **Config-driven tiers** — JSON schema validates config; adding a tier = one file + one config entry
4. **Budget-enforced modes** — each mode has a time budget; tiers that exceed it are skipped with a warning
5. **Secrets never in repo** — all state in `~/.vein/`, OAuth tokens in auth-dir, `.gitignore` enforced
6. **Standard module interface** — every tier exports `{ check, repair, meta }`

## 3. CLI Surface

```bash
# Launch modes
vein                            # Fast: T0-T1-T2(container)-T3 (≤5s) → launch claude
vein --deep                     # All tiers T0-T7 (≤30s) → launch
vein --repair                   # All tiers + auto-heal (≤60s) → launch
vein --setup                    # First-time: git config, CLIProxy pull, RTK install, accounts

# Parallel sessions
vein --parallel [N]             # Precheck once → spawn N worktree sessions
vein --parallel --roles code,review   # Named role overlays per session

# Account management
vein --accounts                 # Show inventory + health table
vein --accounts rotate          # Force round-robin rotation
vein --accounts add             # Interactive OAuth login flow
vein --accounts reset           # Weekly reset guard
vein --accounts cache-rate      # Per-account prompt cache hit rates

# Diagnostics
vein --status                   # Last precheck results without launching
vein --status cliproxy          # CLIProxy container + account health
vein --status rtk               # RTK gain stats
```

## 4. Three-Mode System

| Mode | Flag | Budget | Network | Tiers | Mutations |
|------|------|--------|---------|-------|-----------|
| **Fast** | `vein` (default) | ≤5s | NO | T0 + T1 + T2(container) + T3 | safe-local only |
| **Deep** | `--deep` | ≤30s | YES (24h cache) | T0-T7 | same as fast |
| **Repair** | `--repair` | ≤60s | YES | T0-T7 + repair commands | docker compose up, account refresh, git worktree prune, pin refresh |

## 5. Eight-Tier Precheck System

### Tier Module Contract

Every tier module in `src/tiers/` exports:

```javascript
export const meta = {
  id: 't0-rtk',
  name: 'RTK Token Compression',
  modes: ['fast', 'deep', 'repair'],
  budgetMs: 3000,
  blocking: 'required'  // 'required' | 'advisory'
};

export async function check(mode, config) {
  // Returns: { status: 'pass'|'warn'|'block', message, remediation? }
}

export async function repair(config) {
  // Only called in --repair mode. Returns: { status, message }
}
```

### Tier Matrix

| Tier | What it checks | Fast | Deep | Repair | Blocking |
|------|---------------|------|------|--------|----------|
| **T0 RTK** | Binary present, version pin, PreToolUse hook configured | ✓ | ✓ | ✓ + install | required |
| **T1 ENV** | Env vars (from CLAUDE.md + settings.json + .mcp.json), path safety, state-dir JSON validity, gitignore coverage, stale session JSONL | ✓ | ✓ | ✓ + prune stale | required |
| **T2 CLIProxy** | Docker running, container up, :8317 health, account count, cache rate | container status | full health + account audit | `docker compose up -d` + account refresh | required |
| **T3 CLI** | Exact version probes: node ≥22, python ≥3.13, gh + auth scopes (repo, workflow, security_events), claude ≥2.1, rtk, codex, gitleaks, lefthook | ✓ | ✓ | ✓ + pin refresh | required |
| **T4 GitHub** | Ruleset `main-protection-sota` active, required status checks present, SSH commit signing, no stale rebase state, auth scopes sufficient | skip | ✓ | ✓ | required |
| **T5 Drift** | MCP roster from .mcp.json (skip disabled), per-server metadata (required/advisory/credential-gated), stale-ref scan, version pin drift | roster only | ✓ + per-server smoke (24h cache) | same as deep | required on stale-ref |
| **T6 Research** | SCA manifest, multi-convergence routing rule, discovery-cache freshness | skip | ✓ (advisory) | ✓ | advisory |
| **T7 CodeGraph** | GitNexus: repo indexed? stale since last commit? | skip | skip | background post-launch | advisory |

### Block Rules (B1-B10)

Declarative in `src/rules/block-rules.json`:

| Id | Trigger | Remediation |
|----|---------|-------------|
| B1 | Leaked credential in tracked/staged file | `gitleaks protect --staged --redact` |
| B2 | Unsanctioned hook (new file in .claude/hooks/ without CLAUDE.md cite) | Add cite-anchor or retire hook |
| B3 | SCA version drift (telemetry constant inconsistent with canonical) | Reconcile to canonical |
| B4 | Docker daemon down in deep/repair mode | Start Docker Desktop |
| B5 | CLIProxy container unhealthy (3 consecutive health check failures) | `vein --repair` |
| B6 | Zero active CLIProxy accounts | `vein --accounts add` |
| B7 | GitHub auth expired | `gh auth login --scopes repo,workflow,security_events` |
| B8 | Research arch broken (files present + smoke-tests fail) | Restore baseline |
| B9 | Critical MCP version drift (major version mismatch) | `npm install -g <pkg>@<pin>` |
| B10 | GitHub Action SHA-pin floating | `pinact run` |

## 6. CLIProxyAPI Integration

### 6a. Container Lifecycle

CLIProxyAPI runs as a Docker container managed by the launcher:

- **Image**: `eceasy/cli-proxy-api:latest`
- **Port**: 8317 (main API)
- **Volumes**: config.yaml, auth-dir, logs — all under `~/.vein/cliproxy/`
- **Restart policy**: `unless-stopped`

T2 tier manages the container:
- **Fast mode**: `docker ps --filter name=cli-proxy-api` → running check only
- **Deep mode**: HTTP health probe + account inventory + cache rate audit
- **Repair mode**: `docker compose up -d` if down, account refresh if expiring

### 6b. Config Generation

The launcher generates `~/.vein/cliproxy/config.yaml` from `config/cliproxy/config.template.yaml`:

Key generated sections:
- `routing.strategy: "round-robin"` with `session-affinity: true`
- `claude-header-defaults.stabilize-device-profile: true`
- `request-retry: 3`, `max-retry-credentials: 2`
- Account credential blocks injected from auth-dir state

Config is regenerated on `vein --setup` and `vein --repair`. Manual edits are preserved via merge (template sections are marked with sentinel comments).

### 6c. OAuth Account Management

```
vein --accounts add
  1. Select provider (Claude / Codex / Gemini / Grok)
  2. CLIProxy management API triggers OAuth flow → browser opens
  3. User completes OAuth consent
  4. Token stored in ~/.vein/cliproxy/auths/<provider>/
  5. Config regenerated with new credential block
  6. Health verify: account appears in rotation
```

Account states:

| State | Meaning | Launcher action |
|-------|---------|-----------------|
| `active` | Healthy, in rotation | None |
| `quota-exceeded` | Rate limited | Auto-rotate; warn |
| `expiring` | Token expires within 24h | Warn + prompt refresh |
| `expired` | Token dead | Remove from rotation; block if last |
| `cooling` | Temporary 429 backoff | Auto-skip, retry after cooldown |

### 6d. Claude Code Routing

The launcher sets `ANTHROPIC_BASE_URL` before spawning Claude Code:

```powershell
$env:ANTHROPIC_BASE_URL = "http://localhost:$($config.cliproxy.port)/v1"
& $claudeBin @ForwardArgs
```

CLIProxy's `cloak` feature makes requests appear as native Claude Code to Anthropic's API, maintaining full compatibility (streaming, tool use, thinking, extended context).

Session affinity ensures a single Claude Code conversation stays on one account throughout its lifetime. Affinity key: `metadata.user_id` from Claude Code session format.

**Fallback when CLIProxy is down:** If T2 detects the container is not running in fast mode (no repair), the launcher blocks with B5 and does NOT set `ANTHROPIC_BASE_URL` — Claude Code would launch against Anthropic directly (no proxy), which defeats multi-account and monitoring. The block is intentional: if CLIProxy is the backbone, launching without it is not a valid state. Use `vein --repair` to bring it up.

## 7. RTK Integration

### 7a. Installation (T0 tier)

T0 checks:
1. `rtk` binary on PATH → version matches pin
2. `~/.config/rtk/config.toml` exists with correct settings
3. PreToolUse hook registered in Claude Code settings

On Windows native, RTK's auto-rewrite hook doesn't work. The launcher provides a custom hook:

### 7b. Custom PreToolUse Hook (`src/hooks/rtk-rewrite.mjs`)

```javascript
// Intercepts Bash tool calls and rewrites to rtk equivalents
// Replaces RTK's Unix-only bash hook on Windows
const REWRITE_MAP = {
  'git': 'rtk git',
  'ls': 'rtk ls',
  'cat': 'rtk read',
  'grep': 'rtk grep',
  'find': 'rtk find',
  'cargo': 'rtk cargo',
  'npm': 'rtk npm',
  'pytest': 'rtk pytest',
  'go test': 'rtk go test',
  // ... 100+ supported commands
};
```

The hook is installed into Claude Code's `settings.json` as a PreToolUse/Bash hook during `vein --setup`.

### 7c. RTK Config

```toml
# ~/.config/rtk/config.toml (managed by vein)
[hooks]
exclude_commands = ["docker", "claude"]  # Don't rewrite these

[tee]
enabled = true
mode = "failures"  # Save full output on failure for debugging
```

## 8. Parallel Session System

### 8a. Design

```
vein --parallel 3
  ├─ Prechecks (once, shared) T0-T3
  ├─ CLIProxy health (once)
  ├─ Per-session setup (parallel):
  │   ├─ git worktree add .worktrees/session-a -b session/a
  │   ├─ git worktree add .worktrees/session-b -b session/b
  │   └─ Session C: main branch (no worktree)
  └─ Launch (parallel):
      ├─ wt new-tab -- claude --cwd .worktrees/session-a
      ├─ wt new-tab -- claude --cwd .worktrees/session-b
      └─ claude (current terminal, main branch)
```

- **Prechecks run once** — shared validation, not repeated per session
- **Git worktrees** for isolation — concurrent file edits don't collide
- **Windows Terminal tabs** — each session in its own `wt` tab
- **CLIProxy session affinity** — each session gets a stable account

### 8b. Role System

Named roles apply CLAUDE.md overlays per session:

```bash
vein --parallel --roles code,review
```

Roles defined in `config/roles/`:
- `default.md` — base overlay applied to all sessions
- `coder.md` — implementation-focused instructions
- `reviewer.md` — review-focused, read-only tool suggestions

Roles are concatenated to the project CLAUDE.md via a `.claude/rules/` file in the worktree.

### 8c. Cleanup

Worktrees are cleaned up when sessions end:

```bash
vein --repair  # Includes: git worktree prune
```

Session metadata is logged to `~/.vein/sessions/parallel-<timestamp>.json`.

## 9. SOTA Git Configuration

### 9a. Branch Strategy

Trunk-based development:
- `main` — protected, single source of truth
- `feature/<ticket>-<slug>`, `fix/<ticket>-<slug>`, `chore/<slug>` — short-lived branches
- Squash-and-merge as default merge strategy

### 9b. Commit Standards

| Layer | Tool | Enforcement |
|-------|------|-------------|
| Format | commitlint | Conventional Commits (feat/fix/chore/docs/test/ci) |
| Signing | SSH signing | All commits signed (SSH keys, not GPG) |
| Changelog | release-please | Auto-generated from commit prefixes |
| Versioning | release-please | Semver from commit types |

### 9c. Pre-commit Hooks (lefthook)

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint:
      run: npx biome check --staged
    gitleaks:
      run: gitleaks protect --staged --redact
    no-secrets:
      run: trufflehog filesystem --staged --fail
commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
```

### 9d. Branch Protection — GitHub Rulesets v2

The launcher configures via `gh api`:
- Required PR reviews (1 approver, dismiss stale on push)
- Required status checks: `ci`, `codeql`, `commitlint`
- Commit message pattern: conventional commits regex
- Required SSH signatures
- Deletion protection
- Non-fast-forward protection

T4 tier validates this ruleset is active on every `--deep` launch.

### 9e. Git Config (set by `vein --setup`)

```ini
core.autocrlf = false
core.eol = lf
core.longpaths = true
core.fsmonitor = true
commit.gpgsign = true
gpg.format = ssh
push.autoSetupRemote = true
push.default = current
pull.rebase = true
fetch.prune = true
fetch.prunetags = true
init.defaultBranch = main
rerere.enabled = true
```

### 9f. .gitattributes

```
* text=auto eol=lf
*.mjs    text eol=lf
*.js     text eol=lf
*.json   text eol=lf
*.md     text eol=lf
*.yml    text eol=lf
*.ps1    text eol=crlf
*.cmd    text eol=crlf
*.exe    binary
*.dll    binary
tests/fixtures/** linguist-generated
config/**         linguist-data
```

### 9g. CI/CD — GitHub Actions

```
.github/workflows/
├── ci.yml                    # PR: lint + test + typecheck (windows-latest)
├── codeql.yml                # SAST: JavaScript security queries
├── commitlint.yml            # Conventional commit format
├── dependency-review.yml     # Block known-vulnerable deps
├── release-please.yml        # Auto-release: changelog + version + tag
├── scorecard.yml             # Weekly OSSF Scorecard
├── sbom.yml                  # SBOM on release
├── provenance.yml            # SLSA provenance attestation
├── stale.yml                 # Auto-close stale issues (90d)
└── pinact-check.yml          # All actions SHA-pinned
```

All action references pinned to commit SHAs (enforced by pinact).

### 9h. GitNexus (Post-Launch Background)

GitNexus code-graph indexing runs as a background task after Claude starts:
- Only if repo changed since last index
- Non-blocking (spawn, don't await)
- Result logged to `~/.vein/cache/gitnexus-last-index.json`
- In parallel mode, only the primary session triggers re-index

## 10. Project Structure

```
vein-launch/
├── .claude/
│   ├── settings.json
│   └── rules/
│       └── tiers.md
├── .github/
│   ├── workflows/           (9 workflow files per §9g)
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   └── feature.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── bin/
│   ├── vein.cmd              # CMD shim (3 LOC)
│   └── vein.ps1              # PS1 entry (~50 LOC, $PSScriptRoot-relative)
├── src/
│   ├── orchestrator.mjs      # Mode router + tier sequencer
│   ├── parallel.mjs          # Multi-session spawner (worktrees + wt tabs)
│   ├── cliproxy/
│   │   ├── manager.mjs       # Container lifecycle (start/stop/health)
│   │   ├── accounts.mjs      # Account CRUD + rotation + health
│   │   ├── config-gen.mjs    # Generate config.yaml from template
│   │   └── metrics.mjs       # Cache rate, token efficiency, quota
│   ├── tiers/
│   │   ├── index.mjs         # Tier registry (dynamic import by mode)
│   │   ├── t0-rtk.mjs
│   │   ├── t1-env.mjs
│   │   ├── t2-cliproxy.mjs
│   │   ├── t3-cli.mjs
│   │   ├── t4-github.mjs
│   │   ├── t5-drift.mjs
│   │   ├── t6-research.mjs
│   │   └── t7-codegraph.mjs
│   ├── hooks/
│   │   └── rtk-rewrite.mjs   # PreToolUse RTK hook for Windows
│   ├── post-launch/
│   │   └── gitnexus-index.mjs
│   ├── roles/
│   │   └── loader.mjs        # Role config resolver
│   ├── lib/
│   │   ├── result.mjs        # TierResult type + severity enum
│   │   ├── config.mjs        # Config loader + JSON Schema validation
│   │   ├── runner.mjs        # Tier executor (budgets, timeouts)
│   │   └── reporter.mjs      # Structured console output
│   └── rules/
│       └── block-rules.json   # Declarative B1-B10
├── config/
│   ├── default.json           # Tier settings, mode budgets, CLIProxy port
│   ├── schema.json            # JSON Schema for config validation
│   ├── cliproxy/
│   │   ├── config.template.yaml
│   │   └── docker-compose.yml
│   └── roles/
│       ├── default.md
│       ├── coder.md
│       └── reviewer.md
├── tests/
│   ├── tiers/                 # Per-tier unit tests
│   ├── cliproxy/              # CLIProxy manager tests
│   ├── parallel.test.mjs
│   ├── orchestrator.test.mjs
│   └── fixtures/
├── docs/
│   └── superpowers/specs/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .gitleaks.toml
├── biome.json
├── CLAUDE.md
├── CONTRIBUTING.md
├── lefthook.yml
├── LICENSE                    # MIT
├── package.json               # type: "module", vitest, biome
├── README.md
└── vitest.config.mjs
```

## 11. State Directory

```
~/.vein/                        # VEIN_HOME — all runtime state
├── cliproxy/
│   ├── config.yaml            # Generated
│   ├── docker-compose.yml     # Managed
│   ├── auths/                 # OAuth tokens per provider
│   └── logs/                  # Container logs
├── rtk/
│   └── config.toml            # RTK settings
├── cache/
│   ├── tier-results.json      # Last precheck results
│   └── gitnexus-last-index.json
├── sessions/
│   └── parallel-*.json        # Parallel session metadata
└── metrics/
    └── daily.jsonl            # Launch metrics
```

## 12. Technology Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Shell entry | PowerShell 7 | Windows-native, `$PSScriptRoot`-relative |
| Check logic | Node.js 22+ (ESM) | Async-native, vitest testable, rich ecosystem |
| Linter | Biome | Single binary, 100x faster than ESLint, lint + format |
| Tests | Vitest | Fast, ESM-native, good DX |
| Proxy | CLIProxyAPI (Docker) | Multi-account, multi-model, session affinity |
| Token compression | RTK | Rust binary, <10ms, 60-90% savings |
| Git hooks | Lefthook | Single Go binary, 10x faster than husky |
| Commits | commitlint + release-please | Conventional commits, auto-changelog, semver |
| Security | gitleaks + trufflehog + CodeQL | Secret scanning + SAST |
| Supply chain | pinact + dependabot + OSSF Scorecard | SHA-pinned actions, auto-updates, scoring |
| Code graph | GitNexus MCP | Background indexing, impact analysis |

## 13. Future Extensions

Designed-in extension points (not implemented in v1):
- **T8-eval**: Eval harness integration (promptfoo, inspect-ai) as a precheck tier
- **Cluster mode**: CLIProxyAPI cluster with CLIProxyAPIHome JWT workers
- **Cost tracking**: Per-account, per-session cost aggregation from CLIProxy metrics
- **Auto-scaling accounts**: Detect quota pressure → prompt to add accounts
- **MCP RC support**: When MCP stateless-transport lands (2026-07-28 RC), T2/T5 adapt transport probes

---

*Spec written 2026-05-27. Predecessors: eee.ps1 W393 contract (ourveins), myvein accounts infrastructure, RTK (rtk-ai/rtk), CLIProxyAPI (router-for-me/CLIProxyAPI).*
