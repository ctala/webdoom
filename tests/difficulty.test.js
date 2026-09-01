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

test('mobMul scales enemy count; boss never added or removed', () => {
  const counts = [];
  let scattered = 0;
  for (let d = 0; d < 4; d++) {
    const g = makeGame();
    setDifficulty(g, d);
    g.loadLevel(2);
    const ps = g.map.player;
    let boss = 0;
    for (let i = 0; i < g.enemyCount; i++) {
      const e = g.enemies[i];
      if (e.type === 'boss') boss++;
      assert.equal(g.map.solid[Math.floor(e.y) * g.map.gw + Math.floor(e.x)], 0,
        DIFFS[d].name + ': spawned on open ground');
      if (d >= 2 && !g.map.ents.some((o) => o.x === e.x && o.y === e.y)) {
        // hard-mode extras must be SCATTERED, not twins next to an original
        assert.ok(Math.hypot(e.x - ps.x, e.y - ps.y) > 4.9,
          DIFFS[d].name + `: extra spawn ${e.x},${e.y} far from player start`);
        for (const o of g.map.ents) {
          assert.ok(Math.hypot(e.x - o.x, e.y - o.y) > 2.4,
            DIFFS[d].name + ': extras are not glued to map spawns');
        }
        scattered++;
      }
    }
    assert.equal(boss, 1, DIFFS[d].name + ': exactly one Warden');
    counts.push(g.enemyCount);
  }
  // E3M1 map spawns: ITYTD drops every third non-boss, Nightmare scatters more
  const mapCount = g2 => g2.map.ents.filter((e) => ENEMY_DEF[e.type]).length;
  const gm = makeGame(); gm.loadLevel(2);
  assert.equal(counts[1], mapCount(gm), 'HMP = map count');
  assert.ok(counts[0] < counts[1], `ITYTD thinner (${counts[0]})`);
  assert.ok(counts[2] > counts[1] && counts[3] > counts[2], `more mobs when harder (${counts})`);
  assert.ok(scattered >= 3, `harder diffs scattered extras (${scattered})`);
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
