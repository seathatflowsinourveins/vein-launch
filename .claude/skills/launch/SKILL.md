---
name: launch
description: Run vein-launch prechecks and launch Claude for a project. Use when asked to launch, start, or precheck a project. Do NOT use for status checks only — use /status instead.
argument-hint: "[project] [--deep|--repair]"
user-invocable: true
allowed-tools:
  - "Bash(node *)"
  - "Bash(npx vitest *)"
  - "Read"
---

# /launch — Run Prechecks and Launch

## Overview
Runs the 7-tier precheck pipeline, sets environment variables, and launches Claude with full quality gates.

## When to Use
- User says "launch trading", "start a session", "precheck my project"
- Before any new Claude Code session that needs environment validation

## When NOT to Use
- Quick status check only → use `/status`
- Account management → use `/accounts`
- First-time setup → use `/setup`

## Steps
1. Determine mode from args: fast (default, ≤5s), deep (≤30s), repair (≤60s)
2. Run `node src/orchestrator.mjs <project> --mode=<mode>`
3. Report tier results with severity icons (✓/⚠/✗)
4. If any BLOCK → abort, show remediation for each block
5. If all pass/warn → set env vars (ANTHROPIC_BASE_URL, SUBAGENT_MODEL) and exec claude

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll skip prechecks, it was fine last time" | Environment drifts silently — stale MCP versions, expired auth, broken cache |
| "Fast mode is enough" | Fast mode skips GitHub, drift, and codegraph checks — use deep for PRs |
| "The block is probably a false positive" | Block rules have 0% false positive rate by design — fix the issue |

## Verification
- [ ] All 7 tiers reported (or correctly skipped per mode)
- [ ] No BLOCK severity in output
- [ ] Exit code is 0
- [ ] `ANTHROPIC_BASE_URL` set correctly (if CLIProxy active)
- [ ] Claude session starts and responds to first prompt
