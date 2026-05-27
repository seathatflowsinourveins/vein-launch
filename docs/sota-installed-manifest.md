# SOTA Installed Manifest

Single source of truth for every external component that vein-launch depends on or
coordinates. Keep this file updated whenever a tool is upgraded or replaced.

## Installed Components

| Component | Version | Source | Install Command | Purpose |
|-----------|---------|--------|-----------------|---------|
| AO (Agent Orchestrator) | 0.9.2 | github.com/superinit/agent-orchestrator | `npm i -g agent-orchestrator` | Worktree parallel agent orchestrator + dashboard |
| CCW (Claude-Code-Workflow) | 7.3.14 | github.com/ddfourtwo/claude-code-workflow | `git clone` + `scripts/install.sh` | Multi-CLI beat-model workflow framework |
| Codex CLI | 0.134.0 | npmjs.com/package/@openai/codex | `npm i -g @openai/codex` | GPT-5.5 xhigh second-model code review |
| RTK | 0.42.0 | npmjs.com/package/runtime-toolkit | `bun add runtime-toolkit` | Token compression via CLAUDE.md inject mode |
| CLIProxy | 7.1.24 | github.com/router-for-me/CLIProxyAPI | Go binary release | Subscription-account OAuth routing on :8317 |
| GitNexus | 1.6.5 | npm @gitnexus/cli | `npm i -g @gitnexus/cli` | Git context graph for agents |
| PM2 | 7.0.1 | npm pm2 | `npm i -g pm2` | Daemon manager for CLIProxy |

## Verification

Run these one-liners to confirm each component is installed and at the expected version:

| Component | Check Command |
|-----------|---------------|
| AO | `ao --version` |
| CCW | `ccw --version` |
| Codex CLI | `codex --version` |
| RTK | `rtk --version` |
| CLIProxy | `cliproxy --version` |
| GitNexus | `gitnexus --version` |
| PM2 | `pm2 -v` |

## Why These

vein-launch targets a "correct on first try" launch guarantee: every invocation
passes through prechecks before Claude is exec'd. The bundle above covers the full
quality chain — parallel-worktree orchestration (AO), multi-model review (Codex,
CCW), token hygiene (RTK), and reliable OAuth routing (CLIProxy + PM2). GitNexus
closes the loop by wiring repository structure into agent context so the launched
Claude starts with graph-level codebase awareness, not just file reads.
