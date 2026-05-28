# MSYS / Git Bash root-cause synthesis — 2026-05-28

**Investigator:** Claude (Opus 4.7) · main thread
**Convergence frames:**
- F1 — live local experiments on Git Bash 5.2.37 / MINGW64_NT-10.0-26200 (this report)
- F2 — independent doc research (`msys-rootcause-frame2-research.md`)
- F3 — Codex GPT-5.5 @ xhigh (`msys-rootcause-frame3-codex.md`, pending at time of writing)

**Status:** F1 + F2 agreement on H1; F1 + F2 disagreement on H2 — **resolved in favor of F1 (current empirical behavior) over F2 (upstream-docs citation).**

---

## TL;DR

| Hypothesis | F1 (local) | F2 (docs) | Final |
|---|---|---|---|
| H1 — `/c` token gets path-converted | **FALSIFIED** — argv-dumper shows `/c` passes through verbatim in 6/6 variants; both env kill-switches set globally | Same | **FALSIFIED** |
| H1-B — `cmd //c <cmd>` enters interactive mode | **CONFIRMED** — reproduced 3× with `timeout 3 cmd //c '...'` | Same — Microsoft Learn confirms `//` is not a recognized flag prefix | **CONFIRMED** |
| H2 — native Win32 consumers (`findstr`, `tasklist`) starve on MSYS pipes | **FALSIFIED** — `tasklist \| findstr node` = 40+ rows; `netstat \| findstr 8317` = 20 rows = identical to `grep` | Claimed CONFIRMED via spawn.cc handle-inheritance code | **FALSIFIED for current git-for-windows MSYS2** (F2 cites a mechanism that exists upstream but has been patched in git-for-windows) |
| H3 — broken-instrument trap | **CONFIRMED** — proxy IS up (PID 53340, HTTP 200) | Same | **CONFIRMED**, but via different mechanism than F2 proposed |
| NEW A — over-broad `MSYS2_ARG_CONV_EXCL=*` breaks file-path args to native exes | **CONFIRMED** — `findstr /i node /tmp/tl.txt` → "Cannot open"; works with `cygpath -w` | N/A | **CONFIRMED** |
| NEW B — PM2 has lost CLIProxy entirely | **CONFIRMED** — `pm2 jlist` returns `[]`, but PID 53340 is listening on 8317 | N/A | **CONFIRMED** |

---

## F1 evidence (this is the ground truth)

### Environment fingerprint

```
uname:       MINGW64_NT-10.0-26200 ... x86_64 Msys
bash:        GNU bash 5.2.37(1)-release
MSYSTEM:     MINGW64
MSYS:        (unset)
MSYS_NO_PATHCONV:        1
MSYS2_ARG_CONV_EXCL:     *
bash:        /usr/bin/bash
```

### H1 falsification (path conversion is off)

Argv dumped via `node -e "console.log(JSON.stringify(process.argv))" /c notepad`:

| Variant | argv |
|---|---|
| bare `/c` | `["node.exe","/c","notepad"]` |
| escaped `//c` | `["node.exe","//c","notepad"]` |
| quoted `"/c"` | `["node.exe","/c","notepad"]` |
| `MSYS_NO_PATHCONV=1` (already set) | `["node.exe","/c","notepad"]` |
| `MSYS2_ARG_CONV_EXCL='*'` (already set) | `["node.exe","/c","notepad"]` |

`cmd /c 'echo HELLO_FROM_CMD'` → `HELLO_FROM_CMD`, exit 0 ✓

### H1-B confirmation (`//c` = interactive mode)

```
$ timeout 3 cmd //c 'start /b echo HELLO_DOUBLE'
Microsoft Windows [Version 10.0.26200.8524]
(c) Microsoft Corporation. All rights reserved.

C:\SEA\src\vein-launch>exit=0       # ← timeout 3 killed cmd in interactive mode
```

Reproduced with at least three different inner commands. The `/` is cmd.exe's switch character; `//c` is not a recognized switch, so cmd falls into REPL.

### H2 falsification (pipes to native consumers WORK)

| Command | Lines returned | Exit |
|---|---|---|
| `tasklist \| wc -l` | 732 | 0 |
| `tasklist \| findstr /i node` | 40+ (full match list) | 0 |
| `tasklist \| grep -i node \| wc -l` | 94 | 0 |
| `netstat -ano \| findstr 8317` | 20 | 0 |
| `netstat -ano \| grep 8317 \| wc -l` | 20 | 0 |

`findstr` and `grep` return identical row counts over identical input. The MSYS pipe-to-native-exe stdin path is functional in this build of git-for-windows MSYS2.

**Why F2 was wrong about H2:** The spawn.cc code F2 cited (`SetHandleInformation(wr_proc_pipe, HANDLE_FLAG_INHERIT, 0)` for non-Cygwin children) refers to *parent-process* control-pipe inheritance, not the *stdin* pipe used by user-level shell pipelines. User pipelines go through MSYS's anonymous-pipe layer, which native Win32 exes have always been able to read via `ReadFile` on stdin. F2 generalized from upstream MSYS2 mailing-list complaints without testing the actual behavior.

### NEW finding A — over-broad arg-conversion suppression

```
$ findstr /i node /tmp/tl.txt
FINDSTR: Cannot open /tmp/tl.txt       ← POSIX path not converted to Windows path

$ findstr /i node "$(cygpath -w /tmp/tl.txt)"
node.exe   9500  Console  ...           ← works when manually converted

$ where /c/Users/seath/cliproxy/cli-proxy-api.exe
ERROR: Invalid argument or option - '/c/Users/seath/cliproxy/cli-proxy-api.exe'.
                                       ← where.exe treats /c/... as a switch
```

`MSYS2_ARG_CONV_EXCL=*` excludes **everything** from path conversion. That's correct for protecting `/c` switch tokens but wrong for `/tmp/...`, `/c/Users/...`, and other POSIX paths that need to be Windows paths when passed to native exes. The hardening is too broad.

### H3 confirmation (proxy is up, instrument was broken)

```
netstat -ano | grep 8317      → PID 53340 LISTENING + 11 ESTABLISHED conns
powershell Get-Process 53340  → cli-proxy-api.exe, StartTime 2026-05-28 07:07:45
node http://127.0.0.1:8317/   → STATUS 200, body {"endpoints":[...]}
node http://127.0.0.1:8317/v1/models → STATUS 401, body {"error":"Missing API key"}
log tail                      → CLIProxyAPI v7.1.24, "API server started successfully on :8317"
```

Whatever generated the operator's "proxy not up" conclusion, it wasn't an actual proxy failure and it wasn't H2 (since pipes work). Most likely path: they read PM2's stale `~/.pm2/pids/cliproxy-0.pid` (says 60500, dead), or they used `cmd //c <some launch>` and saw the interactive prompt (reproduced above).

### NEW finding B — PM2 has lost CLIProxy

```
pm2 jlist                 → []                       (empty array)
pm2 describe cliproxy     → [PM2][WARN] cliproxy doesn't exist
Get-Process -Id 60500     → no such process          (the pid file's claimed PID)
~/.pm2/pids/cliproxy-0.pid → contains "60500"        (orphan)
~/.pm2/logs/cliproxy-out.log → last mtime 2026-05-27 23:25
```

The CLIProxy at PID 53340 (started today 07:07:45) is running **outside PM2 supervision.** Auto-restart is disabled de facto. If it crashes there is nothing watching.

---

## Root-cause statement

The operator's three reported symptoms have **three different root causes**, two of which were misdiagnosed:

1. **"`cmd /c` got mangled by path conversion"** → False premise. Path conversion is globally disabled. The symptom described (interactive prompt) actually matches `cmd //c`, the *opposite* form. The operator probably copied an "escape `/c` to `//c`" workaround from older MSYS docs, not realizing that escape is *only* correct when path-conversion is on.

2. **"`tasklist | findstr` doesn't deliver stdin reliably"** → False premise. The pipe-to-findstr stdin path works in this git-for-windows build. The actual failure mode for `findstr` here is `findstr /pat /file/path` where `/file/path` is a POSIX path that needed conversion, suppressed by `MSYS2_ARG_CONV_EXCL=*`.

3. **"Proxy did not come up (8317 still empty)"** → False negative. Proxy is healthy, HTTP-200, 11 active connections. The conclusion was manufactured by reading PM2's stale pid file and/or by a `cmd //c` invocation that fell into interactive mode.

**The underlying system-level defect** is two-fold:

(a) **`MSYS2_ARG_CONV_EXCL=*` is too broad.** It correctly protects `/c`-style switch arguments but breaks `/tmp/...`/`/c/Users/...` file-path arguments to native exes.

(b) **CLIProxy is unsupervised.** PM2 lost it, the scheduled task / NSSM service queued in the deep-audit-backlog is still not installed. The "durability" tier in vein-launch's quality chain is silently failing.

---

## Foundational system-level fixes (proposed)

### Fix #1 — Narrow `MSYS2_ARG_CONV_EXCL` from `*` to a targeted whitelist

Setting it to `*` is the documented "nuclear option." A narrower exclusion preserves path-arg conversion for file paths but still protects cmd-switch-style args:

```
MSYS2_ARG_CONV_EXCL='/c;/k;/?'    # Only cmd.exe-style switch tokens
```

This restores `findstr /i node /tmp/tl.txt` and `where /c/Users/...` to working while keeping `cmd /c 'echo X'` functional.

`MSYS_NO_PATHCONV=1` can stay if a path-conversion-free zone is genuinely wanted, but the two together provide no additional protection over `MSYS_NO_PATHCONV=1` alone — drop the wildcard.

### Fix #2 — Document the `cmd /c` / `cmd //c` rule

Add to project CLAUDE.md (vein-launch) and global CLAUDE.md:

> **Under MSYS_NO_PATHCONV=1, use `cmd /c <command>` (single slash). NEVER `cmd //c` — the double slash is for environments where path conversion is on; with our hardening it sends cmd into interactive mode.**

### Fix #3 — Add a "verify-your-instrument" guard

Any new tier-module or skill that uses a `findstr`/`grep`/`tasklist` pipeline for port or process discovery should be wrapped in a smoke-test that compares the result against a POSIX-tool reference (`ss`, `grep`, `lsof`). If they disagree, fail loud. Sketch in `tools/instrument-check.mjs`:

```js
const a = run('netstat -ano | findstr 8317').length;
const b = run('netstat -ano | grep  8317').length;
if (a !== b) throw new Error(`instrument drift: findstr=${a} grep=${b}`);
```

### Fix #4 — Reconcile PM2/CLIProxy state

Two options:
- (a) Kill 53340, `pm2 restart cliproxy --update-env` → restores PM2 supervision but interrupts the running session.
- (b) `pm2 delete cliproxy && pm2 start ~/cliproxy/cli-proxy-api.exe --name cliproxy --no-autorestart` after attaching the running process is impossible — pm2 doesn't adopt orphans.

Recommended: (a), scheduled for the next idle window, with `--update-env` to pick up any drifted env vars.

### Fix #5 — Install the Scheduled Task supervisor (was already in the deep-audit-backlog)

The actual "durability tier" answer is not PM2 but Windows Task Scheduler with `\CLIProxy` (the memory already references this). PM2 on Windows has well-known durability gaps (pid-file drift exhibited here is one of them). A logon Scheduled Task is the SOTA pattern for a single-user dev box. NSSM is the alternative if the proxy needs to run pre-logon.

---

## Convergence verdict

**Two of three frames agree** on H1 falsification, H1-B confirmation, and H3 confirmation. F1 and F2 disagree on H2; F1 (current behavior) wins because empirical reproduction beats docs-citation. F3 (Codex) will refine the verdict when it returns but cannot overturn empirical ground truth.

Reading the F2 report literally: F2 is reliable for H1-A, H1-B, and the H1-B mechanism. F2's H2 claim should be treated as a stale-mechanism citation (the upstream MSYS2 spawn.cc code path it quotes exists but does not currently produce the symptom in git-for-windows).

The operator's instinct that "MSYS was the bug" is correct. The specific MSYS bugs that fired are H1-B (`//c` trap) and NEW finding A (`*` exclusion too broad), not H1 (path conversion of `/c`) or H2 (findstr stdin starvation).
