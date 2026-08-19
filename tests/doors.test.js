import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { makeTables } from '../src/gfx/textures.js';
import { E1M1 } from '../levels/e1m1.js';

/** Game with a real (node software) texture set, preallocated render buffer. */
function game(rows, startAng = 0) {
  const W = 480, H = 270;
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng, theme: 0, map: rows }];
  g.loadLevel(0);
  return g;
}

// 11x7 room; doors D/R/B/S at distance ~1.5..4 from the camera.
const DOOR_MAP = [
  '###########',
  '#.........#',
  '#..D...R..#',
  '#..P......#',
  '#..B...S..#',
  '#.........#',
  '###########',
];

test('rendering a view that contains door cells does not throw (regression)', () => {
  const g = game(DOOR_MAP, -Math.PI / 2); // facing north, straight at the D wall
  for (let i = 0; i < 120; i++) {
    g.tick(1 / 60);
    g.render(null); // player may walk into the corridor in E1M1-style motion
  }
  // 30-degree sweep so every door cell in the room is seen
  for (let a = -Math.PI; a < Math.PI * 1.001; a += Math.PI / 6) {
    g.player.ang = a;
    g.render(null);
  }
});

test('closed door draws door texture; opening it changes the frame', () => {
  const g = game(DOOR_MAP, -Math.PI / 2);
  g.render(null);
  const { W, H } = g;
  const buf = g.renderer.buf;
  const cx = W / 2;
  const dIdx = 2 * g.map.gw + 3; // cell (x=3,y=2) = the D door directly ahead
  const row = (y) => buf[y * W + cx];
  const closed = [];
  for (let y = 60; y < 210; y += 8) closed.push(row(y));
  assert.ok(closed.some((p) => p !== 0), 'door pixels are not black');

  g.doorH[dIdx] = 0.5; g.rebuildView(); g.render(null);
  let midDiff = 0;
  for (let k = 0; k < closed.length; k++) if (row(60 + k * 8) !== closed[k]) midDiff++;
  assert.ok(midDiff > closed.length / 4, `half-open door changes the frame (${midDiff}/${closed.length})`);

  g.doorH[dIdx] = 1; g.rebuildView(); g.render(null);
  let openDiff = 0;
  for (let k = 0; k < closed.length; k++) if (row(60 + k * 8) !== closed[k]) openDiff++;
  assert.ok(openDiff > closed.length / 4, 'fully open door differs from closed frame');
});

test('E1M1: walking the corridor sees D/R doors and never throws', () => {
  const g = new Game(makeTables(null), 480, 270, new Uint32Array(480 * 270));
  // aim through the corridor gap (5..6,14) and walk north into the door row
  g.player.ang = Math.atan2(14.5 - g.player.y, 5.9 - g.player.x);
  g.input.up = true;
  for (let i = 0; i < 700; i++) {
    g.tick(1 / 60);
    g.render(null);
  }
  assert.equal(g.state, 'PLAY');
  assert.ok(g.player.y < 14.5, 'made it through the gap into the corridor (y=' + g.player.y.toFixed(2) + ')');
});
