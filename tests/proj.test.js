import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint, camDepth, spriteScale } from '../src/engine/proj.js';

const out = [0, 0];
const M = 0.66;
const W = 480;

test('point ahead of camera projects to screen center', () => {
  const t = projectPoint(10, 10, 1, 0, M, W, 13, 10, out);
  assert.ok(Math.abs(t - 3) < 1e-9);
  assert.ok(Math.abs(out[0] - W / 2) < 1e-6);
});

test('lateral offset moves the point the right way (right vector = f rotated -90deg)', () => {
  // facing +X: -Y is screen-right
  const a = projectPoint(10, 10, 1, 0, M, W, 13, 7, out);
  assert.ok(out[0] > W / 2, 'world -Y side is screen right, got ' + out[0]);
  const b = projectPoint(10, 10, 1, 0, M, W, 13, 13, out);
  assert.ok(out[0] < W / 2, 'world +Y side is screen left, got ' + out[0]);
  assert.ok(a > 0 && b > 0, 'both in front');
});

test('symmetry: ±lateral points mirror around screen center', () => {
  const a = projectPoint(10, 10, 1, 0, M, W, 11, 9, out);
  const xa = out[0];
  const b = projectPoint(10, 10, 1, 0, M, W, 11, 11, out);
  const xb = out[0];
  assert.ok(Math.abs((xa + xb) / 2 - W / 2) < 1e-6);
  assert.ok(a > 0 && b > 0);
});

test('point behind camera is culled', () => {
  const t = projectPoint(10, 10, 1, 0, M, W, 7, 10, out);
  assert.ok(t < 0);
  assert.ok(out[0] < 0, 'flagged behind');
});

test('camDepth matches perpendicular component', () => {
  assert.ok(Math.abs(camDepth(0, 0, 1, 0, 5, 3) - 5) < 1e-9);
  assert.ok(Math.abs(camDepth(0, 0, 0, 1, 2, 7) - 7) < 1e-9);
  // 45deg forward: depth = (rx+ry)/sqrt2
  const c = camDepth(0, 0, Math.SQRT1_2, Math.SQRT1_2, 4, 4);
  assert.ok(Math.abs(c - 4 * Math.SQRT2) < 1e-9);
});

test('sprite scale shrinks with distance and grows with world height', () => {
  const H = 270;
  const near = spriteScale(H, 2, 1);
  const far = spriteScale(H, 8, 1);
  assert.equal(near, 67.5);
  assert.ok(far === near / 4);
  assert.ok(spriteScale(H, 2, 0.5) === near / 2);
});

test('rotation by 90deg keeps geometry consistent', () => {
  // facing +Y (ang=PI/2): straight ahead is +Y, +X must be screen-right
  const cosA = 0, sinA = 1;
  const t = projectPoint(10, 10, cosA, sinA, M, W, 10, 13, out);
  assert.ok(Math.abs(t - 3) < 1e-9, 'depth=' + t);
  assert.ok(Math.abs(out[0] - W / 2) < 1e-6, 'ahead is centered, got ' + out[0]);
  const t2 = projectPoint(10, 10, cosA, sinA, M, W, 13, 13, out);
  assert.ok(t2 > 0 && out[0] > W / 2, 'facing +Y, +X side is right, got ' + out[0]);
});
