// Lost Soul, Baron, Pain Elemental (post-base stage 5, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { buildSprites } from '../src/gfx/sprites.js';
import { updateEnemies, spawnEnemy, ENEMY_DEF, ENEMY_MAX } from '../src/game/enemy.js';
import { ST } from '../src/engine/fsm.js';

const W = 480, H = 270;
const ROOM = [
  '############',
  '#...........',
  '#...........',
  '#P..........',
  '#...........',
  '#...........',
  '############',
];
function makeGame() {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng: 0, theme: 0, map: ROOM }];
  g.loadLevel(0);
  return g;
}

test('sprites: the three new types build full animation sets', () => {
  const sp = buildSprites(null);
  for (const t of ['lostsoul', 'baron', 'pain']) {
    assert.ok(sp[t], t + ' built');
    assert.equal(sp[t].walk.length, 4, t + ' walk');
    assert.equal(sp[t].atk.length, 4, t + ' atk');
    assert.ok(sp[t].corpse[0].length > 0, t + ' corpse');
  }
});

test('lost soul: sprints on sight and burns the player up close', () => {
  const g = makeGame();
  const ok = spawnEnemy(g, 'lostsoul', 8.5, 3.5);
  assert.ok(ok, 'spawned');
  const e = g.enemies[g.enemyCount - 1];
  const hp0 = g.player.hp;
  let t = 0;
  while (t < 5 && g.player.hp === hp0) { updateEnemies(g, 1 / 60); t += 1 / 60; }
  assert.ok(t < 3, `reaches the player fast (contact at ${t.toFixed(1)}s)`);
  assert.ok(g.player.hp < hp0, 'burning melee hurt');
});

test('baron: two-bolt spread on attack', () => {
  const g = makeGame();
  spawnEnemy(g, 'baron', 9.5, 3.5);
  const e = g.enemies[g.enemyCount - 1];
  g.projectiles.each((p) => { p.active = false; });
  e.state = ST.ATTACK; e.cd = 0;
  updateEnemies(g, 1 / 60);
  let n = 0;
  g.projectiles.each((p) => { if (p.active && p.owner === 0) n++; });
  assert.equal(n, 2, `twin bolts (${n})`);
});

test('pain elemental: births imps while fighting, pool-cap respected', () => {
  const g = makeGame();
  spawnEnemy(g, 'pain', 2.6, 3.5); // inside its melee range so it holds ATTACK
  const e = g.enemies[g.enemyCount - 1];
  e.state = ST.ATTACK; e.cd = 99;
  const n0 = g.enemyCount;
  for (let i = 0; i < 60 * 6; i++) updateEnemies(g, 1 / 60); // 6s -> one spawn at cd 5
  assert.equal(g.enemyCount, n0 + 1, 'one imp birthed');
  assert.ok(g.enemies.some((x, i) => i < g.enemyCount && x.type === 'imp'), 'imp present');
  assert.ok(g.stats.totalKills >= n0 + 1, 'birthed imp counts in stats');
});

test('spawnEnemy: respects the pool ceiling', () => {
  const g = makeGame();
  let placed = 0;
  for (let i = 0; i < ENEMY_MAX + 10; i++) if (spawnEnemy(g, 'imp', 8.5, 5.5)) placed++;
  assert.equal(placed, ENEMY_MAX, `capped at ENEMY_MAX (${placed})`);
  assert.equal(g.enemyCount, ENEMY_MAX);
});
