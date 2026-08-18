import test from 'node:test';
import assert from 'node:assert/strict';
import { castRay, hasLOS, rayDistance } from '../src/engine/raycaster.js';

const out = { perp: 0, side: 0, cellX: 0, cellY: 0, hitId: 0, texX: 0 };

function borderGrid(w = 8, h = 8, id = 1) {
  const g = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { g[x] = id; g[(h - 1) * w + x] = id; }
  for (let y = 0; y < h; y++) { g[y * w] = id; g[y * w + w - 1] = id; }
  return g;
}

test('castRay hits the south border 4.5 perpendicular away', () => {
  const g = borderGrid(8, 8);
  assert.ok(castRay(4, 2.5, 0, 1, g, 8, 8, out));
  assert.equal(out.perp, 4.5); // 8 - 2.5 along the y-axis
  assert.equal(out.side, 1);
  assert.equal(out.cellX, 4);
  assert.equal(out.cellY, 7);
  assert.equal(out.hitId, 1);
});

test('castRay diagonal 45deg stops at the first corner face (perp = s-param)', () => {
  const g = borderGrid(8, 8, 2);
  assert.ok(castRay(1.5, 1.5, 1, 1, g, 8, 8, out));
  // corner at (7,7): ray parameter s = 5.5; DDA resolves the tie on Y (side 1)
  assert.ok(Math.abs(out.perp - 4.5) < 1e-6 || Math.abs(out.perp - 5.5) < 1e-6, 'perp=' + out.perp);
  assert.ok(out.cellX === 6 || out.cellX === 7, 'cellX=' + out.cellX);
  assert.ok(out.cellY === 6 || out.cellY === 7, 'cellY=' + out.cellY);
  assert.equal(out.hitId, 2);
});

test('castRay misses on a fully open grid', () => {
  const g = new Uint8Array(16 * 16);
  assert.equal(castRay(8, 8, 0.7, 0.7, g, 16, 16, out), false);
  assert.equal(out.hitId, 0);
  assert.equal(rayDistance(8, 8, 1, 0, g, 16, 16, out), Infinity);
});

test('castRay texX fraction tracks the hit face coordinate', () => {
  const g = new Uint8Array(8 * 8);
  for (let y = 0; y < 8; y++) g[y * 8 + 5] = 3; // vertical wall column x=5
  assert.ok(castRay(1.3, 3.2, 1, 0, g, 8, 8, out));
  assert.equal(out.side, 0);
  assert.ok(Math.abs(out.perp - (5 - 1.3)) < 1e-9);
  assert.ok(Math.abs(out.texX - 0.2) < 1e-9); // hit at world y=3.2
});

test('castRay side flag distinguishes E/W (0) from N/S (1) faces', () => {
  const g = borderGrid(8, 8);
  castRay(4, 4, 1, 0, g, 8, 8, out);
  assert.equal(out.side, 0);
  castRay(4, 4, 0, 1, g, 8, 8, out);
  assert.equal(out.side, 1);
});

test('hasLOS true through open space, false when walled off', () => {
  const g = borderGrid(9, 9);
  assert.ok(hasLOS(2, 4, 6, 4, g, 9, 9, out));
  g[4 * 9 + 4] = 1; // wall in between
  assert.equal(hasLOS(2, 4, 6, 4, g, 9, 9, out), false);
  g[4 * 9 + 4] = 0;
  g[4 * 9 + 3] = 1; // wall just behind the source
  assert.equal(hasLOS(3.4, 4, 6, 4, g, 9, 9, out), false);
  g[4 * 9 + 3] = 0;
});

test('hasLOS to a target just behind the target cell is true', () => {
  const g = borderGrid(9, 9);
  g[4 * 9 + 5] = 1; // wall 1 cell past the target
  assert.ok(hasLOS(2, 4, 4.5, 4, g, 9, 9, out));
});

test('castRay marks reveal buffer along the flight path', () => {
  const g = borderGrid(8, 8);
  const rev = new Uint8Array(64);
  castRay(1.5, 4, 1, 0, g, 8, 8, out, rev);
  assert.ok(rev[4 * 8 + 2] && rev[4 * 8 + 3] && rev[4 * 8 + 4] && rev[4 * 8 + 5]);
  assert.equal(rev[0 * 8 + 0], 0);
});
