import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { buildItemSprites } from '../src/gfx/itemSprites.js';
import { parseLevel, DOOR_ID_BASE } from '../src/engine/map.js';
import { E2M1 } from '../levels/e2m1.js';

const W = 480, H = 270;

function makeGame(rows, startAng = 0, name = 'T') {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name, startAng, theme: 0, map: rows }];
  g.loadLevel(0);
  return g;
}

// ---------- E2M1 validation ----------

test('E2M1: 32x24, solid border, player + exit present', () => {
  const m = parseLevel(E2M1.map, E2M1.name);
  assert.equal(m.gw, 32);
  assert.equal(m.gh, 24);
  for (let x = 0; x < 32; x++) {
    assert.ok(m.solid[x] !== 0, 'top border');
    assert.ok(m.solid[23 * 32 + x] !== 0, 'bottom border');
  }
  assert.ok(m.player, 'player start');
  assert.ok(m.exit, 'exit switch');
  const ents = {};
  for (const e of m.ents) ents[e.type] = (ents[e.type] || 0) + 1;
  assert.equal(ents.keyB, 1, 'exactly one blue keycard');
  assert.ok(ents.armor >= 1 && ents.health >= 1, 'items present');
  let bt = 0, dt = 0, st = 0;
  for (let i = 0; i < m.doorType.length; i++) {
    if (m.doorType[i] === 3) bt++;
    if (m.doorType[i] === 1) dt++;
    if (m.doorType[i] === 4) st++;
  }
  assert.ok(bt >= 1, 'a blue-key door guards the exit area');
  assert.ok(dt >= 1, 'plain doors present');
  assert.ok(st >= 1, 'a secret wall exists');
});

test('E2M1: every entity and the exit reachable from the start', () => {
  const m = parseLevel(E2M1.map, E2M1.name);
  const { gw, gh, solid } = m;
  const pass = (i) => { const s = solid[i]; return s === 0 || (s >= DOOR_ID_BASE && s <= DOOR_ID_BASE + 3); };
  const seen = new Uint8Array(gw * gh);
  const stack = [Math.floor(m.player.y) * gw + Math.floor(m.player.x)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % gw, y = (i / gw) | 0;
    for (const [j, nx, ny] of [[i - 1, x - 1, y], [i + 1, x + 1, y], [i - gw, x, y - 1], [i + gw, x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || seen[j] || !pass(j)) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  for (const e of m.ents) {
    assert.ok(seen[Math.floor(e.y) * gw + Math.floor(e.x)], `entity ${e.type} reachable`);
  }
  assert.ok(seen[Math.floor(m.exit.y) * gw + Math.floor(m.exit.x)], 'exit reachable');
});

// ---------- pickups ----------

const PICKUP = [
  '##############',
  '#.............',
  '#P...h...m....#',
  '#.............',
  '#.s....k...b..#',
  '#.p...g.......#',
  '#.............',
  '##############',
];

function at(g, x, y) { g.player.x = x; g.player.y = y; g.tick(1 / 60); }

test('pickups: hp / armor / ammo / keys apply with messages + sfx', () => {
  const g = makeGame(PICKUP);
  const calls = [];
  g.sfx = (n) => calls.push(n);
  g.player.hp = 75;
  at(g, 5.5, 2.5); // medkit at (5.5,2.5)
  assert.equal(g.player.hp, 100, 'hp clamped to 100');
  assert.equal(g.message.text, '+25 HEALTH');
  at(g, 9.5, 2.5); // pistol ammo ('m' at col 9)
  assert.equal(g.player.ammoP, 60);
  assert.equal(g.message.text, '+PISTOL AMMO');
  at(g, 2.5, 4.5); // shells
  assert.equal(g.player.ammoS, 12);
  at(g, 2.5, 5.5); // plasma
  assert.equal(g.player.ammoPl, 30);
  at(g, 6.5, 5.5); // armor
  assert.equal(g.player.armor, 50);
  assert.equal(g.message.text, '+ARMOR');
  at(g, 7.5, 4.5); // red key
  assert.ok(g.player.keyR === true, 'red keycard acquired');
  assert.equal(g.message.text, 'GOT THE RED KEYCARD');
  at(g, 11.5, 4.5); // blue key
  assert.ok(g.player.keyB === true, 'blue keycard acquired');
  assert.equal(g.message.text, 'GOT THE BLUE KEYCARD');
  assert.ok(calls.includes('pickup'), 'pickup sfx played');
});

test('pickups refuse when full: item stays on the ground', () => {
  const g = makeGame(PICKUP);
  g.player.hp = 100;
  at(g, 5.5, 2.5); // medkit at full hp
  let alive = 0;
  for (const it of g.items) if (it.active && it.type === 'health') alive++;
  assert.equal(alive, 1, 'medkit not consumed at full hp');
  g.player.armor = 100;
  at(g, 6.5, 5.5); // armor at full ('g' at col 6)
  assert.equal(g.player.armor, 100);
  alive = 0;
  for (const it of g.items) if (it.active && it.type === 'armor') alive++;
  assert.equal(alive, 1, 'armor not consumed at full');
  g.player.ammoS = 50;
  at(g, 2.5, 4.5); // shells at cap
  assert.equal(g.player.ammoS, 50);
  alive = 0;
  for (const it of g.items) if (it.active && it.type === 'ammoS') alive++;
  assert.equal(alive, 1, 'shells not consumed at cap');
});

test('pickups: ammo tops up to the cap, not beyond', () => {
  const g = makeGame(PICKUP);
  g.player.ammoP = 195;
  at(g, 9.5, 2.5);
  assert.equal(g.player.ammoP, 200, 'capped at 200');
});

const EMPTYB = ['#########', '#..P....#', '#.......#', '#########'];

test('keys carry across level progression but reset on a fresh load', () => {
  const g = makeGame(PICKUP, 0, 'A');
  g.levels.push({ name: 'B', startAng: 0, theme: 0, map: EMPTYB });
  at(g, 7.5, 4.5); // take the red key in level A
  assert.ok(g.player.keyR);
  g.loadLevel(1);
  assert.equal(g.player.keyR, false, 'death-style respawn resets keys');
  let alive = 0;
  for (const it of g.items) if (it.active) alive++;
  assert.equal(alive, 0, 'items cleared on level change');
  g.loadLevel(0);
  at(g, 7.5, 4.5); // take it again
  g.loadLevel(1, true);
  assert.equal(g.player.keyR, true, 'level progression carries the key forward');
});

// ---------- doors / keys / secret / exit ----------

const D_M = ['###########', '#....D....#', '#....P....#', '###########'];
const R_M = ['###########', '#....R....#', '#....P....#', '###########'];
const B_M = ['###########', '#....B....#', '#....P....#', '###########'];
const S_M = ['###########', '#....S....#', '#....P....#', '###########'];
const X_M = ['###########', '#....X....#', '#..P......#', '###########'];
const EMPTY = ['###########', '#.........#', '#...P.....#', '#.........#', '###########'];

test('D door: E opens it, passable after the anim (~0.55s)', () => {
  const g = makeGame(D_M, -Math.PI / 2); // facing north at the door
  const cell = 11 + 5; // row1 col5
  assert.equal(g.doorH[cell], 0);
  g.input.use = true;
  g.tick(1 / 60);
  assert.ok(g.input.use === false, 'use action consumed');
  assert.ok(g.doorH[cell] > 0, 'door anim started');
  assert.equal(g.view[cell], 8, 'still solid until it passes (solid id for plain doors)');
  for (let i = 0; i < 40; i++) g.tick(1 / 60);
  assert.equal(g.doorH[cell], 1, 'fully open');
  assert.equal(g.view[cell], 0, 'walkable after crossing 0.95');
  g.input.up = true;
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  assert.ok(g.player.y < 1.9, `player walked through (y=${g.player.y.toFixed(2)})`);
});

test('R door without key: denied + message; with key it opens', () => {
  const g = makeGame(R_M, -Math.PI / 2);
  const calls = [];
  g.sfx = (n) => calls.push(n);
  const cell = 11 + 5;
  g.input.use = true;
  g.tick(1 / 60);
  assert.equal(g.doorH[cell], 0, 'stays closed');
  assert.equal(g.message.text, 'NEED THE RED KEYCARD');
  assert.ok(calls.includes('denied'));
  g.player.keyR = true;
  g.input.use = true;
  g.tick(1 / 60);
  for (let i = 0; i < 40; i++) g.tick(1 / 60);
  assert.equal(g.doorH[cell], 1, 'opens with the key');
});

test('B door needs the blue keycard', () => {
  const g = makeGame(B_M, -Math.PI / 2);
  const cell = 11 + 5;
  g.player.keyR = true; // red key doesn't help
  g.input.use = true;
  g.tick(1 / 60);
  assert.equal(g.doorH[cell], 0);
  assert.equal(g.message.text, 'NEED THE BLUE KEYCARD');
  g.player.keyB = true;
  g.input.use = true;
  g.tick(1 / 60);
  for (let i = 0; i < 40; i++) g.tick(1 / 60);
  assert.equal(g.doorH[cell], 1);
});

test('secret wall opens like a door and counts once (SECRET FOUND)', () => {
  const g = makeGame(S_M, -Math.PI / 2);
  const cell = 11 + 5;
  g.input.use = true;
  g.tick(1 / 60);
  assert.equal(g.stats.secrets, 1);
  assert.equal(g.message.text, 'SECRET FOUND');
  for (let i = 0; i < 40; i++) g.tick(1 / 60);
  g.input.use = true;
  g.tick(1 / 60); // second use on the open secret
  assert.equal(g.stats.secrets, 1, 'counted only once per level');
  assert.equal(g.doorH[cell], 1);
});

test('use with nothing interactable ahead: brief denied blip, no crash', () => {
  const g = makeGame(EMPTY, -Math.PI / 2);
  const calls = [];
  g.sfx = (n) => calls.push(n);
  g.input.use = true;
  g.tick(1 / 60);
  g.tick(1 / 60);
  assert.equal(g.state, 'PLAY');
  assert.ok(calls.includes('denied'));
});

// ---------- exit / intermission / won ----------

function exitGame(names) {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = names.map((n) => ({ name: n, startAng: 0, theme: 0, map: X_M }));
  g.loadLevel(0);
  return g;
}

function toExit(g) {
  g.player.x = 5.2;
  g.player.y = 1.9; // right next to the X cell (5.5,1.5)
  g.tick(1 / 60);
}

test('exit use: INTERM then auto-loads the next level', () => {
  const g = exitGame(['T1', 'T2']);
  toExit(g);
  g.input.use = true;
  g.tick(1 / 60);
  assert.equal(g.state, 'INTERM');
  assert.ok(g.intermT > 0);
  assert.equal(g.levelIdx, 0, 'still on the used level during the intermission');
  for (let i = 0; i < 150; i++) g.tick(1 / 60); // 2.5s > 2.4s
  assert.equal(g.state, 'PLAY');
  assert.equal(g.levelIdx, 1, 'advanced to level 2');
  assert.equal(g.map.name, 'T2');
});

test('exit use on the last level: WON', () => {
  const g = exitGame(['ONLY']);
  toExit(g);
  g.input.use = true;
  g.tick(1 / 60);
  assert.equal(g.state, 'WON');
  assert.equal(g.message.text, 'YOU ESCAPED');
});

test('exit is not triggered from far away', () => {
  const g = exitGame(['A', 'B']);
  g.input.use = true;
  g.tick(1 / 60);
  assert.equal(g.state, 'PLAY', 'standing 2.2u from the switch does nothing');
});

// ---------- item rendering smoke ----------

test('items render onto the buffer without throwing', () => {
  const g = makeGame(PICKUP);
  g.state = 'PLAY';
  g.render(null);
  let nz = 0;
  for (let i = 0; i < W * H; i++) if (g.renderer.buf[i]) nz++;
  assert.ok(nz > 100, 'frame is not empty');
});

test('item sprites: 7 types, non-trivial and distinct keys', () => {
  const set = buildItemSprites(null);
  const types = ['health', 'armor', 'ammoP', 'ammoS', 'ammoPl', 'keyR', 'keyB'];
  for (const t of types) {
    assert.ok(set[t], t + ' exists');
    let nz = 0;
    for (let i = 0; i < set[t].tab.length; i++) if (set[t].tab[i]) nz++;
    assert.ok(nz > 50, t + ' has pixels (' + nz + ')');
  }
  let diff = 0;
  for (let i = 0; i < set.keyR.tab.length; i++) if (set.keyR.tab[i] !== set.keyB.tab[i]) diff++;
  assert.ok(diff > 100, 'red and blue keycards differ');
});
