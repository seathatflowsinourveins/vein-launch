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
→ [Pre-PR: ship-gate dual-model] → [CI: biome + vitest + promptfoo] → [CodeQL: PR security scan]

### Stop-handler env vars

The Stop hook (`src/hooks/stop-handler-cli.mjs`) reads two opt-in env vars:

- `CODEX_STOP_REVIEW=1` — enables GPT-5.5 Codex review at every stop. Set by
  `buildLaunchEnv()` in `src/lib/exec.mjs` when `.vein.json` has
  `quality.codexReview === "every-stop"`. **Unset** → review is skipped.
- `VEIN_LAUNCHED=1`, `VEIN_PROJECT=<name>` — set by the launcher; the stop
  handler uses these to scope log file locations.

Without vein-launch in the chain, `CODEX_STOP_REVIEW` is unset and the Stop
hook completes without invoking Codex. This is intentional opt-in (review is
expensive); declare it explicitly in `.vein.json` to turn on.

### Other env vars

User-settable:

- `CLIPROXY_PORT` (default `8317`) — overrides the port `doctor.mjs` health-checks and `tools/hud-bridge.mjs` connects to. Must match the actual CLIProxy port; mismatch is silently broken (false-pass health checks).
- `ANTHROPIC_API_KEY` — Anthropic platform API key (alternative to `claude` CLI subscription); checked by `setup/doctor.mjs` and `setup/first-time.mjs`.
- `CLAUDE_AI_TOKEN`, `CLAUDE_ACCESS_TOKEN` — `claude.ai` web-session credentials (alternative to API key); checked by `setup/first-time.mjs`.
- `ENABLE_TOOL_SEARCH` — Claude Code Tool Search toggle; recorded by `tiers/t1-env.mjs`. Project default ON in `settings.json`.

Harness/launcher-set (do not set manually):

- `CLAUDE_HOOK_EVENT` — JSON payload from the Claude Code hook system; read by every `*-cli.mjs` in `src/hooks/`. Malformed JSON is tolerated (warning to stderr, then `{}` default).
- `VEIN_LAUNCHED=1`, `VEIN_PROJECT=<name>`, `VEIN_LAUNCH_ROOT=<path>` — set by `bin/vein.ps1`; the hooks + setup tools use these to scope log file locations and detect launch context.
- `WSL_DISTRO_NAME` — set by WSL itself; `setup/index.mjs` detects WSL by its presence.

## Code Conventions

- ESM only (`type: "module"`, `.mjs` extensions)
- Biome for lint + format (no ESLint/Prettier)
- Vitest for tests (80% coverage threshold)
- No default exports — named exports only
- Errors: throw with context, never swallow silently

## Git Bash / MSYS — Two-Shell Model

Two distinct bash environments live on this Windows host:

1. **Claude Code's Bash-tool subprocess** — harness injects `MSYS_NO_PATHCONV=1` + `MSYS2_ARG_CONV_EXCL=*` (path conversion OFF, broadly).
2. **Operator's interactive mintty/wezterm shell** — no harness injection (path conversion ON).

Symptoms reproducible in shell 1 may not reproduce in shell 2 and vice-versa. **Always state which shell a defect was observed in.**

In Claude Code Bash tool calls (shell 1):
- Use `cmd /c '<command>'` (single slash). NEVER `cmd //c` — that's the conversion-ON escape and falls into cmd's interactive prompt under our hardening.
- Native-exe FILE-PATH args (`findstr /pat /tmp/foo`, `where /c/Users/...`) get the literal POSIX string and fail. Use `cygpath -w` to convert, or run the file-path-bearing command in PowerShell.
- `findstr` and `tasklist | findstr` stdin pipes DO work in current git-for-windows (despite older upstream MSYS2 issues claiming otherwise).

Before trusting any "port empty / process not found" result, run `node tools/instrument-check.mjs <port|proc> <target>` — it compares findstr vs grep and adds an independent http witness to catch broken-instrument traps. Full background: `docs/superpowers/specs/scans/msys-rootcause-synthesis-2026-05-28.md`.
