import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { makeFlatAssets } from '../src/gfx/assets.js';
import { damageEnemy, ENEMY_DEF } from '../src/game/enemy.js';
import { ST } from '../src/engine/fsm.js';

function mk(rows, startAng = 0) {
  const W = 480, H = 270;
  const g = new Game(makeFlatAssets(), W, H, new Uint32Array(W * H), null);
  g.levels = [{ name: 'T', startAng, theme: 0, map: rows }];
  g.loadLevel(0);
  return g;
}
function arena(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#' : '.';
    rows.push(r);
  }
  return rows;
}
function put(rows, x, y, ch) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
function tickN(g, n) { for (let i = 0; i < n; i++) g.tick(1 / 60); }
function find(g, type) {
  for (let i = 0; i < g.enemyCount; i++) if (g.enemies[i].type === type) return g.enemies[i];
  return null;
}

test('ranged imp wakes on LOS and damages the player with a projectile', () => {
  const rows = arena(14, 13);
  put(rows, 3, 6, 'i');   // imp (3.5, 6.5)
  put(rows, 10, 6, 'P');  // player (10.5, 6.5) -> 7u away, clear LOS
  const g = mk(rows);
  const e = find(g, 'imp');
  assert.ok(e, 'imp spawned');
  tickN(g, 30); // ~0.5s: SLEEP -> ALERT -> ATTACK/CHASE
  assert.notEqual(e.state, ST.SLEEP, 'imp aggros by sight, state=' + e.state);
  const hp0 = g.player.hp;
  tickN(g, 160); // ~2.7s total: fireball (6.5 u/s over ~7u) must have hit
  assert.ok(g.player.hp < hp0, `player took damage (${hp0} -> ${g.player.hp})`);
});

test('enemy behind a full wall does not wake from sight', () => {
  const rows = arena(15, 11);
  for (let y = 1; y < 10; y++) put(rows, 7, y, '#'); // full wall column
  put(rows, 3, 5, 'i');
  put(rows, 11, 5, 'P');
  const g = mk(rows);
  const e = find(g, 'imp');
  tickN(g, 120); // 2s
  assert.equal(e.state, ST.SLEEP, 'no sight, no sound -> still asleep');
});

test('sound propagation wakes a sleeping enemy', () => {
  const rows = arena(15, 11);
  for (let y = 1; y < 10; y++) put(rows, 7, y, '#');
  put(rows, 3, 5, 'i');
  put(rows, 11, 5, 'P');
  const g = mk(rows);
  const e = find(g, 'imp');
  tickN(g, 10);
  assert.equal(e.state, ST.SLEEP);
  g.emitSound(5, 5, 4.5); // gunshot within the imp's hearing radius
  // The wall column is fully sealed, so A* fails and the enemy re-sleeps
  // via targetLost a tick or two after waking; assert it woke in the interim.
  let woke = false;
  for (let i = 0; i < 3; i++) {
    g.tick(1 / 60);
    if (e.state !== ST.SLEEP) woke = true;
  }
  assert.ok(woke, 'heared the sound and woke');
});

test('melee demon closes and damages the player', () => {
  const rows = arena(14, 13);
  put(rows, 5, 6, 'd');  // (5.5, 6.5)
  put(rows, 8, 6, 'P');  // (8.5, 6.5): 3u away
  const g = mk(rows);
  const e = find(g, 'demon');
  assert.ok(e);
  tickN(g, 210); // 3.5s: chase + swing window
  assert.ok(g.player.hp < 100, `demon hit the player (hp ${g.player.hp})`);
  assert.ok(e.state !== ST.DEATH && e.state !== ST.CORPSE, 'demon alive (state ' + e.state + ')');
});

test('killing an enemy: DEATH anim -> CORPSE, kill counted once', () => {
  const rows = arena(14, 13);
  put(rows, 4, 6, 'i');
  put(rows, 7, 6, 'P');
  const g = mk(rows);
  const e = find(g, 'imp');
  const before = g.stats.kills;
  damageEnemy(g, e, 999);
  tickN(g, 5);
  assert.equal(e.state, ST.DEATH, 'entered death anim, got ' + e.state);
  assert.equal(g.stats.kills, before + 1);
  tickN(g, 60); // > 0.75s
  assert.equal(e.state, ST.CORPSE, 'became a corpse');
  damageEnemy(g, e, 50); // corpse takes no further state change
  tickN(g, 5);
  assert.equal(e.state, ST.CORPSE);
});

test('chasing enemy on an A* path never lands inside a wall', () => {
  const rows = arena(16, 12);
  for (let y = 1; y < 9; y++) put(rows, 8, y, '#'); // gap at rows 9-10
  put(rows, 3, 3, 'i');
  put(rows, 12, 3, 'P');
  const g = mk(rows);
  const e = find(g, 'imp');
  assert.ok(e);
  let clipped = false;
  for (let i = 0; i < 600; i++) {
    g.tick(1 / 60);
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    if (g.view[cy * g.map.gw + cx]) { clipped = true; break; }
    if (e.state === ST.ATTACK) break;
  }
  assert.equal(clipped, false, 'enemy never inside a wall cell');
  assert.ok(Math.abs(e.x - g.player.x) < 6 || e.state !== ST.CHASE, 'made progress via the gap');
});

test('caco fires bolts (hover type)', () => {
  const rows = arena(14, 13);
  put(rows, 3, 6, 'v');
  put(rows, 10, 6, 'P');
  const g = mk(rows);
  const e = find(g, 'caco');
  assert.ok(e, 'caco spawned');
  assert.ok(ENEMY_DEF.caco.lift > 0, 'caco has hover lift');
  tickN(g, 220);
  assert.ok(g.player.hp < 100, `caco bolts hit (hp ${g.player.hp})`);
});

test('separation keeps two chasing demons apart', () => {
  const rows = arena(16, 14);
  put(rows, 5, 6, 'd');
  put(rows, 6, 6, 'd');
  put(rows, 13, 6, 'P');
  const g = mk(rows);
  const list = [];
  for (let i = 0; i < g.enemyCount; i++) if (g.enemies[i].type === 'demon') list.push(g.enemies[i]);
  assert.equal(list.length, 2, 'two demons');
  tickN(g, 120);
  const d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  assert.ok(d >= 0.45, `kept apart (dist ${d.toFixed(2)})`);
});

test('projectile pool stays intact through enemy volleys', () => {
  const rows = arena(14, 13);
  put(rows, 3, 6, 'i');
  put(rows, 10, 6, 'P');
  const g = mk(rows);
  tickN(g, 300);
  let active = 0;
  g.projectiles.each((p) => { if (p.active) active++; });
  assert.ok(active >= 0 && active <= 32, 'pool sane, active=' + active);
});
