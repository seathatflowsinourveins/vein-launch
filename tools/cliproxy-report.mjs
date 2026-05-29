#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
/**
 * cliproxy-report.mjs — generate a self-contained HTML dashboard of CLIProxy
 * account usage (rendered SVG charts, no external/CDN dependencies).
 *
 * Charts: 21h load distribution, requests-since-load, live 5h/7d quota gauges,
 * per-account model mix (stacked), fleet hourly volume, priority tiers.
 *
 * Usage:
 *   node tools/cliproxy-report.mjs            # write report, print path
 *   node tools/cliproxy-report.mjs --open     # ...and open it in the browser
 *
 * Env: MANAGEMENT_PASSWORD (required), CLIPROXY_PORT (default 8317).
 */
import http from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CLIPROXY_PORT ?? 8317);
const KEY = process.env.MANAGEMENT_PASSWORD ?? "";
const OUT = join(homedir(), ".vein", "hud", "cliproxy-report.html");
const LOG = join(homedir(), ".cli-proxy-api", "logs", "main.log");
const TODAY = "2026-05-28"; // log's active day for hourly chart

function get(path, hosts = ["127.0.0.1", "::1"], i = 0) {
  if (i >= hosts.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = http.get(
      { host: hosts[i], port: PORT, path, headers: { "X-Management-Key": KEY }, timeout: 8000 },
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
          resolve(get(path, hosts, i + 1));
        });
      },
    );
    req.on("error", () => resolve(get(path, hosts, i + 1)));
    req.on("timeout", () => {
      req.destroy();
      resolve(get(path, hosts, i + 1));
    });
  });
}

const hv = (rh, n) => {
  const v = (rh ?? {})[n];
  return Array.isArray(v) ? v[0] : v;
};
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const PAL = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6"];

// horizontal bar chart -> svg
function hbar(rows, { w = 760, unit = "", colorByIndex = true } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const rh = 34,
    padL = 150,
    padR = 70,
    top = 10;
  const innerW = w - padL - padR;
  const h = top * 2 + rows.length * rh;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">`;
  rows.forEach((r, i) => {
    const y = top + i * rh;
    const bw = Math.max(1, (r.value / max) * innerW);
    const col = r.color ?? PAL[i % PAL.length];
    s += `<text x="${padL - 8}" y="${y + 20}" text-anchor="end" class="lbl">${esc(r.label)}</text>`;
    s += `<rect x="${padL}" y="${y + 6}" width="${innerW}" height="20" rx="4" class="track"/>`;
    s += `<rect x="${padL}" y="${y + 6}" width="${bw}" height="20" rx="4" fill="${col}"/>`;
    s += `<text x="${padL + bw + 8}" y="${y + 20}" class="val">${r.value.toLocaleString()}${unit}</text>`;
  });
  return s + "</svg>";
}

// stacked horizontal bar (model mix) -> svg
function stacked(rows, legend, { w = 760 } = {}) {
  const rh = 34,
    padL = 150,
    padR = 10,
    top = 10;
  const innerW = w - padL - padR;
  const h = top * 2 + rows.length * rh;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">`;
  rows.forEach((r, i) => {
    const y = top + i * rh;
    const tot = r.segs.reduce((a, b) => a + b.value, 0) || 1;
    let x = padL;
    s += `<text x="${padL - 8}" y="${y + 20}" text-anchor="end" class="lbl">${esc(r.label)}</text>`;
    r.segs.forEach((sg) => {
      const sw = (sg.value / tot) * innerW;
      if (sw > 0)
        s += `<rect x="${x.toFixed(1)}" y="${y + 6}" width="${sw.toFixed(1)}" height="20" fill="${sg.color}"><title>${esc(sg.label)}: ${sg.value}</title></rect>`;
      x += sw;
    });
  });
  s += "</svg>";
  const leg = legend
    .map((l) => `<span class="chip"><i style="background:${l.color}"></i>${esc(l.label)}</span>`)
    .join("");
  return `${s}<div class="legend">${leg}</div>`;
}

// vertical columns (hourly) -> svg
function columns(rows, { w = 760, h = 200 } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const padB = 24,
    padT = 10,
    padL = 28;
  const innerW = w - padL - 8,
    innerH = h - padB - padT;
  const cw = innerW / rows.length;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">`;
  rows.forEach((r, i) => {
    const bh = (r.value / max) * innerH;
    const x = padL + i * cw,
      y = padT + innerH - bh;
    s += `<rect x="${(x + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(cw - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="#3b82f6"><title>${esc(r.label)}: ${r.value}</title></rect>`;
    s += `<text x="${(x + cw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle" class="axis">${esc(r.label)}</text>`;
  });
  return s + "</svg>";
}

// quota gauge row -> svg
function gauges(rows, { w = 760 } = {}) {
  const rh = 40,
    padL = 150,
    padR = 60,
    top = 8;
  const innerW = w - padL - padR;
  const h = top * 2 + rows.length * rh;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">`;
  rows.forEach((r, i) => {
    const y = top + i * rh;
    s += `<text x="${padL - 8}" y="${y + 16}" text-anchor="end" class="lbl">${esc(r.label)}</text>`;
    if (r.pct == null) {
      s += `<text x="${padL}" y="${y + 16}" class="muted">idle — no request in last 60s</text>`;
      return;
    }
    const col = r.pct >= 80 ? "#ef4444" : r.pct >= 50 ? "#f59e0b" : "#22c55e";
    s += `<rect x="${padL}" y="${y + 4}" width="${innerW}" height="16" rx="3" class="track"/>`;
    s += `<rect x="${padL}" y="${y + 4}" width="${((r.pct / 100) * innerW).toFixed(1)}" height="16" rx="3" fill="${col}"/>`;
    s += `<text x="${padL + innerW + 6}" y="${y + 17}" class="val">${r.pct.toFixed(0)}%</text>`;
    s += `<text x="${padL}" y="${y + 34}" class="axis">${esc(r.sub)}</text>`;
  });
  return s + "</svg>";
}

async function main() {
  if (!KEY) {
    console.error("MANAGEMENT_PASSWORD not set");
    process.exit(1);
  }
  const af = (await get("/v0/management/auth-files")) ?? {};
  const files = Array.isArray(af.files) ? af.files : Array.isArray(af) ? af : [];
  const recs = (await get("/v0/management/usage-queue?count=5000")) ?? [];

  // live quota by auth_index
  const liveQ = {};
  for (const r of Array.isArray(recs) ? recs : []) {
    const rh = r.response_headers;
    if (r.auth_index && hv(rh, "Anthropic-Ratelimit-Unified-5h-Utilization") != null) {
      const reset = (ep) => {
        const n = Number(ep);
        return Number.isFinite(n) ? new Date(n > 1e12 ? n : n * 1000) : null;
      };
      liveQ[r.auth_index] = {
        u5: parseFloat(hv(rh, "Anthropic-Ratelimit-Unified-5h-Utilization")) * 100,
        r5: reset(hv(rh, "Anthropic-Ratelimit-Unified-5h-Reset")),
        u7: parseFloat(hv(rh, "Anthropic-Ratelimit-Unified-7d-Utilization")) * 100,
      };
    }
  }

  // parse log history
  const sel = {},
    model = {},
    hourly = {};
  try {
    const txt = await readFile(LOG, "utf8");
    for (const ln of txt.split("\n")) {
      if (!ln.includes("selector.go") || !ln.includes("auth=")) continue;
      const em = ln.match(/auth=\S*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)\.json/);
      const m = ln.match(/model=(\S+)/);
      const hh = ln.match(new RegExp(`\\[${TODAY} (\\d\\d):`));
      if (em) {
        const e = em[1];
        sel[e] = (sel[e] ?? 0) + 1;
        if (m) {
          model[e] ??= {};
          model[e][m[1]] = (model[e][m[1]] ?? 0) + 1;
        }
        if (hh) hourly[hh[1]] = (hourly[hh[1]] ?? 0) + 1;
      }
    }
  } catch {
    /* log optional */
  }

  const emailOf = (f) => f.email || f.name;
  const bySel = [...files].sort((a, b) => (sel[emailOf(b)] ?? 0) - (sel[emailOf(a)] ?? 0));
  const short = (e) => (e || "").replace(/@gmail\.com$/, "").replace(/@sva\.edu$/, "(codex)");

  const loadRows = bySel.map((f) => ({ label: short(emailOf(f)), value: sel[emailOf(f)] ?? 0 }));
  const succRows = [...files]
    .sort((a, b) => (b.success ?? 0) - (a.success ?? 0))
    .map((f) => ({ label: short(emailOf(f)), value: f.success ?? 0 }));
  const MODS = [
    {
      key: ["claude-haiku-4-5-20251001", "claude-haiku-4-5", "claude-3-5-haiku-20241022"],
      label: "Haiku 4.5",
      color: "#22c55e",
    },
    { key: ["claude-opus-4-7"], label: "Opus 4.7", color: "#3b82f6" },
    { key: ["claude-opus-4-8"], label: "Opus 4.8", color: "#a855f7" },
    { key: ["claude-sonnet-4-6"], label: "Sonnet 4.6", color: "#f59e0b" },
  ];
  const modelRows = bySel
    .filter((f) => sel[emailOf(f)])
    .map((f) => ({
      label: short(emailOf(f)),
      segs: MODS.map((md) => ({
        label: md.label,
        color: md.color,
        value: md.key.reduce((a, k) => a + ((model[emailOf(f)] ?? {})[k] ?? 0), 0),
      })),
    }));
  const quotaRows = bySel.map((f) => {
    const q = liveQ[f.auth_index];
    return {
      label: short(emailOf(f)),
      pct: q ? q.u5 : null,
      sub: q
        ? `5h ${q.u5.toFixed(0)}% · 7d ${q.u7.toFixed(0)}% · resets ${q.r5 ? q.r5.toISOString().slice(11, 16) + "Z" : "—"}`
        : "",
    };
  });
  const hourRows = Object.keys(hourly)
    .sort()
    .map((h) => ({ label: h, value: hourly[h] }));
  const priRows = [...files].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  const totSucc = files.reduce((a, f) => a + (f.success ?? 0), 0);
  const totFail = files.reduce((a, f) => a + (f.failed ?? 0), 0);
  const totSel = Object.values(sel).reduce((a, b) => a + b, 0);

  const html = `<!doctype html><meta charset="utf-8"><title>CLIProxy account report</title>
<style>
:root{color-scheme:dark}
body{background:#0b0f17;color:#e5e7eb;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:28px}
h1{font-size:20px;margin:0 0 4px} .sub{color:#9ca3af;margin-bottom:24px;font-size:13px}
.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:18px 20px;margin:0 0 18px}
.card h2{font-size:14px;margin:0 0 10px;color:#cbd5e1;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}
.kpi{display:flex;gap:26px;margin-bottom:22px;flex-wrap:wrap}
.kpi div{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:12px 18px}
.kpi b{display:block;font-size:24px;color:#fff} .kpi span{color:#9ca3af;font-size:12px}
text.lbl{fill:#cbd5e1;font:12px monospace} text.val{fill:#9ca3af;font:12px monospace}
text.axis{fill:#6b7280;font:10px monospace} text.muted,.muted{fill:#6b7280;color:#6b7280;font-size:12px}
rect.track{fill:#1f2937}
.legend{margin-top:8px;font-size:12px;color:#cbd5e1} .chip{margin-right:14px;white-space:nowrap}
.chip i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
table{width:100%;border-collapse:collapse;font-size:13px} td,th{padding:6px 8px;border-bottom:1px solid #1f2937;text-align:left}
.tier20{color:#a855f7;font-weight:700} .tier10{color:#3b82f6} .tier0{color:#6b7280}
</style>
<h1>CLIProxy — account usage report</h1>
<div class="sub">generated ${now} · :${PORT} · ${files.length} accounts</div>
<div class="kpi">
<div><b>${totSucc.toLocaleString()}</b><span>requests since load</span></div>
<div><b>${totFail}</b><span>failures</span></div>
<div><b>${totSel.toLocaleString()}</b><span>21h routed selections</span></div>
<div><b>${files.filter((f) => !f.disabled && !f.unavailable).length}/${files.length}</b><span>online</span></div>
</div>
<div class="grid">
<div class="card"><h2>① 21h load distribution (selections)</h2>${hbar(loadRows)}</div>
<div class="card"><h2>② Requests since load (success)</h2>${hbar(succRows)}</div>
<div class="card"><h2>③ Live 5h quota (active accounts)</h2>${gauges(quotaRows)}</div>
<div class="card"><h2>④ Priority tiers</h2><table><tr><th>account</th><th>priority</th><th>role</th></tr>${priRows
    .map((f) => {
      const p = f.priority ?? 0;
      return `<tr><td>${esc(short(emailOf(f)))}</td><td class="tier${p}">${p}</td><td>${p >= 20 ? "⭐ primary" : p >= 10 ? "second" : "fallback"}</td></tr>`;
    })
    .join("")}</table></div>
</div>
<div class="card"><h2>⑤ Model mix per account</h2>${stacked(
    modelRows,
    MODS.map((m) => ({ label: m.label, color: m.color })),
  )}</div>
<div class="card"><h2>⑥ Fleet hourly request volume (${TODAY})</h2>${columns(hourRows)}</div>
`;

  await mkdir(join(homedir(), ".vein", "hud"), { recursive: true });
  await writeFile(OUT, html, "utf8");
  console.log("report written:", OUT);
  if (process.argv.includes("--open"))
    spawn("cmd", ["/c", "start", "", OUT], { detached: true, stdio: "ignore" }).unref();
}
main();
