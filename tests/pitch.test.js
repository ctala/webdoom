// Pitch / vertical look via horizon shear (post-base stage 8, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';

const W = 480, H = 270;
const ROOM = [
  '############',
  '#..........#',
  '#P.........#',
  '#..........#',
  '############',
];
function makeGame() {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng: 0, theme: 0, map: ROOM }];
  g.loadLevel(0);
  g._booted = false;
  return g;
}

test('pitchBy clamps to +/-0.42 rad (~24deg)', () => {
  const g = makeGame();
  for (let i = 0; i < 50; i++) g.pitchBy(-0.05);
  assert.ok(Math.abs(g.player.pitch + 0.42) < 1e-9, 'clamped up');
  for (let i = 0; i < 100; i++) g.pitchBy(0.05);
  assert.ok(Math.abs(g.player.pitch - 0.42) < 1e-9, 'clamped down');
  g.centerView();
  assert.equal(g.player.pitch, 0);
});

test('pitch feeds the renderer + sprite shear every tick', () => {
  const g = makeGame();
  g.pitchBy(0.2);
  g.tick(1 / 60);
  const want = Math.tan(0.2) * H * 0.5;
  assert.ok(Math.abs(g.renderer.shear - want) < 1e-6);
  assert.equal(g.spriteR.shear, g.renderer.shear);
  g.centerView();
  g.tick(1 / 60);
  assert.equal(g.renderer.shear, 0, 'centered view restores horizon');
});

test('pitch shifts the wall base down exactly by the shear', () => {
  const g = makeGame();
  g.tick(1 / 60);
  g.render(null);
  const buf0 = g.renderer.buf.slice();
  const sh = 40;
  g.player.pitch = Math.atan((sh * 2) / H); // shear = tan*H/2 = 40
  g.tick(1 / 60);
  g.render(null);
  let moved = 0, seen = 0;
  for (let x = 180; x < 300; x++) {
    for (let y = 136; y <= 146; y++) { // interior wall rows (the exact mid row is a boundary case)
      seen++;
      if (g.renderer.buf[(y + sh) * W + x] === buf0[y * W + x]) moved++;
    }
  }
  assert.ok(moved / seen > 0.9, `wall rows shifted down by ${sh} (${moved}/${seen} pixels)`);
});

test('full render survives extreme pitch (floor loop bounds)', () => {
  const g = makeGame();
  for (const sign of [1, -1]) {
    g.player.pitch = 0.42 * sign;
    g.tick(1 / 60);
    g.render(null);
  }
  assert.ok(true, 'no crash at max up/down shear');
});
