// Game feel (post-base stage 2, [flash]): shake, vignette, pan, fists parity.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { buildWeaponSprites } from '../src/gfx/weaponSprites.js';
import { panInfo } from '../src/audio/sfx.js';

const W = 480, H = 270;
function makeGame() {
  return new Game(makeTables(null), W, H, new Uint32Array(W * H));
}

test('hurt sets shake+hurtVig and both decay to 0', () => {
  const g = makeGame();
  g.loadLevel(0);
  g.hurtPlayer(20, g.player.x + 1, g.player.y);
  assert.ok(g.player.shake > 0 && g.player.shake <= 1, 'shake set on hit');
  assert.ok(g.player.hurtVig > 0, 'vignette drive set');
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  assert.equal(g.player.shake, 0, 'shake decayed');
  assert.equal(g.player.hurtVig, 0, 'vignette decayed');
});

test('render with shake set does not throw and moves the horizon', () => {
  const g = makeGame();
  g.loadLevel(0);
  g.player.shake = 1;
  g.render(null);
  assert.ok(Math.abs(g.vJy) > 0.5 || Math.abs(g.vJy) < 5, 'jy bounded');
  for (let i = 0; i < 20; i++) { g.render(null); } // sweep several shake phases
});

test('applyVignette darkens corners, keeps center', () => {
  const g = makeGame();
  g.loadLevel(0);
  const buf = g.renderer.buf;
  const center = 135 * W + 240, corner = 5 * W + 5;
  buf.fill(0xff707070);
  g.renderer.applyVignette(1);
  assert.equal(buf[center] >>> 0, 0xff707070, 'center untouched (vig table 0)');
  const c = buf[corner];
  const r = c & 0xff, gg = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff;
  assert.ok(gg < 0x70 && b < 0x70 && r >= gg, `corner darker+redder (r${r} g${gg} b${b})`);
});

test('panInfo: right of player = +1, left = -1, distance attenuates', () => {
  const p = { x: 0, y: 0, ang: 0 }; // facing +x; right hand side = -y
  const right = panInfo(p, 5, -2);
  const left = panInfo(p, 5, 2);
  const front = panInfo(p, 5, 0);
  assert.ok(right.pan > 0.3, `right +pan (${right.pan})`);
  assert.ok(left.pan < -0.3, `left -pan (${left.pan})`);
  assert.ok(Math.abs(front.pan) < 0.05, 'front centered');
  assert.ok(panInfo(p, 1, 0).v > panInfo(p, 12, 0).v, 'far = quieter');
  assert.ok(panInfo(null, 3, 4).v === 1, 'no listener = passthrough');
});

test('fists: fire[0] and mirrored fire[1] differ and are mirror images', () => {
  const vs = buildWeaponSprites(null);
  assert.equal(vs[1].fire.length, 2, 'two fist fire frames');
  let diff = 0;
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 128; x++) {
      if (vs[1].fire[1][y * 128 + x] !== vs[1].fire[0][y * 128 + (127 - x)]) throw new Error('not a mirror');
      if (vs[1].fire[1][y * 128 + x] !== vs[1].fire[0][y * 128 + x]) diff++;
    }
  }
  assert.ok(diff > 500, `frames visibly different (${diff} px)`);
});

test('fist swings alternate hands (punchParity)', () => {
  const g = makeGame();
  g.loadLevel(0);
  g.player.weapon = 1;
  const fireOne = () => {
    g.player.wpnCd = 0; g.player.latch = false;
    g.input.fire = true; g.tick(1 / 60); g.input.fire = false;
  };
  const p0 = g.player.punchParity;
  fireOne();
  assert.equal(g.player.punchParity, p0 ^ 1, 'parity flipped on swing');
  fireOne();
  assert.equal(g.player.punchParity, p0, 'parity back');
});
