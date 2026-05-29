#!/usr/bin/env node
/**
 * cliproxy-monitor.mjs — live CLIProxy (:8317) usage dashboard.
 *
 * Richer than the claude-hud statusline: per-account quota/reset, prompt-cache
 * hit rate, request rate, and live token flow. Reads the same management API
 * the HUD bridge uses (X-Management-Key: $MANAGEMENT_PASSWORD).
 *
 * Quota/reset is only emitted by CLIProxy for accounts that made a request in
 * the last ~60s (usage-queue retention). This monitor REMEMBERS the last-seen
 * quota per account across polls, so the dashboard shows a rolling per-account
 * view rather than only whatever is active this instant.
 *
 * Usage:
 *   node tools/cliproxy-monitor.mjs                # refresh every 3s
 *   node tools/cliproxy-monitor.mjs --interval 5   # every 5s
 *   node tools/cliproxy-monitor.mjs --once         # single snapshot, then exit
 *
 * Env: MANAGEMENT_PASSWORD (required), CLIPROXY_PORT (default 8317),
 *      CLIPROXY_HOST (default 127.0.0.1; falls back to ::1 automatically).
 */
import http from "node:http";

const PORT = Number(process.env.CLIPROXY_PORT ?? 8317);
const PRIMARY = process.env.CLIPROXY_HOST ?? "127.0.0.1";
const HOSTS = PRIMARY === "127.0.0.1" ? ["127.0.0.1", "::1"] : [PRIMARY, "127.0.0.1"];
const KEY = process.env.MANAGEMENT_PASSWORD ?? "";

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const iIdx = args.indexOf("--interval");
const INTERVAL = Math.max(1, Number(iIdx >= 0 ? args[iIdx + 1] : 3)) * 1000;

/** GET JSON, trying each host in turn (handles a per-IP lockout on one stack). */
function get(path, i = 0) {
  if (i >= HOSTS.length) return Promise.resolve({ __error: "all hosts failed" });
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: HOSTS[i],
        port: PORT,
        path,
        headers: KEY ? { "X-Management-Key": KEY } : {},
        timeout: 6000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              return resolve(JSON.parse(d));
            } catch {
              return resolve(null);
            }
          }
          resolve(get(path, i + 1)); // non-200 (e.g. ban) → try next host
        });
      },
    );
    req.on("error", () => resolve(get(path, i + 1)));
    req.on("timeout", () => {
      req.destroy();
      resolve(get(path, i + 1));
    });
  });
}

const hv = (rh, n) => {
  const v = (rh ?? {})[n];
  return Array.isArray(v) ? v[0] : v;
};
const resetDate = (ep) => {
  const n = Number(ep);
  return Number.isFinite(n) ? new Date(n > 1e12 ? n : n * 1000) : null;
};
const asPct = (u) => {
  const n = parseFloat(u);
  return Number.isFinite(n) ? n * 100 : null;
};

const acct = new Map(); // auth_index -> { u5, r5, u7, r7, status, lastSeen }
const cum = { input: 0, cacheRead: 0, cacheCreation: 0, output: 0, reqs: 0 };
const started = Date.now();

function fmtReset(d) {
  if (!d) return "—";
  const rem = (d.getTime() - Date.now()) / 3_600_000;
  return `${d.toISOString().slice(11, 16)}Z (${rem >= 0 ? "in " + rem.toFixed(1) + "h" : "elapsed"})`;
}
function bar(p, w = 12) {
  if (p == null) return " ".repeat(w + 5);
  const n = Math.min(w, Math.round((p / 100) * w));
  return "█".repeat(n) + "░".repeat(w - n) + ` ${p.toFixed(0).padStart(3)}%`;
}
const cacheRate = (o) => {
  const d = o.input + o.cacheRead + o.cacheCreation;
  return d ? (100 * o.cacheRead) / d : null;
};

async function tick() {
  const [af, uq] = await Promise.all([
    get("/v0/management/auth-files"),
    get("/v0/management/usage-queue?count=500"),
  ]);
  const now = new Date();
  const files = af && Array.isArray(af.files) ? af.files : Array.isArray(af) ? af : [];
  const apiErr = af?.__error;

  const recs = Array.isArray(uq) ? uq : [];
  const win = { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 };
  const winModels = new Map();
  for (const r of recs) {
    const tk = r.tokens ?? {};
    win.input += tk.input_tokens ?? 0;
    win.output += tk.output_tokens ?? 0;
    win.cacheRead += tk.cache_read_tokens ?? 0;
    win.cacheCreation += tk.cache_creation_tokens ?? 0;
    if (r.model) winModels.set(r.model, (winModels.get(r.model) ?? 0) + 1);
    const rh = r.response_headers;
    if (r.auth_index && hv(rh, "Anthropic-Ratelimit-Unified-5h-Utilization") != null) {
      acct.set(r.auth_index, {
        u5: asPct(hv(rh, "Anthropic-Ratelimit-Unified-5h-Utilization")),
        r5: resetDate(hv(rh, "Anthropic-Ratelimit-Unified-5h-Reset")),
        u7: asPct(hv(rh, "Anthropic-Ratelimit-Unified-7d-Utilization")),
        r7: resetDate(hv(rh, "Anthropic-Ratelimit-Unified-7d-Reset")),
        status: hv(rh, "Anthropic-Ratelimit-Unified-Status"),
        lastSeen: now,
      });
    }
  }
  cum.input += win.input;
  cum.cacheRead += win.cacheRead;
  cum.cacheCreation += win.cacheCreation;
  cum.output += win.output;
  cum.reqs += recs.length;

  const online = files.filter(
    (a) =>
      a.disabled !== true && a.unavailable !== true && (a.status == null || a.status === "active"),
  ).length;
  const uptime = ((Date.now() - started) / 1000).toFixed(0);

  const L = [];
  L.push(
    `\x1b[1mCLIProxy live monitor\x1b[0m  ${now.toISOString().slice(0, 19)}Z   ${HOSTS[0]}:${PORT}   every ${INTERVAL / 1000}s`,
  );
  if (apiErr) L.push(`\x1b[31m  management API unreachable: ${apiErr}\x1b[0m`);
  L.push(
    `accounts ${online}/${files.length} online    live queue (60s): ${recs.length} req    monitor uptime ${uptime}s`,
  );
  L.push("");
  L.push(
    "ACCOUNT                                 STATUS   SUCC  FAIL  5h-QUOTA           7d    RESET(5h)",
  );
  for (const a of [...files].sort((x, y) => (y.success || 0) - (x.success || 0))) {
    const s = acct.get(a.auth_index) ?? {};
    const email = (a.email || a.name || "?").slice(0, 37).padEnd(37);
    const st = String(a.status || "?").padEnd(7);
    const q7 = s.u7 != null ? `${s.u7.toFixed(0)}%`.padStart(4) : "   —";
    L.push(
      `${email} ${st} ${String(a.success ?? 0).padStart(5)} ${String(a.failed ?? 0).padStart(4)}  ${bar(s.u5)}  ${q7}  ${fmtReset(s.r5)}`,
    );
  }
  L.push("");
  const wr = cacheRate(win),
    cr = cacheRate(cum);
  L.push(
    `PROMPT CACHE   window: ${wr == null ? "—" : wr.toFixed(1) + "%"}   cumulative(${uptime}s, ${cum.reqs} req): ${cr == null ? "—" : cr.toFixed(1) + "%"}`,
  );
  L.push(
    `TOKENS window  in=${win.input}  cacheRead=${win.cacheRead}  cacheCreate=${win.cacheCreation}  out=${win.output}`,
  );
  L.push(
    `models(60s)    ${[...winModels.entries()].map(([m, c]) => `${m}×${c}`).join("   ") || "—"}`,
  );

  process.stdout.write((ONCE ? "" : "\x1b[2J\x1b[H") + L.join("\n") + "\n");
}

async function main() {
  if (!KEY) {
    console.error("MANAGEMENT_PASSWORD is not set — cannot authenticate to the management API.");
    process.exit(1);
  }
  await tick();
  if (ONCE) return;
  const timer = setInterval(() => tick().catch((e) => process.stderr.write(`${e}\n`)), INTERVAL);
  process.on("SIGINT", () => {
    clearInterval(timer);
    process.stdout.write("\n");
    process.exit(0);
  });
}

main();
