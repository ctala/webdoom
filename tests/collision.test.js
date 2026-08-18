import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCircle, pointBlocked } from '../src/engine/collision.js';

function grid(rows) {
  const gh = rows.length;
  const gw = rows[0].length;
  const g = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) g[y * gw + x] = rows[y][x] === '#' ? 1 : 0;
  return { g, gw, gh };
}

const mv = new Float64Array(2);
const R = 0.3;

test('blocked move clamps to the wall face', () => {
  const { g, gw, gh } = grid([
    '########',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '########',
  ]);
  moveCircle(4.5, 4, R, 10, 0, g, gw, gh, mv); // smashes into east wall (x=7)
  assert.ok(mv[0] < 7 - R + 0.21, 'should stop before the wall');
  assert.ok(mv[0] > 6.0, 'should actually move forward');
  assert.equal(mv[1], 4);
  assert.ok(pointBlocked(mv[0] + 0.5, 4, R, g, gw, gh), 'just past the stop is blocked');
});

test('slide: axis blocked on X, free on Y (corner walking)', () => {
  const { g, gw, gh } = grid([
    '########',
    '##.....#',
    '##.....#',
    '##.....#',
    '##.....#',
    '##.....#',
    '##.....#',
    '########',
  ]);
  // wall block occupies x=0..1 (face at x=2). Player hugs the face (x = 2+r)
  // and wants to move INTO the wall while sliding down.
  moveCircle(2.3, 1.5, R, -0.5, 2.0, g, gw, gh, mv);
  assert.ok(mv[0] > 2.2 && mv[0] <= 2.31, 'X stays tight against the face, got ' + mv[0]);
  assert.ok(Math.abs(mv[1] - 3.5) < 0.01, 'Y kept moving along the wall, got ' + mv[1]);
});

test('no tunneling: fast mover cannot skip a 1-cell obstacle', () => {
  const { g, gw, gh } = grid([
    '##########',
    '#...#....#',
    '#...#....#',
    '#...#....#',
    '#...#....#',
    '#...#....#',
    '##########',
  ]);
  // single-column wall at x=4 (face at x=4.0); player flies +X at 4.5 cells/frame
  moveCircle(1.5, 3.5, 0.25, 4.5, 0, g, gw, gh, mv);
  assert.ok(mv[0] > 3.3, 'should travel most of the way, got ' + mv[0]);
  assert.ok(mv[0] < 4 - 0.25 + 0.21, 'stopped by the obstacle face, got ' + mv[0]);
  assert.ok(mv[0] < 4.5, 'cannot tunnel to the far side');
});

test('no tunneling with a 1-cell-wide gate at high speed', () => {
  // 1-cell vertical gap between two tall walls
  const rows = [
    '############',
    '#####....#..',
  ];
  void rows;
  const { g, gw, gh } = grid([
    '############',
    '#...###....#',
    '#...###....#',
    '#...###....#',
    '#...###....#',
    '#...###....#',
    '############',
  ]);
  moveCircle(1.5, 3.5, 0.25, 9.0, 0, g, gw, gh, mv);
  // wall block at x=4..5 (face at x=4.0); player must stop ~4.0 - r
  assert.ok(mv[0] > 3.4, 'traveled most of the way, got ' + mv[0]);
  assert.ok(mv[0] < 4 - 0.25 + 0.21, 'no tunneling through thick wall, got ' + mv[0]);
});

test('diagonal movement around a free corner is allowed', () => {
  const { g, gw, gh } = grid([
    '#######',
    '#..#..#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ]);
  // obstacle at (3,1); sweep diagonally under it
  const blocked = moveCircle(2.2, 1.8, 0.25, 2.0, 0.9, g, gw, gh, mv);
  assert.equal(blocked, true);
  assert.ok(mv[1] > 1.8, 'still gained Y progress (sliding)');
});

test('pointBlocked detects out-of-bounds as blocked', () => {
  const { g, gw, gh } = grid([
    '###',
    '#.#',
    '###',
  ]);
  assert.ok(pointBlocked(0.2, 1, R, g, gw, gh));
  assert.ok(pointBlocked(1, 1, R, g, gw, gh), 'circle touching a wall corner is blocked');
  assert.ok(!pointBlocked(1.5, 1.5, R, g, gw, gh));
});
