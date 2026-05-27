# .vein.json Security Model

## Threat Model

`.vein.json` lives in a project repo. Anyone with write access to the repo can modify it. A malicious `.vein.json` should NOT be able to:

### What .vein.json CANNOT Do

| Attack Vector | Defense |
|--------------|---------|
| **Inject arbitrary env vars** | Schema enforces `additionalProperties: { type: "string" }` on `env`; forbidden vars list (ANTHROPIC_API_KEY, PATH, HOME, USERPROFILE) rejected at parse time |
| **Override security hooks** | .vein.json has no `hooks` field; hook config lives in .claude/settings.json which is NOT controlled by .vein.json |
| **Disable quality gates** | `codexReview: "disabled"` is valid but vein logs a prominent warning; CI workflows are independent of .vein.json |
| **Execute arbitrary commands** | .vein.json is pure data (JSON); no `scripts` or `exec` fields; schema uses `additionalProperties: false` at every level |
| **Exfiltrate secrets via proxy** | CLIProxy accounts reference names, not tokens; actual credentials are in ~/.cli-proxy-api/ (not readable via .vein.json) |
| **Override permissions mode** | Permission mode (bypassPermissions vs default) is set by the launcher flag, not by .vein.json |
| **Escalate agent team privileges** | Agent `members` is a name list; actual agent configs live in .claude/agents/ with their own permission scopes |
| **Redirect API traffic** | `cliproxy.hosting` selects Docker or PM2 — does NOT control the endpoint URL; port is limited to 1024-65535 |

### Validation Pipeline

```
.vein.json found → JSON.parse() → ajv.validate(schema.json) → forbidden-env check
  → port range check → account name sanitization → frozen config object
```

1. **Parse**: Strict JSON (no comments, no trailing commas)
2. **Schema**: `additionalProperties: false` at every level — unknown fields rejected
3. **Forbidden env**: Hard-coded deny list, not configurable
4. **Port range**: 1024-65535 only (no privileged ports)
5. **Account names**: Alphanumeric + hyphens only (no path traversal)
6. **Freeze**: Returned config is `Object.freeze()` — no mutation after validation

### Trust Boundary

```
TRUSTED (owned by user, not repo):
  ~/.vein/         ← state directory
  ~/.cli-proxy-api/ ← account credentials
  ~/.claude/        ← global Claude config
  ~/.codex/         ← Codex CLI config

UNTRUSTED (repo-controlled):
  .vein.json        ← per-project config (validated by vein-launch)
  .claude/          ← project Claude config (UNTRUSTED — can define hooks, permissions, agents)
```

**Project `.claude/` is untrusted.** It can define hooks that execute arbitrary commands, grant broad tool permissions, and load agents with `bypassPermissions`. The launcher treats it as attacker-controlled:
- The launcher does NOT read or parse project `.claude/settings.json` — Claude Code handles that sandboxing
- The launcher does NOT modify project `.claude/` — it only configures global `~/.claude/`
- `bypassPermissions` mode is set by the launcher flag, not by anything in the project
- The user's `block-dangerous.py` PreToolUse hook and `permissions.deny` list apply regardless of project `.claude/` settings

### Additional Attack Surfaces

| Surface | Control |
|---------|---------|
| **Supply chain** | CLIProxy image pinned to digest (not `:latest`), GitHub Actions SHA-pinned, Gitleaks + TruffleHog layered |
| **Prompt injection** | Out of scope for vein-launch; Claude Code's own defenses apply at runtime |
| **Credential rotation** | Accounts reference names, not tokens; rotation via `vein --accounts` only |
| **Audit logging** | Session start/stop events logged to `~/.vein/logs/`; immutable append-only |

The launcher NEVER reads credentials from the project directory. All secrets live in the user's home directory, managed by their respective tools.
