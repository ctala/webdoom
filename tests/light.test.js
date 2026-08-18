import test from 'node:test';
import assert from 'node:assert/strict';
import { lightLevel, damageFalloff, FOG_DIST } from '../src/engine/light.js';

test('lightLevel is 31 at zero distance and near-max up close', () => {
  assert.equal(lightLevel(0), 31);
  assert.ok(lightLevel(0.1) >= 30);
  assert.ok(lightLevel(0.5) >= 28);
});

test('lightLevel decreases monotonically with distance', () => {
  let prev = 40;
  for (let d = 0; d <= FOG_DIST * 2; d += 0.5) {
    const l = lightLevel(d);
    assert.ok(l <= prev, `non-increasing at d=${d} (l=${l}, prev=${prev})`);
    prev = l;
  }
});

test('side-dimmed light is darker than front light', () => {
  for (const d of [0.5, 1.5, 3, 6, 9, 13, 18]) {
    assert.ok(lightLevel(d, 0, true) <= lightLevel(d, 0, false), `d=${d}`);
  }
});

test('muzzle flash boosts light but clamps at 31', () => {
  assert.ok(lightLevel(8, 1) > lightLevel(8, 0));
  assert.equal(lightLevel(8, 1), 31);
  assert.equal(lightLevel(0.1, 1), 31);
});

test('lightLevel never negative or above 31 across the board', () => {
  for (let d = 0; d <= 40; d += 1) {
    for (const flash of [0, 0.5, 1]) {
      const l = lightLevel(d, flash);
      assert.ok(l >= 0 && l <= 31, `d=${d} flash=${flash} l=${l}`);
    }
  }
});

test('damageFalloff: 1 up close, 0.3 at range, monotone between', () => {
  assert.equal(damageFalloff(0.2, 8), 1);
  assert.equal(damageFalloff(0.4, 8), 1);
  assert.ok(Math.abs(damageFalloff(8, 8) - 0.3) < 1e-9);
  assert.ok(damageFalloff(12, 8) === 0.3);
  let prev = 2;
  for (let d = 0; d <= 12; d += 0.5) {
    const f = damageFalloff(d, 8);
    assert.ok(f <= prev, `monotone at ${d}`);
    prev = f;
  }
});
