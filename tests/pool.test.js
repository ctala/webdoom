import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from '../src/engine/pool.js';

test('pool acquires all items exactly once, then null', () => {
  const p = new Pool(4, (i) => ({ v: i }));
  const got = [];
  for (let i = 0; i < 4; i++) got.push(p.acquire());
  assert.equal(p.acquire(), null);
  const seen = got.map(o => o.v).sort((a, b) => a - b);
  assert.deepEqual(seen, [0, 1, 2, 3]);
});

test('released items are recycled (LIFO free-list)', () => {
  const p = new Pool(2, () => ({ active: false }));
  const a = p.acquire(); // highest free idx
  const b = p.acquire();
  assert.equal(p.acquire(), null);
  p.release(a);
  const c = p.acquire();
  assert.equal(c, a, 'last released is first reused');
  p.release(c);
  p.release(b);
  assert.equal(p.acquire(), b, 'LIFO order after both releases');
  assert.equal(p.acquire(), a);
  assert.equal(p.acquire(), null);
});

test('every acquired item has a unique _poolIdx and stays in the pool', () => {
  const p = new Pool(8, (i) => ({ id: i }));
  const seen = [];
  for (let i = 0; i < 8; i++) seen.push(p.acquire());
  const idxs = seen.map(o => o._poolIdx).sort((x, y) => x - y);
  assert.deepEqual(idxs, [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const o of seen) assert.equal(p.items[o._poolIdx], o);
});
