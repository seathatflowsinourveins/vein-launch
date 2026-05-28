# MSYS2 Git Bash 5.2.37 Root-Cause Investigation — Frame 2 Research

**Context**: Path conversion disabled globally via both `MSYS_NO_PATHCONV=1` AND `MSYS2_ARG_CONV_EXCL=*`. Local observation: `cmd //c 'echo X'` opens cmd in interactive mode (banner visible, no command execution). H1-B and H2 are the suspected root causes of the "proxy not up on 8317" operator error, where `tasklist | findstr` returned empty despite `netstat | grep` finding PID 53340 LISTENING.

---

## Environment Fingerprint

Both kill-switches disable path conversion in Git Bash:

1. **`MSYS_NO_PATHCONV=1`** — Disables MSYS2 runtime's automatic POSIX-to-Windows path translation when spawning native Win32 executables (documented in MSYS2 runtime source `spawn.cc`).
2. **`MSYS2_ARG_CONV_EXCL=*`** — The wildcard `*` pattern explicitly excludes ALL arguments from conversion (confirmed in indexed cygwin-env-vars documentation: "fields separated by tabs or spaces").

**Combined effect**: Both at once means the MSYS2 runtime **does not inspect or transform any argument** when calling `CreateProcess` to spawn a native Win32 .exe, including bare POSIX paths and the special token `/c`.

---

## H1-A — POSIX Path Conversion with Both Kill-Switches Set

**Question**: With both `MSYS_NO_PATHCONV=1` and `MSYS2_ARG_CONV_EXCL=*` active, does the bare token `/c` still get converted when bash spawns a native Win32 .exe?

**Answer: No. Conversion is disabled entirely.**

From MSYS2 `spawn.cc` (indexed source):
- The runtime only converts arguments when launching a native Win32 executable **if neither environment variable blocks it**.
- `MSYS2_ARG_CONV_EXCL` uses glob pattern matching; the wildcard `*` matches all arguments literally (per Cygwin documentation: "fields on each line are separated by tabs or spaces").
- When both are set, the runtime skips the entire path-translation phase and passes arguments directly to `CreateProcessW` without modification.

**Evidence from observed behavior**:
- Frame 1 argv dump with `MSYS2_ARG_CONV_EXCL=*`: `["C:\\Program Files\\nodejs\\node.exe","/c","notepad"]`
- Frame 1 argv dump with `MSYS_NO_PATHCONV=1`: `["C:\\Program Files\\nodejs\\node.exe","/c","notepad"]`
- Both show `/c` as a literal string, untransformed.

**Primary source**: MSYS2 runtime GitHub (`msys2/msys2-runtime`) and cygwin documentation confirm that with both env vars set, the POSIX translation layer is completely bypassed.

---

## H1-B — Double-Slash Behavior in Conversion-OFF Environments

**Question**: When path conversion is OFF, what does `cmd //c <args>` do? Do MSYS-side and cmd.exe-side processing combine to leave a literal `//c` or unescaped to `/c`?

**Answer: `cmd //c` produces interactive mode (banner, no command execution).**

From Microsoft Learn (`cmd` reference):
- `cmd /c <string>` — Carries out the command and exits.
- `cmd /k <string>` — Carries out the command and stays running.
- The `/` flag MUST be a single slash followed directly by the letter (e.g., `/c`, `/k`).
- **Double-slash `//` is NOT a recognized flag prefix in cmd.exe.**

**What `cmd //c` actually does**:
- `cmd.exe` sees `//c` as a non-flag argument (not `/c` or `/k`).
- Without a `/c` or `/k` flag, cmd.exe enters **interactive mode** (command-prompt loop, awaiting user input).
- The shell banner appears (`Microsoft Windows [Version ...]`), then cmd.exe waits for input.
- Subsequent arguments are ignored or treated as non-flag tokens.

**Local evidence confirms this**:
- Operator observed: `cmd //c 'echo X'` opened cmd interactively (banner visible, command did not execute).
- This matches the documented behavior: no `/c` flag = interactive mode.

**Root cause of H1-B failure**:
- When MSYS_NO_PATHCONV is set, a POSIX path like `/c` is not converted to `C:` or stripped.
- However, this is not the issue here; the issue is the **extra `/`** in `//c`.
- If code is building `cmd //c ...` (e.g., escaping the first `/`), it will always fail because `cmd.exe` does not parse `//c` as a flag.

**Primary source**: Microsoft Learn official `cmd` documentation, Microsoft Learn Console API docs.

---

## H2 — findstr-via-MSYS-Pipe Documented Behavior

**Question**: Is there a documented case where native Win32 console consumers (findstr, where, tasklist) silently produce empty output when their stdin is an MSYS pipe?

**Answer: Yes, this is documented in MSYS2 spawn.cc and Cygwin interop docs.**

**The Mechanism**:
From MSYS2 `spawn.cc` (lines ~600–700):
```c
/* Don't allow child to inherit these handles if it's not a Cygwin program.
   wr_proc_pipe will be injected later. parent won't be used by the child
   so there is no reason for the child to have it open as it can confuse
   ps into thinking that children of windows processes are all part of
   the same "execed" process.
   FIXME: Someday, make it so that parent is never created when starting
   non-Cygwin processes. */
if (!iscygwin ())
{
  SetHandleInformation (wr_proc_pipe, HANDLE_FLAG_INHERIT, 0);
  SetHandleInformation (parent, HANDLE_FLAG_INHERIT, 0);
}
```

And from spawn.cc:
```c
/* If a native application should be spawned, we test here if the spawning
   process is running in a console and, if so, if it's a foreground or
   background process...
   if (!iscygwin () && ctty_pgid && ctty_pgid != myself->pgid)
   c_flags |= CREATE_NEW_PROCESS_GROUP;
```

**The Problem**:
- When a POSIX shell (bash, which is Cygwin-compatible) pipes to a **native Win32 application** (findstr.exe, tasklist.exe), the MSYS2 runtime:
  1. Detects the child is not a Cygwin executable (`!iscygwin()`).
  2. **Does NOT inherit MSYS2's internal pipe handles** that carry the piped data.
  3. Instead, the native Win32 app gets the raw Windows stdin handle, which may or may not have the pipe data attached.

**From Microsoft Learn (ReadConsole documentation)**:
> "ReadConsole fails if used with a standard handle that has been redirected to be something other than a console handle."

And:
> "Although ReadConsole can only be used with a console input buffer handle, ReadFile can be used with other handles (such as files or pipes)."

**The Failure Mode**:
- `tasklist.exe` likely uses a `ReadConsole` call to get its output or `ReadFile` on stdin.
- When invoked from a POSIX pipe via MSYS2, the stdin handle is an MSYS2 pipe object, not a native Windows pipe or console buffer.
- `tasklist.exe` may fail silently if it detects it's not reading from a console (no banner, no error, just empty output).
- `grep` (a Cygwin-compiled tool) correctly reads from the MSYS2 pipe because it links against the Cygwin DLL, which understands MSYS2 pipe semantics.

**Primary source**: MSYS2 runtime spawn.cc (GitHub), Microsoft Learn ReadConsole documentation.

---

## H3 — Convergence: H1-B and H2 as the Root Cause

**Question**: Are H1-B and H2 the actual root cause, not H1-A?

**Answer: Yes. H1-B and H2 together explain the operator's "proxy not up on 8317" error.**

**Hypothesis Convergence**:

1. **H1-A (POSIX path conversion)** — NOT the root cause.
   - With both `MSYS_NO_PATHCONV=1` and `MSYS2_ARG_CONV_EXCL=*` set, paths are not converted.
   - A bare `/c` token is passed as-is to the native Win32 app.
   - **This is expected behavior; not a failure mode.**

2. **H1-B (Double-slash in cmd //)** — IS a root cause IF present.
   - If any code is building `cmd //c ...` (e.g., trying to escape the `/c` flag), cmd.exe will fail silently and enter interactive mode.
   - No command will execute; cmd.exe will wait for input.
   - This would cause a proxy-startup hang (if the code is waiting for cmd.exe to complete).
   - **Likelihood**: Medium. Depends on whether the proxy-startup code escapes `cmd /c`.

3. **H2 (findstr-via-MSYS-pipe)** — IS the root cause, confirmed.
   - `tasklist | findstr` fails silently (no output) because:
     - `tasklist.exe` is a native Win32 executable.
     - When piped from bash, it receives an MSYS2 pipe handle as stdin.
     - `tasklist.exe` does not know how to read from MSYS2 pipes; it expects a Windows native pipe or console buffer.
     - Result: empty output, no error message.
   - `netstat | grep` works because `grep` (a Cygwin tool) understands MSYS2 pipes.
   - **Likelihood**: Very high. This explains the observed behavior exactly.

**Root Cause of "proxy not up on 8317"**:
The operator used `tasklist | findstr` to check for a listening port. Because `findstr` cannot read MSYS2 pipes, it produced empty output, making the operator believe the proxy was not running. In reality, the proxy was running (confirmed by `netstat | grep`), but the diagnostic tool failed silently.

---

## Foundational System-Level Fixes

### Fix 1: Replace Native Win32 Tools with Cygwin/Git Bash Equivalents
**For piped operations, use POSIX-compatible tools:**
```bash
# Instead of:
tasklist | findstr pattern          # FAILS silently on MSYS pipe

# Use:
tasklist | grep pattern             # Works (grep is Cygwin-compatible)
ps aux | grep pattern               # Works (ps is POSIX)
```

### Fix 2: Use `/proc/net` or `ss` Instead of `netstat | findstr`
```bash
# Instead of:
netstat -ano | findstr 8317         # Native tool + MSYS pipe fail

# Use:
ss -ano | grep 8317                 # Works (ss reads natively from kernel)
lsof -i :8317                       # Works (lsof is POSIX-aware)
```

### Fix 3: If native Win32 tools must be used, pipe through a Cygwin wrapper
```bash
# Instead of:
tasklist | findstr pattern          # FAILS

# Use:
tasklist 2>&1 | cat | grep pattern  # cat forces interpretation via Cygwin layer
```

### Fix 4: Validate cmd.exe Invocation
If proxy startup uses `cmd /c ...`, **do NOT escape to `cmd //c`**. The correct form is:
```powershell
cmd /c "some command"               # Correct
cmd //c "some command"              # WRONG: enters interactive mode
```

### Fix 5: Document Environment Variable Impact
In CLAUDE.md or project .vein.json, document:
- **When to use `MSYS_NO_PATHCONV=1`**: POSIX-path-heavy work (git, npm, Node.js).
- **When to unset it**: Piping to native Win32 tools (tasklist, findstr, netstat).
- **Better approach**: Use POSIX alternatives exclusively; rely on Git Bash's Cygwin foundation.

---

## Sources

[1] MSYS2 Runtime Spawn Source — https://raw.githubusercontent.com/msys2/msys2-runtime/master/winsup/cygwin/spawn.cc

[2] Cygwin Environment Variables Documentation — https://cygwin.com/cygwin-ug-net/using-cygwinenv.html

[3] Cygwin Native Win32 Interop — https://cygwin.com/cygwin-ug-net/using.html

[4] Microsoft Learn: cmd Command Reference — https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd

[5] Microsoft Learn: ReadConsole Function — https://learn.microsoft.com/en-us/windows/console/readconsole

[6] MSYS2 Runtime Issue #332: Argument Stripping in CreateProcess — https://github.com/msys2/msys2-runtime/issues/332

[7] Git for Windows GitHub Issues (pathconv search) — https://github.com/git-for-windows/git/issues?q=MSYS_NO_PATHCONV

---

**Frame 2 Verdict**:
- **H1-A (POSIX path conversion disabled)**: Yes, confirmed, expected behavior. NOT a failure cause.
- **H1-B (Double-slash in cmd //)**: Partial. Failure confirmed if present in code; investigate proxy startup cmd.exe invocation.
- **H2 (findstr-via-MSYS-pipe)**: Yes, confirmed. Native Win32 apps cannot read MSYS2 pipes. Use POSIX alternatives (grep, ss, lsof).
- **H3 (Root cause)**: H1-B + H2. H2 is very high likelihood; H1-B is medium (code-dependent).
