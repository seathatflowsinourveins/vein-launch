# Environment Variable Propagation

## Inheritance Chain

```
System env → User env (~/.bashrc, $PROFILE) → vein defaults (config/default.json)
  → .vein.json env overrides → CLI flags → final env passed to `claude`
```

Later sources override earlier ones. CLI flags always win.

## Managed Variables

| Variable | Set By | Value | Override Allowed |
|----------|--------|-------|-----------------|
| `ANTHROPIC_BASE_URL` | vein T2 (CLIProxy check) | `http://localhost:8317` | Yes, via .vein.json `cliproxy.port` |
| `ENABLE_TOOL_SEARCH` | vein T2 | `true` | No (required when proxied) |
| `CLAUDE_CODE_SUBAGENT_MODEL` | vein | `claude-haiku-4-5` | Yes, via .vein.json `modelRouting.subagents` |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | vein | `1` | No (always enabled) |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | .claude/settings.json | `80` | Yes, via .claude/settings.json env |

## Forbidden Overrides (.vein.json CANNOT set these)

| Variable | Reason |
|----------|--------|
| `ANTHROPIC_API_KEY` | Never in config files; managed by CLIProxy accounts |
| `PATH` | Security: prevents injecting malicious binaries |
| `HOME` / `USERPROFILE` | Prevents redirecting state directories |
| `CLAUDE_CODE_*` internal | Reserved for Claude Code internals (except documented ones) |

## Propagation Rules

1. **CLIProxy active** → set `ANTHROPIC_BASE_URL` to proxy endpoint; set `ENABLE_TOOL_SEARCH=true`
2. **CLIProxy inactive** → do NOT set `ANTHROPIC_BASE_URL` (use Anthropic direct); `ENABLE_TOOL_SEARCH` not needed
3. **Model routing** → only set `CLAUDE_CODE_SUBAGENT_MODEL` if .vein.json specifies it; otherwise inherit system default
4. **Docker services** → do NOT propagate Docker env vars to Claude; they stay in the container stack
5. **.vein.json `env` block** → validated against forbidden list; string values only; applied last before launch
