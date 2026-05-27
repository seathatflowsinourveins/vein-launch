---
name: status
description: Show current vein-launch environment health. Use when asked about tier status, precheck results, or environment health.
user-invocable: true
allowed-tools:
  - "Bash(node *)"
  - "Read"
---

# /status — Environment Health

Run `node src/orchestrator.mjs --status` to display the current health of all 7 tiers without launching Claude.
