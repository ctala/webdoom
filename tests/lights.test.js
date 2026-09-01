// Dynamic lights + gibs (post-base stage 3, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { pointLightAdd } from '../src/engine/light.js';
import { damageEnemy } from '../src/game/enemy.js';
import { ST } from '../src/engine/fsm.js';

const W = 480, H = 270;
function makeGame() {
  return new Game(makeTables(null), W, H, new Uint32Array(W * H));
}

test('pointLightAdd: full at center, quadratic falloff, zero past radius', () => {
  assert.equal(pointLightAdd(0, 4, 10), 10);
  assert.equal(pointLightAdd(4, 4, 10), 0);
  assert.equal(pointLightAdd(6, 4, 10), 0);
  const half = pointLightAdd(2, 4, 10);
  assert.ok(Math.abs(half - 2.5) < 1e-9, `quadratic (${half})`);
});

test('render wires <=8 lights (flash + plasma bolts) into the renderer', () => {
  const g = makeGame();
  g.loadLevel(0);
  g.player.flash = 1;
  // fire some plasma bolts so the pool is active
  g.player.weapon = 4; g.player.ammoPl = 50;
  for (let i = 0; i < 3; i++) { g.player.wpnCd = 0; g.input.fire = true; g.tick(1 / 60); g.input.fire = false; }
  g.render(null);
  assert.ok(g.renderer.lights.length >= 1 && g.renderer.lights.length <= 8, 'light pool sane');
  let bolts = 0;
  g.projectiles.each((pr) => { if (pr.active && pr.kind === 'plasma') bolts++; });
  assert.equal(g.renderer.lights.includes(g._lights[0]), true);
});

test('gib burst: heavy damage out-spills a normal kill', () => {
  const countActive = (g) => { let n = 0; g.particles.each((q) => { if (q.active) n++; }); return n; };
  const weak = makeGame();
  weak.loadLevel(0);
  let e = weak.enemies[0];
  e.hp = 10;
  damageEnemy(weak, e, 10); // kills under the gib threshold
  const nWeak = countActive(weak);
  const strong = makeGame();
  strong.loadLevel(0);
  e = strong.enemies.find((x) => x.state !== ST.DEATH);
  e.hp = 10;
  damageEnemy(strong, e, 40);
  const nStrong = countActive(strong);
  assert.ok(nStrong > nWeak + 10, `gibs spew more (${nWeak} weak vs ${nStrong} heavy)`);
});
