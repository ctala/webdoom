import test from 'node:test';
import assert from 'node:assert/strict';
import { shadeTable, makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { makeFlatAssets } from '../src/gfx/assets.js';

const r = (t, texel, L) => t[(texel << 6) | L] & 0xff;
const g = (t, texel, L) => (t[(texel << 6) | L] >> 8) & 0xff;
const b = (t, texel, L) => (t[(texel << 6) | L] >> 16) & 0xff;

test('shadeTable: brightness is monotone in level and clamped', () => {
  const rgba = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 200; rgba[i + 1] = 160; rgba[i + 2] = 120; rgba[i + 3] = 255; }
  const t = shadeTable(rgba);
  for (let L = 0; L < 31; L++) {
    assert.ok(r(t, 100, L + 1) >= r(t, 100, L), 'r monotone at ' + L);
    assert.ok(g(t, 100, L + 1) >= g(t, 100, L), 'g monotone at ' + L);
  }
  assert.equal(r(t, 100, 31), 200); // full brightness recovers the source
  assert.equal(r(t, 100, 0), 0);
  assert.equal(r(t, 100, 63), (200 * 0.72) | 0); // top side level = dimmed max
});

test('makeTables: deterministic and complete', () => {
  const a = makeTables(null);
  const c = makeTables(null);
  for (const id of [1, 2, 3, 4, 8, 9, 10, 11]) {
    assert.ok(a.wallTable[id], 'wall ' + id + ' exists');
    assert.equal(a.wallTable[id].length, 64 * 64 * 64);
    // strict determinism across the whole table for a couple of walls
    for (let tx = 0; tx < 4096; tx += 97) {
      assert.equal(a.wallTable[id][(tx << 6) | 31], c.wallTable[id][(tx << 6) | 31]);
      assert.equal(a.wallTable[id][(tx << 6) | 40], c.wallTable[id][(tx << 6) | 40]);
    }
  }
  assert.equal(a.floorTables.length, 3);
  for (const th of a.floorTables) assert.ok(th.floor && th.ceil);
});

test('brick texture has dark mortar rows and lit faces', () => {
  const a = makeTables(null);
  const t = a.wallTable[1];
  // y=0 is always mortar: dark. Mid-brick row y=4: bright.
  const mortar = r(t, 5, 31);
  const brickA = r(t, (4 * 64 + 8), 31);
  assert.ok(mortar < 70, 'mortar dark, got ' + mortar);
  assert.ok(brickA > 100, 'brick bright, got ' + brickA);
  // side-dim level 48 (=16 side) must be darker than level 16
  assert.ok(r(t, 300, 48) < r(t, 300, 16));
});

test('floor tables: seams darker than plate centers', () => {
  const a = makeTables(null);
  const f = a.floorTables[0].floor;
  const seam = r(f, 0, 31) + g(f, 0, 31);            // (0,0) seam corner
  const mid = r(f, (8 * 64 + 8), 31) + g(f, (8 * 64 + 8), 31);
  assert.ok(seam < mid, `seam ${seam} < mid ${mid}`);
});

test('full render with real textures: floor + ceiling rows vary per column', () => {
  const W = 480, H = 270;
  const buf = new Uint32Array(W * H);
  const game = new Game(makeTables(null), W, H, buf, null);
  game.input.up = true;
  for (let i = 0; i < 45; i++) game.tick(1 / 60); // walk toward the first wall
  game.render(null);
  // floor row 200: must not be a uniform color (per-column texel sampling)
  let distinct = new Set();
  for (let x = 0; x < W; x += 4) distinct.add(buf[200 * W + x]);
  assert.ok(distinct.size > 8, 'floor has texture variety, got ' + distinct.size + ' colors');
  // ceiling row 30 similar
  distinct = new Set();
  for (let x = 0; x < W; x += 4) distinct.add(buf[30 * W + x]);
  assert.ok(distinct.size > 8, 'ceiling has texture variety, got ' + distinct.size);
  // distance fog: near floor row (265) is brighter on average than far row (195)
  const lum = (px) => (px & 0xff) + ((px >> 8) & 0xff) + ((px >> 16) & 0xff);
  let near = 0, far = 0;
  for (let x = 160; x < 320; x += 8) {
    near += lum(buf[265 * W + x]);
    far += lum(buf[195 * W + x]);
  }
  assert.ok(near > far, `fog: near ${near} > far ${far}`);
});

test('variable-height walls: top offsets for 1u / 2u / 3u at known distance', () => {
  const W = 480, H = 270;
  const ceilC = 0xff1c1c22;
  const topWallRow = (buf) => {
    for (let y = 0; y < H; y++) if (buf[y * W + W / 2 | 0] !== ceilC) return y;
    return -1;
  };
  // player at (1.5,4.5) facing +X; wall face at x=4.0 -> d = 2.5
  for (const [ch, units, expectTop] of [['T', 3, 27], ['#', 2, 81], ['L', 1, 135]]) {
    const map = [
      '##########',
      '#........#',
      '#........#',
      '#........#',
      '#P..' + ch + ch + ch + '..#',
      '#........#',
      '#........#',
      '##########',
    ];
    const buf = new Uint32Array(W * H);
    const game = new Game(makeFlatAssets(), W, H, buf, null);
    game.levels = [{ name: 'H', startAng: 0, theme: 0, map }];
    game.loadLevel(0);
    game.render(null);
    const top = topWallRow(buf);
    assert.ok(Math.abs(top - expectTop) <= 3, `${ch}(${units}u) top row ${top} ~ ${expectTop}`);
  }
});

test('flat assets still work alongside real ones (regression)', () => {
  const W = 480, H = 270;
  const buf = new Uint32Array(W * H);
  const game = new Game(makeFlatAssets(), W, H, buf, null);
  for (let i = 0; i < 30; i++) game.tick(1 / 60);
  game.render(null);
  let wallPx = 0;
  for (let i = 0; i < buf.length; i += 37) if ((buf[i] & 0xffffff) !== 0x0e1014 && (buf[i] & 0xffffff) !== 0x1c1c22) wallPx++;
  assert.ok(wallPx > 150, 'flat walls drawn, got ' + wallPx);
});
