import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, W_BRICK, W_TECH, DOOR_ID_BASE, H_NORM, H_TALL, H_LOW } from '../src/engine/map.js';

const tiny = [
  '#####',
  '#P.i#',
  '#.1.2',
  '#DT.L',
  '#R.kS',
  '#####',
];

test('parseLevel: dimensions, player, doors, entities', () => {
  const m = parseLevel(tiny, 'TEST');
  assert.equal(m.gw, 5);
  assert.equal(m.gh, 6);
  assert.deepEqual(m.player, { x: 1.5, y: 1.5 });
  // imp at (3,1) and key at (3,4)
  assert.deepEqual(m.ents.map(e => e.type).sort(), ['imp', 'keyR']);
  // walls
  assert.equal(m.solid[1 * 5 + 0], W_BRICK);
  assert.equal(m.solid[2 * 5 + 2], W_TECH);
  // doors
  assert.equal(m.solid[3 * 5 + 1], DOOR_ID_BASE);       // D type 0
  assert.equal(m.solid[4 * 5 + 1], DOOR_ID_BASE + 1);   // R
  assert.equal(m.solid[4 * 5 + 4], DOOR_ID_BASE + 3);   // S
  assert.equal(m.doorType[3 * 5 + 1], 1);
  assert.equal(m.doorType[4 * 5 + 1], 2);
  assert.equal(m.doorType[4 * 5 + 4], 4);
  // heights incl. tall ('T' at 2,3) and low ('L' at 4,3)
  assert.equal(m.solid[3 * 5 + 2], W_BRICK);
  assert.equal(m.heights[3 * 5 + 2], H_TALL);
  assert.equal(m.heights[3 * 5 + 4], H_LOW);
  assert.equal(m.heights[0], H_NORM, 'border wall is normal height');
});

test('parseLevel: border auto-patched when a row is short or edge open', () => {
  const m = parseLevel(['...#', 'P'], 'SHORT');
  assert.equal(m.gw, 4);
  assert.ok(m.solid[0 * 4 + 0] !== 0, 'top-left patched');
  assert.ok(m.solid[m.gh * 4 - 1] !== 0, 'bottom-right patched');
  assert.ok(m.solid[1 * 4 + 0] !== 0, 'left edge patched');
});

test('parseLevel: unknown chars become solid walls (safe default)', () => {
  const m = parseLevel(['###', 'Z.#', '###'], 'UNK');
  assert.equal(m.solid[1 * 3 + 0], W_BRICK);
  assert.equal(m.heights[1 * 3 + 0], H_NORM);
});

test('parseLevel: exit switch located when present, else null', () => {
  const m1 = parseLevel(['###', 'X.#', '###'], 'X');
  assert.deepEqual(m1.exit, { x: 0.5, y: 1.5 });
  const m2 = parseLevel(['###', '.P.', '###'], 'NOX');
  assert.equal(m2.exit, null);
});

test('tall walls parse with H_TALL', () => {
  const m = parseLevel(['###', 'T.#', '###'], 'T');
  assert.equal(m.solid[1 * 3 + 0], W_BRICK);
  assert.equal(m.heights[1 * 3 + 0], H_TALL);
});
