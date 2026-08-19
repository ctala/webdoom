#!/usr/bin/env node
// Headless browser QA sweep (zero deps: node:child_process + fetch + WebSocket).
// Loads the game with ?debug, walks a sample of open cells, sweeps the camera
// in 8 directions at each, and fails on ANY console error / page exception.
//
// Usage: node scripts/qa-browser.mjs [url]
//   CHROME_BIN=/path/to/chrome-headless-shell node scripts/qa-browser.mjs
// Exit code: 0 clean, 1 errors found.

import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] || 'http://127.0.0.1:8000/';
const DWELL_MS = 90;   // per camera step (render happens in the page's rAF)
const DIRS = 8;        // 45-degree sweep at each sampled position

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const home = os.homedir();
  for (const base of [path.join(home, '.cache/ms-playwright'), path.join(home, '.cache/puppeteer')]) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      if (!/chromium/.test(dir)) continue;
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) { const r = walk(p); if (r) return r; }
          else if (/^(chrome|headless_shell|chrome-headless-shell)$/.test(e.name) && fs.statSync(p).size > 1e7) return p;
        }
        return null;
      };
      const f = walk(path.join(base, dir));
      if (f) return f;
    }
  }
  for (const c of ['chrome', 'google-chrome', 'chromium-browser', 'chromium', 'headless_shell']) {
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  throw new Error('no Chromium found: set CHROME_BIN');
}

const chromeBin = findChrome();
const port = 9337 + Math.floor(Math.random() * 100);
const prof = `/tmp/qa-browser-prof-${process.pid}`;
const chrome = spawn(chromeBin, [
  '--headless', '--no-sandbox', '--disable-gpu', '--use-gl=swiftshader',
  '--window-size=960,540', `--remote-debugging-port=${port}`,
  `--user-data-dir=${prof}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (d) => { const s = d + ''; if (!/Vulkan|gpu|SwiftShader/i.test(s)) process.stderr.write('[chrome] ' + s); });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const t = j.find((x) => x.type === 'page');
      if (t) return t;
    } catch { }
    await sleep(300);
  }
  throw new Error('chrome never opened CDP');
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; ws.onerror = () => r(); });

let id = 0; const pend = new Map(); const errs = []; let exc = 0;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errs.push(`[EXC#${++exc}] ${d.text} | ${d.exception?.description || ''} | ${d.url}:${d.lineNumber}:${d.columnNumber}`);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errs.push(`[console.error] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errs.push(`[log.error] ${m.params.entry.text}`);
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Page.navigate', { url: URL.replace(/\/?$/, '/?debug') });
await sleep(3500);
if (await ev(`typeof window.__wd`) !== 'object') {
  console.error('FAIL: ?debug handle missing (did the page load the module graph?)');
  process.exit(1);
}

// Collect a spread of open cells (incl. cells adjacent to every door cell).
const spots = await ev(`(() => {
  const g = window.__wd; const { gw, gh, solid } = g.map;
  const open = (x, y) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1 && !solid[y * gw + x];
  const set = new Set();
  for (let y = 1; y < gh - 1; y += 2) for (let x = 1; x < gw - 1; x += 2)
    if (open(x, y)) set.add(y * gw + x);
  for (let i = 0; i < solid.length; i++) if (solid[i] >= 8) { // stand next to each door
    const x = i % gw, y = (i / gw) | 0;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) if (open(x + dx, y + dy)) set.add((y + dy) * gw + x + dx);
  }
  const all = [...set];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, 48).map((i) => [i % gw + 0.5, ((i / gw) | 0) + 0.5]);
})()`);

console.log(`sweeping ${spots.length} positions x ${DIRS} directions ...`);
for (const [sx, sy] of spots) {
  for (let k = 0; k < DIRS; k++) {
    const out = await ev(`(() => {
      const g = window.__wd;
      g.state = 'PLAY'; g.player.hp = 100;                 // sweep is about rendering, not combat
      g.player.x = ${sx}; g.player.y = ${sy};
      g.player.ang = ${k * (Math.PI / 4)};
      return g.state;
    })()`);
    if (out === undefined) { errs.push(`[sweep] page died during sweep at (${sx},${sy}) dir ${k}`); break; }
    await sleep(DWELL_MS);
  }
}
// long soak: 45s of walking to catch slower failures
await ev(`(() => { window.__wd.input.up = true; return 1 })()`);
for (let i = 0; i < 45; i++) await sleep(1000);
await ev(`(() => { window.__wd.input.up = false; return 1 })()`);

const diag = await ev(`(() => { const g = window.__wd;
  const ctx = document.getElementById('game').getContext('2d', { alpha: false });
  const d = ctx.getImageData(0, 0, 480, 270).data;
  let nz = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] || d[i+1] || d[i+2]) nz++;
  return JSON.stringify({ state: g.state, kills: g.stats.kills, nonZero: nz });
})()`);

console.log('diagnostics:', diag);
console.log('=== QA BROWSER SWEEP:', errs.length ? 'FAIL' : 'CLEAN', '===');
for (const e of errs) console.log(e);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { }
ws.close(); chrome.kill();
process.exit(errs.length ? 1 : 0);
