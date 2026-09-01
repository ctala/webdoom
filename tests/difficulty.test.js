// Difficulty settings + balance (post-base stage 1, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { DIFFS, setDifficulty, diffOf } from '../src/game/difficulty.js';
import { updateEnemies, ENEMY_DEF } from '../src/game/enemy.js';
import { ST } from '../src/engine/fsm.js';

const W = 480, H = 270;
function makeGame() {
  return new Game(makeTables(null), W, H, new Uint32Array(W * H));
}

test('DIFFS table is ordered and finite', () => {
  assert.equal(DIFFS.length, 4);
  for (let i = 1; i < DIFFS.length; i++) {
    assert.ok(DIFFS[i].dmgTaken >= DIFFS[i - 1].dmgTaken, 'harder takes more dmg');
    assert.ok(DIFFS[i].cdMul <= DIFFS[i - 1].cdMul, 'harder fires faster');
  }
  for (const d of DIFFS) assert.ok(d.name.length > 0 && d.ammoMul > 0);
});

test('setDifficulty wraps both directions', () => {
  const g = makeGame();
  assert.equal(setDifficulty(g, 4), 0);
  assert.equal(setDifficulty(g, -1), 3);
  assert.equal(setDifficulty(g, 1), 1);
  assert.equal(diffOf(g), DIFFS[1]);
});

test('hurtPlayer damage scales with dmgTaken', () => {
  for (let i = 0; i < DIFFS.length; i++) {
    const g = makeGame();
    g.loadLevel(0);
    setDifficulty(g, i);
    const before = g.player.hp;
    g.hurtPlayer(20, g.player.x, g.player.y); // dist 0 -> falloff 1, armor 0
    assert.equal(before - g.player.hp, Math.round(20 * DIFFS[i].dmgTaken), DIFFS[i].name);
  }
});

test('enemy attack cooldown scales with cdMul (Warden testbed)', () => {
  const g = makeGame();
  g.loadLevel(2);
  const e = g.enemies.find((x) => x.type === 'boss');
  e.x = 17.5; e.y = 12.5;
  g.player.x = 13.5; g.player.y = 12.5; // 4u away, in range, clear LOS
  for (const d of [0, 3]) {
    setDifficulty(g, d);
    e.state = ST.ATTACK;
    e.cd = 0;
    updateEnemies(g, 1 / 60);
    assert.ok(e.cd > 0, 'fired and set a cooldown');
    assert.ok(Math.abs(e.cd - ENEMY_DEF.boss.cd * DIFFS[d].cdMul) < 0.02,
      `cd ${e.cd} ~= ${ENEMY_DEF.boss.cd * DIFFS[d].cdMul}`);
  }
});

test('ammo pickups scale with ammoMul', () => {
  const g = makeGame();
  g.loadLevel(0);
  setDifficulty(g, 0); // ITYTD: ammoMul 0.7 -> +PISTOL AMMO 10 becomes 7
  const it = g.items.find((x) => x.active && x.type === 'ammoP');
  assert.ok(it, 'E1M1 has a pistol ammo box');
  it.x = g.player.x + 0.2;
  it.y = g.player.y;
  const before = g.player.ammoP;
  g.tick(1 / 60);
  assert.equal(g.player.ammoP - before, 7);
});
