# vein-launch

SOTA Claude Code launcher with 7-tier precheck, CLIProxy management, and GPT-5.5 quality gates.

## Quick Start

```powershell
# Windows (PowerShell)
.\bin\vein.ps1 trading

# Or via npm (after install)
vein trading
```

## What It Does

`vein-launch` validates your Claude Code environment before every session:

| Tier | Name | Mode | What It Checks |
|------|------|------|----------------|
| T0 | RTK | fast | Token compression binary + hook/injection config |
| T1 | ENV | fast | Environment vars, ~/.vein/ state directory |
| T2 | CLIProxy | fast | Proxy process (PM2/Docker), health endpoint |
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

## Configuration

Per-project config via `.vein.json` at project root:

```json
{
  "project": "trading",
  "mode": { "default": "deep" },
  "cliproxy": { "hosting": "docker", "port": 8317 },
  "quality": { "codexReview": "every-stop", "shipGate": true },
  "modelRouting": { "default": "opus", "subagents": "claude-haiku-4-5" }
}
```

## CLIProxy

Manages API proxy for prompt caching and account rotation:

- **PM2 mode**: `vein --accounts add` then auto-managed
- **Docker mode**: `wsl docker compose` via WSL2
- Cache validation: verifies `cache_read_input_tokens > 0`

## Quality Gates

| Gate | When | Model |
|------|------|-------|
| Per-stop review | Every Claude turn | GPT-5.5 xhigh |
| Ship gate | Pre-merge | Dual (Claude + GPT-5.5) |
| TeammateIdle | Agent team idle | vitest + biome |

## Architecture

```
bin/vein.ps1 -> src/cli.mjs -> src/orchestrator.mjs
  -> src/lib/config.mjs (load + validate .vein.json)
  -> src/lib/runner.mjs (execute tiers within budget)
  -> src/tiers/t0-t6 (precheck modules)
  -> src/lib/block-engine.mjs (declarative rule evaluation)
  -> src/lib/exec.mjs (spawn claude with configured env)
```

## Development

```bash
npm install           # install deps
npx vitest run        # run tests
npx biome check .     # lint
npx vitest --coverage # coverage report
```

## License

MIT
