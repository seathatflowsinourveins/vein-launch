# Hook Ordering Matrix

## Pre-Launch (vein-launch owns these)

| Order | Hook | Owner | Purpose |
|-------|------|-------|---------|
| 1 | T0-T6 tier checks | vein-launch | Environment health |
| 2 | RTK init verification | vein-launch | Token compression ready |
| 3 | CLIProxy health check | vein-launch | Proxy routing confirmed |
| 4 | Env var injection | vein-launch | ANTHROPIC_BASE_URL, SUBAGENT_MODEL, etc. |

## Runtime (Claude Code owns these — vein-launch configures, doesn't execute)

| Order | Event | Handler | Purpose |
|-------|-------|---------|---------|
| 1 | SessionStart | src/hooks/session-start.mjs | Cross-session context restore (ruflo) |
| 2 | PreToolUse | RTK native hook | Token compression (63 commands) |
| 3 | PreToolUse | block-dangerous.py | Security enforcement |
| 4 | PostToolUse | context-mode plugin | Output sandboxing |
| 5 | Stop | src/hooks/stop-handler.mjs | GPT-5.5 Codex review gate |
| 6 | TeammateIdle | src/hooks/teammate-idle.mjs | Run tests + exit 2 on failure |
| 7 | PreCompact | context-mode plugin | Knowledge base preservation |

## Conflict Resolution Rules

1. **RTK before block-dangerous.py** — On Unix/WSL, RTK's PreToolUse hook rewrites commands; block-dangerous validates the rewritten form. **On native Windows, RTK uses CLAUDE.md injection mode** (no hook — Claude calls `rtk <cmd>` explicitly via instructions)
2. **context-mode owns PreCompact** — never wire custom PreCompact hooks
3. **stop-handler is async** — Codex review doesn't block the next prompt
4. **TeammateIdle is sync** — exit 2 forces the teammate to fix failures before claiming next task
5. **SessionStart fires once** — idempotent; safe to re-enter without side effects

## What vein-launch DOES NOT touch

- PermissionRequest (Claude Code internal)
- SubagentStart/Stop (Claude Code manages these)
- FileChanged/CwdChanged (IDE integration events)
