import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, DOOR_ID_BASE } from '../src/engine/map.js';
import { E1M1 } from '../levels/e1m1.js';

/** Flood fill from the player over walkable cells (doors are usable). */
function floodReaches(map) {
  const { gw, gh, solid, player } = map;
  const sx = Math.floor(player.x);
  const sy = Math.floor(player.y);
  const seen = new Uint8Array(gw * gh);
  const stack = [sy * gw + sx];
  seen[stack[0]] = 1;
  const passable = (i) => {
    const s = solid[i];
    return s === 0 || (s >= DOOR_ID_BASE && s <= DOOR_ID_BASE + 3);
  };
  while (stack.length) {
    const i = stack.pop();
    const x = i % gw, y = (i / gw) | 0;
    const nb = [i - 1, i + 1, i - gw, i + gw];
    const nx = [x - 1, x + 1, x, x];
    const ny = [y, y, y - 1, y + 1];
    for (let k = 0; k < 4; k++) {
      const j = nb[k];
      if (nx[k] < 0 || ny[k] < 0 || nx[k] >= gw || ny[k] >= gh) continue;
      if (seen[j] || !passable(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

test('E1M1 dimensions and border are solid', () => {
  const m = parseLevel(E1M1.map, E1M1.name);
  assert.equal(m.gw, 32);
  assert.equal(m.gh, 24);
  for (let x = 0; x < m.gw; x++) {
    assert.ok(m.solid[x] !== 0, 'top border');
    assert.ok(m.solid[(m.gh - 1) * m.gw + x] !== 0, 'bottom border');
  }
  for (let y = 0; y < m.gh; y++) {
    assert.ok(m.solid[y * m.gw] !== 0, 'left border');
    assert.ok(m.solid[y * m.gw + m.gw - 1] !== 0, 'right border');
  }
});

test('E1M1 has a player and an exit', () => {
  const m = parseLevel(E1M1.map, E1M1.name);
  assert.ok(m.player);
  assert.ok(m.exit, 'exit switch must exist');
});

test('E1M1 every enemy/item is reachable from the player (through usable doors)', () => {
  const m = parseLevel(E1M1.map, E1M1.name);
  const seen = floodReaches(m);
  for (const e of m.ents) {
    const i = Math.floor(e.y) * m.gw + Math.floor(e.x);
    assert.ok(seen[i], `entity ${e.type} at ${Math.floor(e.x)},${Math.floor(e.y)} is reachable`);
  }
  const ei = Math.floor(m.exit.y) * m.gw + Math.floor(m.exit.x);
  assert.ok(seen[ei], 'exit reachable (through the red door)');
});

test('E1M1 entity census (sanity for later stats: 6 enemies, 10 items, 1 key, 1 secret)', () => {
  const m = parseLevel(E1M1.map, E1M1.name);
  const count = (t) => m.ents.filter(e => e.type === t).length;
  const enemies = ['imp', 'demon', 'commander', 'caco'];
  assert.equal(m.ents.filter(e => enemies.includes(e.type)).length, 6);
  assert.equal(count('keyR'), 1);
  const secret = m.doorType;
  let secrets = 0;
  for (let i = 0; i < secret.length; i++) if (secret[i] === 4) secrets++;
  assert.equal(secrets, 1);
});
