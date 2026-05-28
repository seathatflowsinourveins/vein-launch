# MSYS / Git Bash foundational fixes — proposed patch set

**Synthesis source:** `msys-rootcause-synthesis-2026-05-28.md`
**Scope:** what to change at the system level so the same class of bug cannot recur.

This document is a **patch proposal**, not an applied change. Items marked `APPLIED` were safe additive edits done in this investigation; items marked `PROPOSED` mutate shared state and need operator approval.

---

## The two-shell model (mental model the rest of this rests on)

There are **two distinct Git Bash environments** on this machine:

1. **Claude Code's Bash-tool subprocess** — spawned by the CC harness. The harness *injects* `MSYS_NO_PATHCONV=1` and `MSYS2_ARG_CONV_EXCL=*` to protect its own argv from MSYS path mangling. This is the env you see when CC runs a `Bash` tool call.
2. **The operator's interactive shell** — launched directly from a terminal (mintty / Windows Terminal / wezterm). The harness env vars are NOT inherited here. MSYS path conversion is active by default.

Symptoms diagnosed in one shell are not always reproducible in the other. The original operator complaint ("`/c` got mangled") was a genuine shell-1 behavior that I couldn't reproduce because I was running in shell-2. **Both shells have separate fixes.**

```
Claude Code (Opus)
        │
        │ spawns Bash tool subprocess with:
        │   MSYS_NO_PATHCONV=1, MSYS2_ARG_CONV_EXCL=*
        ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│  Shell 1: CC Bash tool  │        │  Shell 2: interactive   │
│  conversion: OFF (broad) │        │  conversion: ON         │
│  /c works, /tmp/foo     │        │  /c gets mangled,       │
│    breaks               │        │  /tmp/foo works         │
└─────────────────────────┘        └─────────────────────────┘
```

---

## APPLIED — safe additive fixes (done in this session)

### A1. Synthesis report
- `docs/superpowers/specs/scans/msys-rootcause-synthesis-2026-05-28.md`
- Frame-by-frame evidence + convergence verdict.

### A2. Instrument-check tool
- `tools/instrument-check.mjs`
- Compares findstr-pipe and grep-pipe output for the same query; flags `BROKEN_INSTRUMENT` if they disagree. Use this before trusting any "port empty / process not found" result.
- Usage: `node tools/instrument-check.mjs port 8317` or `... proc node`.
- Adds a Node http witness for ports, so even if both findstr+grep are wrong you have a third source.

### A3. CLAUDE.md addendum
- Both global and project CLAUDE.md get a short "Two-shell model" callout pointing at this synthesis.

---

## PROPOSED — needs operator approval

### P1. Targeted exclusion in operator's `~/.bashrc`

Current state: operator's `~/.bashrc` has **no** MSYS env vars. MSYS path conversion is fully active. That's why `cmd /c <complex>` can mangle.

Proposed patch (append to `~/.bashrc`):

```bash
# MSYS argv-conversion: protect cmd.exe-style switches, leave file-path args alone.
# Without this, `cmd /c <command>` can have its `/c` rewritten to a Windows path
# (e.g. C:/Program Files/Git/c) and cmd falls into interactive mode.
# Do NOT use MSYS2_ARG_CONV_EXCL='*' — that's too broad and breaks
# findstr/where/tasklist file-path arguments.
export MSYS2_ARG_CONV_EXCL='/c;/k;/?'
```

**Rationale:** narrowly excludes the three cmd.exe-style switches that need protection, without breaking POSIX-path args to native exes (which the `*` wildcard would). Equivalent to `MSYS_NO_PATHCONV=1 + MSYS2_ARG_CONV_EXCL=*` for the symptom-causing case but doesn't introduce the side-effect we proved breaks `findstr /pat /tmp/foo` and `where /c/Users/...`.

**Risk:** low — only affects argv handling for native-exe spawns; reversible.

### P2. Project-scoped harness env override (optional)

If even within Claude Code's Bash tool you want narrower exclusion (so `findstr /pat /tmp/foo` works inside batches), add to `C:\SEA\src\vein-launch\.claude\settings.json`:

```json
{
  "env": {
    "MSYS2_ARG_CONV_EXCL": "/c;/k;/?"
  }
}
```

**Status: unverified.** The CC harness may set its env *after* reading settings.json, in which case this override is ignored. Test with a project-scoped fingerprint check before relying on it.

**Risk:** low — strictly narrows; reverts to default `*` if removed.

### P3. CLIProxy durability (the real long-term fix)

PM2 has lost CLIProxy entirely:

```
pm2 jlist                 → []
pm2 describe cliproxy     → doesn't exist
~/.pm2/pids/cliproxy-0.pid → "60500" (process doesn't exist)
running PID 53340         → outside any supervisor
```

**Critical constraint:** Claude Code routes through `http://localhost:8317` (`settings.json:10 ANTHROPIC_BASE_URL`). Killing PID 53340 from inside a CC session terminates the session. Any reconciliation must run from a non-CC shell.

#### P3-a — Quick reconcile (low durability, fast)

From a *non-CC* PowerShell or interactive bash (NOT a Claude Code Bash tool call):

```powershell
# 1. Stop the orphan
Stop-Process -Id 53340 -Force

# 2. Clean PM2 state
pm2 delete cliproxy 2>$null
pm2 flush

# 3. Restart under PM2 supervision
pm2 start "C:\Users\seath\cliproxy\cli-proxy-api.exe" `
  --name cliproxy `
  -- -config "$HOME\.cli-proxy-api\config.yaml"

# 4. Persist
pm2 save
pm2 startup
```

**Caveat:** `pm2 startup` on Windows is unreliable (the official PM2 plugin uses Windows scheduled tasks but with shaky path handling). The community workaround is `pm2-installer` but that's third-party.

#### P3-b — SOTA: Windows Scheduled Task (recommended)

Replaces PM2 entirely with a logon-triggered Scheduled Task. This was already queued in the deep-audit-backlog. Single source of truth, reboot-durable, no PM2 pid-file drift.

From an elevated PowerShell:

```powershell
$action = New-ScheduledTaskAction `
  -Execute "C:\Users\seath\cliproxy\cli-proxy-api.exe" `
  -Argument "-config `"$HOME\.cli-proxy-api\config.yaml`"" `
  -WorkingDirectory "C:\Users\seath\cliproxy"

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERNAME"

$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Days 365)

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask -TaskName "CLIProxy" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Anthropic gateway proxy on :8317. Owns vein-launch ANTHROPIC_BASE_URL."
```

Then disable the `.bashrc` autostart block (already disabled, "REMOVED 2026-05-26"), kill PID 53340, and reboot — the task picks up at logon. After verifying `instrument-check port 8317` agrees and the http witness returns 200, the durability tier is solved.

**Risk:** medium. Requires admin once. Persistent. Reverse with `Unregister-ScheduledTask -TaskName CLIProxy`.

---

## Memory updates needed

After applying the fixes, update:

- `~/.claude/projects/C--SEA-src-vein-launch/memory/cliproxy-durability.md` (already exists per the latest MEMORY.md update) — add the Scheduled Task confirmation and the H1/H2 falsifications so the next session doesn't re-run the same investigation.
- Add a new memory `msys-two-shell-model.md` documenting the harness/interactive split so the operator doesn't conflate symptoms across them again.

---

## What I am NOT proposing

- **Don't** add `MSYS_NO_PATHCONV=1` to `~/.bashrc`. The wildcard exclusion is the source of the side effects we found; the targeted `MSYS2_ARG_CONV_EXCL='/c;/k;/?'` is sufficient.
- **Don't** modify Claude Code's harness defaults. They're hardcoded for a reason — argv mangling would corrupt CC's own command stream.
- **Don't** add `cmd //c` workarounds anywhere. The double-slash is exactly wrong in the conversion-OFF environment CC uses.
