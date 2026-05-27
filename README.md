# vein-launch

[![CI](https://github.com/seathatflowsinourveins/vein-launch/actions/workflows/ci.yml/badge.svg)](https://github.com/seathatflowsinourveins/vein-launch/actions/workflows/ci.yml)

> **What is vein-launch?**
> A SOTA Claude Code launcher that validates your development environment through 7 tiers of
> prechecks before every session — ensuring your CLIProxy, SOTA tools, GitHub auth, MCP drift,
> and code-graph index are all healthy before `exec claude` runs. It ships quality gates (GPT-5.5
> Codex review, ship-gate, eval-gate) as opt-in hooks so the same CLI that launches your session
> also enforces your quality chain.

## Quickstart

```powershell
# 1. Install
npm install -g vein-launch

# 2. Run vein-launch itself (dogfood launch)
vein vein-launch

# 3. First deep run — validates all 7 tiers including GitHub auth + MCP drift
vein vein-launch --deep
```

That's it. `vein <project>` (fast mode) runs in under 5 seconds. Use `--deep` when you want
the full T4-T6 network checks. Add `.vein.json` to your project root to customize behavior.

## Tiers

`vein-launch` runs up to 7 prechecks before every session:

| Tier | Name | Mode | What It Checks |
|------|------|------|----------------|
| T0 | RTK | fast | Token compression binary + hook/injection config |
| T1 | ENV | fast | Environment vars, ~/.vein/ state directory |
| T2 | CLIProxy | fast | Proxy process (PM2/Docker), /healthz endpoint |
| T3 | CLI Tools | fast | node>=24, python>=3.13, gh, claude, rtk, codex |
| T4 | GitHub | deep | Auth scopes, SSH signing, rulesets |
| T5 | Drift | deep | MCP server version drift vs pins |
| T6 | CodeGraph | deep | GitNexus index freshness |

## Modes

| Mode | Budget | Tiers | Network |
|------|--------|-------|---------|
| `fast` | 5s | T0-T3 | No |
| `deep` | 30s | T0-T6 | Yes (24h cache) |
| `repair` | 60s | T0-T6 + auto-fix | Yes |

```bash
vein trading              # fast mode (default)
vein trading --deep       # deep mode
vein trading --repair     # repair mode
vein --setup              # first-time setup wizard
```

## --manifest flag

Prints all SOTA components vein-launch coordinates, their versions, sources, and install
commands. Use this to audit or bootstrap a new machine.

```bash
vein --manifest
```

Example output:

```
Component              Version  Source                                 Purpose
─────────────────────────────────────────────────────────────────────────────
AO (Agent Orchestrator) 0.9.2   github.com/superinit/agent-orchestrator Worktree parallel agent orchestrator
CCW                     7.3.14  github.com/ddfourtwo/claude-code-workflow Multi-CLI beat-model workflow
Codex CLI               0.134.0 npmjs.com/package/@openai/codex         GPT-5.5 xhigh second-model review
RTK                     0.42.0  npmjs.com/package/runtime-toolkit       Token compression (CLAUDE.md inject)
CLIProxy                7.1.24  github.com/router-for-me/CLIProxyAPI    OAuth routing on :8317
GitNexus                1.6.5   npm @gitnexus/cli                       Git context graph for agents
PM2                     7.0.1   npm pm2                                 Daemon manager for CLIProxy
```

Full manifest detail lives in [docs/sota-installed-manifest.md](docs/sota-installed-manifest.md).

## Configuration via .vein.json

Place a `.vein.json` at your project root to customize vein-launch behavior:

```json
{
  "project": "trading",
  "mode": { "default": "deep" },
  "cliproxy": { "hosting": "docker", "port": 8317 },
  "quality": {
    "codexReview": "every-stop",
    "shipGate": true,
    "unleashPhase": "bypass"
  },
  "modelRouting": { "default": "opus", "subagents": "claude-haiku-4-5" }
}
```

Key fields:

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `mode.default` | `fast`, `deep`, `repair` | `fast` | Mode when no flag given |
| `cliproxy.hosting` | `pm2`, `docker` | `pm2` | How CLIProxy is managed |
| `quality.unleashPhase` | `gate`, `warn`, `bypass` | `gate` | How the eval-gate affects launch |
| `quality.codexReview` | `every-stop`, `pr-only`, `off` | `pr-only` | When GPT-5.5 review fires |
| `quality.shipGate` | `true`, `false` | `false` | Enable dual-model pre-merge gate |

## Quality Chain

Every change in vein-launch passes through this gate sequence:

| Gate | When | Tool | Status |
|------|------|------|--------|
| Unit tests | Every commit | vitest (493 tests) | CI enforced |
| Lint + format | Every commit | biome (0 warnings) | CI enforced |
| Eval gate | Deep run | promptfoo + JSONL history | Per-session |
| GPT-5.5 review | Per-stop | Codex CLI xhigh | Opt-in hook |
| Ship gate | Pre-merge | Dual-model (Claude + GPT-5.5) | Manual |

Register the hooks in `.claude/settings.json` to activate per-stop review and ship-gate.
See `src/hooks/` for the hook handler scripts.

## CLIProxy

Manages API proxy for prompt caching and account rotation:

- **PM2 mode**: `vein --accounts add` then auto-managed
- **Docker mode**: `wsl docker compose` via WSL2
- Health probe: `/healthz` endpoint (CLIProxy v7+ Kubernetes-style)
- Cache validation: verifies `cache_read_input_tokens > 0`

## Architecture

```
bin/vein.ps1 -> src/cli.mjs -> src/orchestrator.mjs
  -> src/lib/config.mjs     (load + validate .vein.json)
  -> src/lib/runner.mjs     (execute tiers within budget)
  -> src/tiers/t0-t6        (precheck modules)
  -> src/lib/block-engine.mjs (declarative rule evaluation)
  -> src/lib/exec.mjs       (spawn claude with configured env)
```

## Known Limitations (v1.2.0 backlog)

- **promptfoo eval requires `--mode=deep` currently** — the eval-gate only fires during deep
  runs. Fast-mode eval gating is planned for v1.2.0.
- **ship-gate requires Codex CLI authenticated** — `codex auth` must succeed before ship-gate
  can call GPT-5.5. If Codex CLI is not authenticated, ship-gate fails closed.
- **CLIProxy Docker mode requires WSL2** — the Docker hosting path shells out to WSL2. Native
  Windows Docker is not supported yet.
- **T4-T6 results cached for 24h** — GitHub auth, MCP drift, and CodeGraph checks use a 24h
  cache. Stale cache can mask a real drift. Use `--repair` to force-refresh.
- **GitNexus index path is hardcoded** — T6-CodeGraph assumes GitNexus indexes to the default
  path. Custom `gitnexus.indexPath` config is planned.

## Development

```bash
npm install                  # install deps
npx vitest run               # run 493 tests
npx biome check .            # lint (0 warnings enforced)
npx vitest run --coverage    # coverage report (80% threshold)
```

## Install Provenance

All external dependency installs and release audit entries are logged in
[docs/install-provenance.md](docs/install-provenance.md).

## License

MIT
