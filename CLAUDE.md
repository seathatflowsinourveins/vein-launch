# vein-launch

SOTA Claude Code launcher. 7-tier precheck → environment setup → `exec claude`.

## Architecture

Three locations: `C:\SEA\` (source), `~/` (tool state), WSL2 `~/docker/` (containers).
Thin PS1 shell parses args → Node.js ESM orchestrator does everything else.

## Key Components

- **bin/vein.ps1** — Entry point. Parses CLI args, delegates to Node orchestrator.
- **src/orchestrator.mjs** — Mode router (fast/deep/repair) + tier sequencer.
- **src/tiers/** — T0-T6 precheck modules. Each exports `{ check, repair, meta }`.
- **src/cliproxy/** — CLIProxy lifecycle: Docker or PM2, accounts, config-gen, cache health.
- **src/quality/** — GPT-5.5 Codex review hook, ship-gate, test-gate.
- **src/lib/result.mjs** — `TierResult` type + `Severity` enum (all tier outputs).
- **config/schema.json** — JSON Schema for `.vein.json` validation.
- **config/default.json** — Default tier settings, budgets, ports.

## Module Contract

Every tier in `src/tiers/` exports:
```js
export const meta = { id: "t0-rtk", name: "RTK", modes: ["fast","deep","repair"] };
export async function check(config, context) { /* returns TierResult */ }
export async function repair(config, context) { /* returns TierResult */ }
```

## Modes

| Mode | Budget | Tiers | Network |
|------|--------|-------|---------|
| Fast | ≤5s | T0-T3 | No |
| Deep | ≤30s | T0-T6 | Yes (24h cache) |
| Repair | ≤60s | T0-T6 + repair | Yes |

## .vein.json

Per-project config at repo root. Validated against `config/schema.json`.
No `.vein.json` → defaults (fast mode, PM2, Opus, GPT-5.5 on PR only).

## Eval History (Wave 10.5-B)

The eval-gate history log lives **outside the repo** at `~/.vein/eval-history/<project>.jsonl`,
where `<project>` is the lowercased, alphanumeric-plus-hyphens basename of the working
directory (e.g. `vein-launch`). This path is intentional: keeping the file in-repo caused
a permanent "modified" git status because the commit-msg hook appends to it on every commit,
and a tracked file is trivially tampered with (delete → free first-run pass). The parent
directory is created automatically on first use. `docs/eval-history.jsonl` is gitignored.

## Quality Chain

Prechecks → Launch → [Per-turn: RTK + context-mode] → [Per-stop: GPT-5.5 xhigh]
→ [Pre-PR: ship-gate dual-model] → [CI: biome + vitest + promptfoo + CodeQL]

## Code Conventions

- ESM only (`type: "module"`, `.mjs` extensions)
- Biome for lint + format (no ESLint/Prettier)
- Vitest for tests (80% coverage threshold)
- No default exports — named exports only
- Errors: throw with context, never swallow silently
