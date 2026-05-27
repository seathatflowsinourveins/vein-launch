# Architecture

## Three Locations

| Location | Purpose | Filesystem |
|----------|---------|-----------|
| `C:\SEA\` | Source code (vein-launch, trading, evolve) | NTFS |
| `~/` (`C:\Users\seath\`) | Tool state (.claude, .codex, .config/rtk, bin/) | NTFS |
| WSL2 `~/docker/` | Container state (compose, secrets, volumes) | ext4 |

## Data Flow

```
bin/vein.ps1 (parse args)
  → node src/orchestrator.mjs (mode routing)
    → src/lib/config.mjs (load + validate .vein.json)
    → src/lib/runner.mjs (execute tier sequence within budget)
      → src/tiers/t0-rtk.mjs ... t6-codegraph.mjs
    → src/lib/reporter.mjs (structured output)
  → Set env vars (ANTHROPIC_BASE_URL, SUBAGENT_MODEL, etc.)
  → exec claude [--dangerously-skip-permissions] [pass-through args]
```

## Key Invariant

vein-launch runs BEFORE Claude. It never runs inside Claude's context. This means:
- All source is testable with plain Node.js (no Claude dependency)
- The launcher is a pure function: config in → environment out → exec
- Hooks configured by vein-launch execute AT RUNTIME inside Claude, not at launch time
