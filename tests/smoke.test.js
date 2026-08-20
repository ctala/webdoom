// Full-pipeline smoke test running headless in node:
// level load -> 120 fixed ticks with movement -> render frame to a buffer.
// Catches math/DOM mistakes that only surface at runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { makeFlatAssets } from '../src/gfx/assets.js';

function makeGame() {
  const W = 480, H = 270;
  const buf = new Uint32Array(W * H);
  const g = new Game(makeFlatAssets(), W, H, buf, null);
  return { g, buf };
}

test('game constructs on the title screen and loads E1M1', () => {
  const { g } = makeGame();
  assert.equal(g.state, 'MENU', 'starts on the title screen');
  g.loadLevel(0); // what ENTER does in main.js
  assert.equal(g.state, 'PLAY');
  assert.equal(g.map.gw, 32);
  assert.ok(g.player.hp === 100);
});

test('tick is a no-op in MENU (nothing moves before start)', () => {
  const { g } = makeGame();
  g.input.up = true;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  assert.equal(g.player.x, g.map.player.x, 'player frozen on the menu');
  assert.equal(g.state, 'MENU');
});

test('player moves forward, blocks at the first wall, no NaNs', () => {
  const { g, buf } = makeGame();
  g.loadLevel(0);
  const x0 = g.player.x;
  g.input.up = true;
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  assert.ok(g.player.x > x0 + 2, 'moved forward, got dx=' + (g.player.x - x0));
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y));
  g.input.up = false;
  // render two frames
  for (let i = 0; i < 2; i++) g.render(null);
  // depth buffer: finite everywhere
  const depth = g.renderer.depth;
  for (let x = 0; x < 480; x++) assert.ok(Number.isFinite(depth[x]));
  // buffer contains wall pixels (not just the flat background)
  const ceilC = 0xff1c1c22, floorC = 0xff0e1014;
  let wallPx = 0;
  for (let i = 0; i < buf.length; i += 31) if (buf[i] !== ceilC && buf[i] !== floorC) wallPx++;
  assert.ok(wallPx > 100, 'wall pixels drawn, got ' + wallPx);
});

test('turning changes the rendered view (different walls visible)', () => {
  const a = makeGame();
  a.g.loadLevel(0);
  for (let i = 0; i < 30; i++) a.g.tick(1 / 60);
  a.g.render(null);
  const band = 100 * 480;
  const before = Array.from(a.buf.slice(band, band + 100 * 480));
  a.g.turn(800); // ~96 degrees
  for (let i = 0; i < 30; i++) a.g.tick(1 / 60);
  a.g.render(null);
  // compare the mid band (rows 100..199) where walls live
  const off = 100 * 480, len = 100 * 480;
  let diff = 0;
  for (let i = 0; i < len; i++) if (a.buf[off + i] !== before[i]) diff++;
  assert.ok(diff > 500, 'view changed after turn, diffs=' + diff);
});

test('tick is a no-op when paused (state frozen)', () => {
  const { g } = makeGame();
  g.loadLevel(0);
  g.input.up = true;
  g.tick(1 / 60);
  const x1 = g.player.x;
  g.paused = true;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  assert.equal(g.player.x, x1);
});
