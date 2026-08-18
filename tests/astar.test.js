import test from 'node:test';
import assert from 'node:assert/strict';
import { AStar } from '../src/engine/astar.js';

function grid(rows) {
  const gh = rows.length;
  const gw = rows[0].length;
  const g = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) g[y * gw + x] = rows[y][x] === '#' ? 1 : 0;
  return { g, gw, gh };
}

const astar = new AStar();
const path = new Int16Array(512);

test('straight-line path in open grid', () => {
  const { g, gw, gh } = grid([
    '##########',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '##########',
  ]);
  const n = astar.find(1, 1, 8, 1, g, gw, gh, path);
  assert.equal(n, 8);
  for (let i = 0; i < n; i++) {
    assert.equal(path[i], 1 * gw + (1 + i));
    assert.equal(g[path[i]], 0, 'path must avoid walls');
  }
});

test('L-shaped path around a wall, minimal length', () => {
  const { g, gw, gh } = grid([
    '########',
    '#..##..#',
    '#..##..#',
    '#......#',
    '#..##..#',
    '#......#',
    '########',
  ]);
  const n = astar.find(1, 1, 6, 1, g, gw, gh, path);
  assert.ok(n > 0);
  // manhattan-optimal detour: down 2, across 5, up 2 -> 9 steps = 10 cells
  assert.equal(n, 10);
  // adjacency + validity
  let px = 1, py = 1;
  for (let i = 0; i < n; i++) {
    const cx = path[i] % gw, cy = (path[i] / gw) | 0;
    if (i > 0) assert.ok(Math.abs(cx - px) + Math.abs(cy - py) === 1, 'adjacent steps');
    assert.equal(g[path[i]], 0, 'no walls in path');
    px = cx; py = cy;
  }
});

test('no path returns 0', () => {
  const { g, gw, gh } = grid([
    '########',
    '#.##..#.',
    '#.##..#.',
    '#.##..#.',
    '#.##..#.',
    '#...#..#',
    '########',
  ]);
  assert.equal(astar.find(1, 1, 6, 1, g, gw, gh, path), 0);
});

test('start equals end returns 1-cell path', () => {
  const { g, gw, gh } = grid([
    '###',
    '#.#',
    '###',
  ]);
  assert.equal(astar.find(1, 1, 1, 1, g, gw, gh, path), 1);
  assert.equal(path[0], gw + 1);
});

test('solid start or target returns 0', () => {
  const { g, gw, gh } = grid([
    '###',
    '#.#',
    '###',
  ]);
  assert.equal(astar.find(0, 1, 1, 1, g, gw, gh, path), 0);
  assert.equal(astar.find(1, 1, 0, 1, g, gw, gh, path), 0);
});

test('large open field corner-to-corner finds a short-ish path fast', () => {
  const N = 48;
  const g = new Uint8Array(N * N);
  for (let x = 0; x < N; x++) { g[x] = 1; g[(N - 1) * N + x] = 1; }
  for (let y = 0; y < N; y++) { g[y * N] = 1; g[y * N + N - 1] = 1; }
  const t0 = performance.now();
  const n = astar.find(1, 1, N - 2, N - 2, g, N, N, path);
  const ms = performance.now() - t0;
  assert.ok(n > 0, 'path found');
  assert.equal(n, 2 * (N - 3) + 1, 'manhattan-optimal length');
  assert.ok(ms < 50, `fast: ${ms.toFixed(2)}ms`);
});

test('A* reuses instance across calls (no growth, deterministic)', () => {
  const { g, gw, gh } = grid([
    '#######',
    '#.#.#.#',
    '#.#.#.#',
    '#.....#',
    '#######',
  ]);
  const n1 = astar.find(1, 1, 5, 1, g, gw, gh, path);
  assert.equal(n1, 9);
  for (let i = 0; i < 50; i++) astar.find(1, 1, 5, 1, g, gw, gh, path);
  assert.equal(astar.find(1, 1, 5, 1, g, gw, gh, path), n1, 'stable across runs');
});
