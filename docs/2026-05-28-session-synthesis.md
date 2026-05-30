# vein-launch — Session Synthesis (2026-05-28)

> Comprehensive synthesis of a single deep-dive session: MSYS/Windows shell root-cause
> investigation → proxy reality check → 7 verified code fixes → two convergence-driven
> hidden-error hunts → a full PowerShell/shell-escaping deep-dive.
> Methodology: multi-frame convergence (empirical + documentation + **GPT-5.5/Codex**) on every claim.

---

## 0. TL;DR

- The original symptom ("Claude Code / the proxy won't run") was a **stack of broken *tooling*, not a broken system**. The CLIProxy was healthy and serving the entire time.
- **3 distinct MSYS/Windows shell defects** were root-caused; 2 reported ones were **refuted** by empirical reproduction.
- **7 code fixes** shipped to `vein-launch`, each Biome-clean and gated by the full **662-test** suite; every one cross-checked by Codex GPT-5.5.
- A **PowerShell/shell-escaping deep-dive** eliminated all dynamic-value interpolation across shell boundaries on executable paths.
- Convergence earned its cost repeatedly: it **refuted two of my own hypotheses** and **caught a plausible-but-wrong fix** before it shipped.

**Commit range:** `244dca3` (pre-session) → 7 fix commits (19 ahead of `origin/main`).

---

## 1. Environment (verified, not assumed)

| Fact | Value |
|------|-------|
| Shell behind the "Bash tool" | Git Bash — `MINGW64_NT`, MSYS runtime, `bash 5.2.37`, **no pty** |
| Path-conversion vars | `MSYS_NO_PATHCONV` / `MSYS2_ARG_CONV_EXCL` / `MSYS` all **unset** (conversion ON) |
| `cygpath -w /c` → `C:\` · `/k` → `K:\` · `/x` → `X:\` | single-letter `/X` maps to drive root |
| `claude` | native exe `C:\Users\seath\.local\bin\claude.exe`, **v2.1.153** (not an npm `.cmd` shim) |
| `pwsh` | 7.6.2 (`$PSNativeCommandArgumentPassing` defaults to `Standard`) |
| CLIProxy | `cli-proxy-api.exe` (CLIProxyAPI **v7.1.24**) at `C:\Users\seath\cliproxy\`, PID 53340, port **8317** |

---

## 2. Part 1 — MSYS / Windows shell root-cause investigation

### H1 — `cmd /c` path mangling — **CONFIRMED** ✅ (3 frames)
**Mechanism:** MSYS runs POSIX→Windows *argument conversion* when an MSYS process spawns a native exe. A bare `/c` token matches the absolute-path heuristic and is rewritten to the `C:\` drive root *before* `cmd.exe` parses its command line, so `cmd` never receives its `/c` switch and drops to an interactive prompt.

**Empirical proof:**
```
cmd /c echo MARKER          → prints the cmd banner + interactive "C:\Users\seath>"; MARKER never prints
cmd //c echo … /c /k /x     → "MARKER_OK args: C:/ K:/ X:/"   (//c protects the switch; trailing args STILL convert)
MSYS_NO_PATHCONV=1 cmd /c …  → literal /c /k /x
MSYS2_ARG_CONV_EXCL='*' …    → literal /c /k /x
```
**Nuance:** `//c` fixes only the *switch* — every other `/x`-shaped arg still converts. So `start /b` would mangle `/b`.
**Fix / rule:** never launch via `cmd /c` from MSYS — exec the `.exe` directly, or set `MSYS_NO_PATHCONV=1`, or use `powershell.exe -Command`.
**Convergence:** my reproduction + MSYS2 "Filename conversion" wiki + Codex GPT-5.5 → all AGREE.

### H2 — `tasklist | findstr` "doesn't deliver stdin" — **REFUTED in context** ❌
Empirically `tasklist | findstr` and `netstat | findstr` worked **5/5**, identical to `grep`. The documented failure is **mintty-pseudo-terminal-specific** (native console apps' streams bridged via pipes, `isatty()` misreports). The Claude Code Bash tool has **no pty** (plain OS pipes), so native `findstr` reads stdin exactly as under `cmd.exe`. → The "port 8317 empty" reading was almost certainly **not** a findstr artifact; the launch had failed via H1, so the port genuinely was empty at that moment.

### `git -C /c/...` — **REFUTED** ❌
`git -C /c/Users/seath rev-parse` returns the *same* result in MSYS bash **and** PowerShell (`not a git repository`, i.e. the chdir succeeded). Git for Windows embeds its own MSYS2 runtime and **self-translates** cygdrive paths regardless of the launching shell — unlike `cmd.exe`. So `git -C` is not broken; the real failure was a non-repo dir or a non-bash execution context.

### context-mode shim — bash, not PowerShell
`ctx_execute`/`ctx_batch_execute` run through **bash**, so PowerShell syntax (`if (Test-Path …)`) throws. Fix: use bash syntax there, or call `powershell.exe -Command` explicitly.

### Meta-lesson — the broken-instrument trap
Three independent **layers** were conflated into one phantom bug:
1. **System under test** — the proxy: healthy, serving on 8317.
2. **Launch tooling** — `cmd /c start` via MSYS: broken (H1).
3. **Inspection/management tooling** — `findstr` (falsely accused), `pm2` (genuinely broken — EPERM).
> **Rule: validate the instrument before trusting its measurement.**

---

## 3. Part 2 — The proxy reality

`netstat` showed `:8317 LISTENING` (PID 53340) with ~11 live `ESTABLISHED` connections. The listener's **parent process** was the Claude Code Bash tool's own wrapper running `eval 'cd /c/Users/seath/cliproxy && ./cli-proxy-api.exe' < /dev/null` at **07:07:45 2026-05-28** — i.e. a prior Claude session launched it **directly** (the exact "launch the binary directly" approach), and it had been serving ever since.

**PM2 is orphaned (separate, real):** `pm2 status` → `connect EPERM \\.\pipe\rpc.sock`; the tracked pid (`60500`) is **stale** (not running) ≠ the live listener (53340); current shell `Elevated=False`. Classic **integrity-level mismatch** — a non-elevated `pm2` CLI cannot reach a daemon (or stale pipe ACL) owned at higher integrity. The proxy does not depend on PM2; vein-launch's roadmap already pivoted to Docker-default for CLIProxy.

---

## 4. Part 3 — Code fixes shipped (7 commits, all 662-test-green + Biome-clean)

| Commit | Scope | What & why |
|--------|-------|-----------|
| `4716783` | `src/lib/exec.mjs` | Launch `claude` via direct `spawnSync(claude.exe, args, {shell:false})` instead of `execSync` shell-string. Smoke-validated (status 0, prints 2.1.153). H1-immune. |
| `9f1687a` | `src/tiers/t2-cliproxy.mjs` | On process-manager not-ok, probe `/healthz` before declaring down → report "live but unmanaged" (WARN) instead of telling the user to start an already-serving proxy. +3 tests. |
| `fe9ec35` | `cli.mjs`, `promptfooconfig.yaml`, `eval_gate.mjs` | **BLOCKER:** `--eval-mode` exited 0 in `cli.mjs` before `orchestrate()`, and the promptfoo provider pointed at `orchestrator.mjs` (no main guard) → the whole behavioral gate emitted nothing / passed vacuously. Route through `cli.mjs`; fail closed in `eval_gate` on any non-ENOENT config/import error. |
| `0bc5001` | `src/tiers/t4-github.mjs` | `repair()` ignored `gh auth refresh` result and always returned PASS → now BLOCKs with stderr on failure. +1 test. |
| `a343846` | `src/setup/first-time.mjs`, `src/lib/shell.mjs` | Eliminate PowerShell injection: pass `repoRoot`/API key via process env read as `$env:VEIN_SETUP_VALUE`; added an `env` passthrough to `shell.mjs`. |
| `85f0001` | `src/cliproxy/accounts.mjs`, `src/lib/persist.mjs` | Guard unguarded `JSON.parse` (a corrupt `accounts.json`/run-file crashed the CLI); atomic temp-then-rename write; random suffix on run filenames to avoid same-ms collisions. +1 test. |
| `34d7f0a` | `src/setup/doctor.mjs`, `bin/vein.ps1` | Move doctor's `node -e` healthz + runs-dir probes **in-process** (`fetch`/`fs`), removing cmd-layer interpolation; harden `vein.ps1` (`$PSNativeCommandArgumentPassing='Standard'` + `-LiteralPath`). Mock updates. |

**Codex GPT-5.5 ship-gate** over the first 5: **APPROVE, zero BLOCKERs** (explicitly verified the `env: undefined` inheritance and the `--eval-mode` routing).

---

## 5. Part 4 — Hidden-error hunts (convergence methodology)

Two convergence waves, each = independent **Codex GPT-5.5** frame + independent **Sonnet** frame, triaged/verified by the main thread against source.

- **Wave A (app logic):** surfaced the `--eval-mode` BLOCKER (Codex-only — Sonnet missed it), the `t4` silent failure (**both frames** → high confidence), docker `~`, the injection cluster, `runner` timing, `orchestrator` no-ops, `t6` cwd, `parallel` separators, `hud-bridge` validation, `t5-drift`, `schema↔team`.
- **Wave B (IO/system):** `accounts`/`persist` `JSON.parse` crashes + non-atomic write, `config` throw/silent-resolve, filename collision, a second `first-time` PS site.

Full prioritized backlog persisted at `~/.claude/projects/C--Users-seath/memory/deep-audit-backlog.md`.

---

## 6. Part 5 — PowerShell / shell-escaping deep-dive (converged)

| Site | Risk | Resolution |
|------|------|-----------|
| `first-time.mjs:117/:181` | value → PS `-Command` string | ✅ env passthrough (`$env:`) — value never enters cmd or PS parser |
| `doctor.mjs:219` (HIGH) | `CLIPROXY_PORT` → `node -e` via cmd | ✅ in-process `fetch()` |
| `doctor.mjs:169` (MED) | runs-dir path → `node -e` via cmd | ✅ in-process `readdir`/`readFile` |
| `bin/vein.ps1` | `& node @nodeArgs` | ✅ already splatting; hardened with `Standard` + `-LiteralPath` |
| `bin/vein.cmd:2` | `%*` cmd→pwsh | ⚠️ deferred — conventional cmd-shim, edge-risk only |
| `rtk.mjs`/`mise-init.mjs` | static `powershell -c` | ✅ safe (no variable interpolation) |

**SOTA escaping tiers (strongest first):** (1) **no command string** — `fetch`/`fs` in-process; (2) **value via env/stdin** read as `$env:X`; (3) `-EncodedCommand` (base64 UTF-16LE); (4) per-layer escaping (last resort). The first two covered every site — `-EncodedCommand` was never needed because nothing builds a PS *script* from dynamic data. **Net: zero dynamic-value shell-string interpolation on executable paths.**

**Key insight:** the most dangerous sites weren't PowerShell at all — they were `node -e` through `cmd.exe`. Codex's reframing of "PowerShell escaping" → "any dynamic value crossing a shell-command boundary" is what found them (a keyword grep missed them).

---

## 7. Part 6 — Remaining backlog (open)

| Severity | Item | Effort |
|----------|------|--------|
| HIGH | `docker.mjs` `~` non-expansion under `wsl` | refactor to `execArgs`/`sh -lc` + rewrite 6 pinned `docker.test` assertions |
| HIGH | `behavioral_eval.mjs:184` configPath injection | `.cmd`-aware `execArgs` (raw `execFileAsync("npx",…)` `EINVAL`s on Windows) |
| MED | `runner.mjs:91` timeout timer not cleared / no cancellation | thread `AbortSignal` through tier signatures |
| MED | `runner.mjs:69` repair-time double-count (repair mode only) | delete redundant line |
| MED | `orchestrator.mjs:111` `--setup/--projects/--accounts` silent no-op | wire each or return explicit unsupported error (needs feature decisions) |
| MED | `t6-codegraph.mjs` runs in cwd not `config.projectDir` | pass `{cwd}` |
| MED | `parallel.mjs` `sanitizeForShell` strips backslashes | `execArgs("wt", …)` |
| MED | `hud-bridge.mjs` port/interval unvalidated | validate finite int / min interval |
| MED | `t5-drift.mjs` pinned non-npx servers silently skipped | WARN instead of decrement |
| MED | `config/schema.json` ↔ `team.mjs` field mismatch (`team`/`members` vs `teamName`/`teammates`) | align + tests |
| LOW | `bin/vein.cmd` `%*`; `runner` timeout message; `t4` unused test const | — |
| Deferred | `instrument-check.mjs` (untracked WIP); `shell.mjs` DEP0190 (`shell:true`+args) | — |

---

## 8. Part 7 — Convergence discipline: where it paid off

| Moment | Single-pass would have… | Convergence caught it |
|--------|------------------------|----------------------|
| `.cmd` vs `.exe` launch hypothesis | "fix" assuming `claude.cmd` | empirical check: `claude` is a native `.exe` → my hypothesis **refuted** |
| Sonnet's `MSYS_NO_PATHCONV` fix for `shell.mjs` | shipped a **no-op** (MSYS runtime never runs for Node→cmd.exe) | rejected after reasoning + Codex agreement |
| Sonnet's `runner.mjs` "50% inflation on successful tiers" | over-prioritized | reading the `isRepair` gate → repair-mode-only, downgraded HIGH→MED |
| `--eval-mode` BLOCKER | missed (Sonnet didn't find it) | **Codex GPT-5.5 found it** by tracing CLI→orchestrator control flow |
| "PowerShell escaping" scope | grep missed `node -e` sites | Codex reframed the class → found `doctor.mjs` |

**Cost note:** multi-agent ≈15× single-chat tokens; paid deliberately only for genuinely parallel/independent work and for adjudicating contradictions. Every committed fix was verified against the live test suite, not trusted on a hunter's report.

---

## 9. Appendix — verification commands that mattered

```bash
# H1 mechanism
cygpath -w /c            # → C:\
cmd /c echo MARKER       # → interactive banner, no MARKER (switch mangled)

# Proxy reality
netstat -ano | grep ':8317'                 # LISTENING 53340 + 11 ESTABLISHED
# parent of 53340 = Claude Bash tool eval './cli-proxy-api.exe' @ 07:07:45

# Launch-fix smoke
node -e "spawnSync('claude.exe',['--version'],{shell:false})"   # status 0, "2.1.153 (Claude Code)"

# vein.ps1 smoke (pwsh 7.6.2)
pwsh -NoProfile -File bin/vein.ps1 --version   # "vein-launch v1.3.1", exit 0

# Gate (every commit)
npx vitest run    # 42 files, 662 tests pass ; biome check clean
```

---
*Synthesis generated 2026-05-28. Fixes on branch `main` (`244dca3`..`34d7f0a`). Backlog: `~/.claude/projects/C--Users-seath/memory/deep-audit-backlog.md`.*
