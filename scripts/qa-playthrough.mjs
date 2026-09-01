#!/usr/bin/env node
// Full-process QA: plays the REAL page from title screen to WON.
// A "bot" runs in-page: WASD via real KeyboardEvents, E/Space/Enter via real
// KeyboardEvents, steering by aiming (mouse-look can't be emulated), and
// pathfinding with the game's own AStar over a door-passable grid.
// Doors are opened by pressing E with the right keycard; the E3M1 boss is
// killed with real fire input. Enemies are otherwise tanked (hp=1e5) - this
// QA is about navigation, interaction and progression, not combat skill.
//
// Usage: node scripts/qa-playthrough.mjs [url]
// Exit 0 = WON reached with no page errors. Exit 1 = failure (logs + frame).

import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] || 'http://127.0.0.1:8000/';
const BASE = '/tmp/opencode/shots';
fs.mkdirSync(BASE, { recursive: true });

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const r = spawnSync('which', ['chromium', 'chrome', 'headless_shell'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.trim();
  throw new Error('no Chromium found: set CHROME_BIN');
}

const chromeBin = findChrome();
const port = 9347 + Math.floor(Math.random() * 100);
const prof = `/tmp/qa-playthrough-prof-${process.pid}`;
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

let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errs.push(`[EXC] ${m.params.exceptionDetails?.description || m.params.exceptionDetails?.text || ''}`.slice(0, 300));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errs.push(`[console.error] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const first = m.params.args[0]?.value;
    if (typeof first === 'string' && first.startsWith('[bot] ')) console.log(first);
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name) => {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  const p = path.join(BASE, `playthrough_${name}.png`);
  fs.writeFileSync(p, Buffer.from(png.data, 'base64'));
  console.log(`[frame] ${name} -> ${p}`);
};
const diag = (tag) => ev(`JSON.stringify({ state: window.__wd.state, lvl: window.__wd.levelIdx, hp: Math.round(window.__wd.player.hp), x: +window.__wd.player.x.toFixed(2), y: +window.__wd.player.y.toFixed(2), keyR: window.__wd.player.keyR, keyB: window.__wd.player.keyB, kills: window.__wd.stats.kills, secrets: window.__wd.stats.secrets, msg: window.__wd.message.text })`);
const log = (tag, v) => console.log(`[${tag}] ${v}`);

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL.replace(/\/?$/, '/?debug') });
await sleep(3500);
if (await ev(`typeof window.__wd`) !== 'object') {
  console.error('FAIL: ?debug handle missing'); process.exit(1);
}

// Install the in-page bot (runs the whole game with real key events).
await ev(`
window.__bot = { log: [] };
const g = window.__wd;
const L = (m) => { window.__bot.log.push(m); console.log('[bot] ' + m); };
async function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }
function key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); }
// A* over a grid where doors are passable
function pathTo(tx, ty) {
  const { gw, gh, solid, doorType } = g.map;
  const pass = new Uint8Array(gw * gh);
  for (let i = 0; i < pass.length; i++) {
    const s = solid[i];
    pass[i] = (s === 0 || (s >= 8 && s <= 11)) ? 0 : s; // doors passable in the path
  }
  const out = new Int32Array(gw * gh > 4096 ? 0 : 4096);
  if (gw * gh > 4096) return { n: 0, cells: [], doors: [] };
  const srcX = Math.floor(g.player.x), srcY = Math.floor(g.player.y);
  const n = g.astar.find(srcX, srcY, tx, ty, pass, gw, gh, out);
  if (!n) return { n: 0, cells: [], doors: [] };
  const cells = [], doors = [];
  for (let i = 0; i < n; i++) { cells.push(out[i]); if (doorType[out[i]]) doors.push(i); }
  return { n, cells, doors };
}
// Face a point exactly (bot steering; mouse-look can't be emulated headless)
function faceTo(x, y) { g.player.ang = Math.atan2(y - g.player.y, x - g.player.x); }
async function waitUntil(cond, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await sleepMs(60);
  }
  L('timeout waiting for: ' + what);
  return false;
}
// Walk along waypoint centers; press E (real key) at door waypoints.
async function walkTo(cells, label) {
  if (!cells.length) { L('no path ' + label); return false; }
  const { gw } = g.map;
  const doors = new Set();
  for (const c of cells) if (g.map.doorType[c]) doors.add(c);
  for (const c of cells) {
    const cx = (c % gw) + 0.5, cy = ((c / gw) | 0) + 0.5;
    // face the waypoint
    faceTo(cx, cy);
    await sleepMs(90);
    if (doors.has(c)) {
      // stand ~1.2u in front of the door and press E (real key)
      const d = Math.hypot(cx - g.player.x, cy - g.player.y);
      if (d > 1.6) { key('KeyW', true); await waitUntil(() => Math.hypot(cx - g.player.x, cy - g.player.y) < 1.6, 15000, 'reach door ' + label); key('KeyW', false); }
      L('door at ' + c + ' (type ' + g.map.doorType[c] + ') - press E');
      key('KeyE', true); await sleepMs(60); key('KeyE', false);
      const ok = await waitUntil(() => g.doorH[c] >= 0.98, 8000, 'door ' + c + ' open');
      if (!ok) return false;
      faceTo(cx, cy);
    }
    key('KeyW', true);
    const ok = await waitUntil(() => Math.hypot(cx - g.player.x, cy - g.player.y) < 0.55, 20000, 'waypoint ' + c + ' (' + label + ')');
    key('KeyW', false);
    if (!ok) { L('stuck at waypoint ' + c + ' at (' + g.player.x.toFixed(2) + ',' + g.player.y.toFixed(2) + ') hp=' + g.player.hp); return false; }
    g.player.hp = 1e5; g.projectiles.each((p) => { if (p.active) { p.active = false; g.projectiles.release(p); } }); // tank: QA tests navigation, not combat (return slots to the pool!)
  }
  return true;
}
function entityCell(type) {
  const e = g.map.ents.find((t) => t.type === type);
  if (!e) return -1;
  return ((e.y | 0) * g.map.gw) + (e.x | 0);
}
window.__bot.start = async () => {
  // stub pointer lock (headless has no gesture; keep the real Enter path exercised)
  document.getElementById('game').requestPointerLock = () => Promise.resolve();
  L('state=' + g.state);
  key('Enter', true); await sleepMs(80); key('Enter', false); // real Enter starts the game
  if (!(await waitUntil(() => g.state === 'PLAY', 5000, 'start from MENU'))) return 'FAIL start';
  L('game started: ' + g.map.name);
  return 'OK start';
};
window.__bot.seekKey = async (keyName) => {
  const c = entityCell(keyName);
  if (c < 0) return 'FAIL no ' + keyName + ' on map';
  const x = c % g.map.gw, y = (c / g.map.gw) | 0;
  const p = pathTo(x, y);
  L('path to ' + keyName + ': ' + p.n + ' cells');
  if (!(await walkTo(p.cells, keyName))) return 'FAIL walk to ' + keyName;
  const had = await waitUntil(() => window.__wd.player[keyName === 'keyR' ? 'keyR' : 'keyB'], 3000, 'pickup ' + keyName);
  return had ? 'OK got ' + keyName : 'FAIL not picked up (hp=' + g.player.hp + ')';
};
window.__bot.exit = async () => {
  const ex = g.map.exit;
  if (!ex) return 'FAIL no exit on map';
  const x = ex.x | 0, y = ex.y | 0;
  const p = pathTo(x, y);
  L('path to exit: ' + p.n + ' cells');
  if (!(await walkTo(p.cells, 'exit'))) return 'FAIL walk to exit';
  faceTo(ex.x, ex.y);
  await sleepMs(120);
  key('KeyE', true); await sleepMs(60); key('KeyE', false);
  const ok = await waitUntil(() => g.state === 'INTERM' || g.state === 'WON', 6000, 'exit triggered');
  return ok ? 'OK exit used, state=' + g.state : 'FAIL exit not triggered';
};
window.__bot.killBoss = async () => {
  const e = g.enemies.find((x) => x.type === 'boss' || x.type === 'overlord');
  if (!e) return 'FAIL no boss on map';
  L(e.type + ': hp=' + e.hp + ' at (' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ')');
  const p0 = pathTo(Math.floor(e.x), Math.min(21, Math.floor(e.y + 4))); // close from the south
  if (!p0.n) return 'FAIL no path to the boss';
  if (!(await walkTo(p0.cells, 'boss approach'))) return 'FAIL approach the boss';
  g.switchWeapon(4); // plasma
  key('Space', true); // real fire key
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (g.state !== 'PLAY') return 'FAIL state left PLAY mid-boss: ' + g.state;
    if (e.state === 5 || e.state === 6) break;
    g.player.hp = 1e5; g.player.armor = 100; g.player.ammoPl = 200; // tank: QA tests the kill pipeline, not skill
    g.player.ang = Math.atan2(e.y - g.player.y, e.x - g.player.x);
    if ((Date.now() - t0) % 2000 < 80) {
      let bolts = 0; g.projectiles.each((p) => { if (p.active && p.owner === 1) bolts++; });
      let used = 0; g.projectiles.each((p) => { if (p.active) used++; });
      L('t=' + ((Date.now() - t0) / 1000 | 0) + 's hp=' + e.hp + ' st=' + e.state + ' fire=' + g.input.fire + ' w=' + g.player.weapon + ' pl=' + g.player.ammoPl + ' bolts=' + bolts + ' used=' + used + ' cd=' + g.player.wpnCd.toFixed(3) + ' fr=' + g.frame + ' paused=' + g.paused + ' px=' + g.player.x.toFixed(2) + ',' + g.player.y.toFixed(2) + ' b=' + e.x.toFixed(2) + ',' + e.y.toFixed(2));
    }
    await sleepMs(70);
  }
  key('Space', false);
  if (e.state !== 5 && e.state !== 6) return 'FAIL the boss survived (hp=' + e.hp + ') fire=' + g.input.fire + ' w=' + g.player.weapon;
  L('the boss fell in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's; ' + g.message.text);
  return 'OK boss killed';
};
1`);

const results = [];
const step = async (name, fnExpr) => {
  const t0 = Date.now();
  const r = await ev(fnExpr);
  const ms = Date.now() - t0;
  results.push({ name, r });
  log(name, `${r} (${Math.round(ms / 100) / 10}s)`);
  const st = await diag(name);
  log(name + ':diag', st);
  return r;
};

const fail = (why) => {
  console.error('=== QA PLAYTHROUGH: FAIL ===\nreason:', why);
  for (const e of errs) console.error(e);
  console.error('bot log:'); for (const l of (ev ? [] : [])) console.error(l);
  try { (async () => { const p = await ev(`window.__bot.log.join(chr(10))`); console.error(p); })(); } catch { }
  shot('fail');
  process.exit(1);
};

// ---- generic run: every level in order, keys -> boss -> exit ----
let r = await step('start', 'window.__bot.start()');
shot('title');
if (!r.startsWith('OK')) fail(r);
let d = JSON.parse(await diag('lvl0'));
if (d.lvl !== 0) fail('did not start at E1M1: ' + JSON.stringify(d));
const nLevels = await ev('window.__wd.levels.length');
for (let lvl = 0; lvl < nLevels; lvl++) {
  const def = JSON.parse(await ev(`JSON.stringify({ name: window.__wd.levels[${lvl}].name, keys: window.__wd.levels[${lvl}].keys || (window.__wd.levels[${lvl}].needsKey ? [window.__wd.levels[${lvl}].needsKey] : []), boss: !!window.__wd.levels[${lvl}].boss })`));
  const tag = def.name.split(' ')[0];
  for (const k of def.keys) {
    r = await step(tag + ':key:' + k, `window.__bot.seekKey('${k}')`);
    if (!r.startsWith('OK')) fail(r);
  }
  if (def.boss) {
    r = await step(tag + ':boss', 'window.__bot.killBoss()');
    if (!r.startsWith('OK')) fail(r);
    shot(tag + '_bossfall');
  }
  r = await step(tag + ':exit', 'window.__bot.exit()');
  if (!r.startsWith('OK')) fail(r);
  shot(tag + '_exit');
  if (lvl < nLevels - 1) {
    await sleep(3000);
    d = JSON.parse(await diag('interm' + lvl));
    if (d.lvl !== lvl + 1) fail(`intermission after ${tag} did not advance: ` + JSON.stringify(d));
    log('interm→' + def.name, 'OK');
    shot(tag.toLowerCase() + '_start');
  }
}
d = JSON.parse(await diag('won'));
if (d.state !== 'WON') fail('not WON: ' + JSON.stringify(d));
shot('won');

const botLog = await ev(`window.__bot.log.join('\\n')`);
console.log('--- bot log ---\n' + botLog);
if (errs.length) {
  console.error('=== QA PLAYTHROUGH: FAIL (page errors) ===');
  for (const e of errs) console.error(e);
  process.exit(1);
}
console.log('=== QA PLAYTHROUGH: PASS (WON, no page errors) ===');
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { }
ws.close(); chrome.kill();
process.exit(0);
