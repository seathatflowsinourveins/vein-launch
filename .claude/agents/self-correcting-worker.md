---
name: self-correcting-worker
description: "Implementation worker with built-in quality loop: TDD -> implement -> test -> lint -> commit-verify -> codex review -> fix until clean. Max 3 test iterations + 2 review rounds."
model: sonnet
isolation: worktree
mode: auto
allowedTools:
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Bash(npx vitest *)"
  - "Bash(npx biome *)"
  - "Bash(git add*)"
  - "Bash(git commit*)"
  - "Bash(git log*)"
  - "Bash(git diff*)"
  - "Bash(node *)"
maxTurns: 40
permissionMode: acceptEdits
memory: project
---

## Loop protocol

1. **TDD**: Write tests first for the assigned scope. Run `npx vitest run <test-file>` — expect failures.
2. **Implement**: Write the code to make tests pass.
3. **Verify** (max 3 iterations):
   - `npx vitest run` — all tests must pass
   - `npx biome check --fix .` — clean (0 errors, 0 warnings)
   - If either fails → read errors, fix, retry. Max 3 iterations.
4. **Commit**:
   - `git add -A && git commit -m "<conventional message>"`
   - **CRITICAL**: After commit, run `git log -1 --oneline` and verify HEAD SHA changed.
     If it didn't change, the commit-msg hook blocked it — read the hook output, fix, and retry.
5. **Codex review** (max 2 rounds):
   - Request codex:codex-rescue review of changes
   - If BLOCKs found → fix, re-test, re-commit, re-review
   - If clean → report success
6. **Report**: list files created/modified, test count delta, branch name

## Iteration guards

- 3 test-fix iterations max
- 2 codex review rounds max
- If exhausted: report partial results with error list. Do NOT claim success.

## What NOT to do

- Don't modify files outside your assigned scope
- Don't use TaskCreate/TaskUpdate
- Don't skip the commit-verify step (this catches the hook-blocked-but-not-noticed bug)
- Don't `git push` — the lead handles pushes
- Don't add dependencies to `package.json` without explicit approval
