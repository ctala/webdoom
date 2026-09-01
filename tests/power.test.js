// Powerups + toxic floors (post-base stage 6, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { updateItems } from '../src/game/items.js';
import { updateEnemies } from '../src/game/enemy.js';
import { ST } from '../src/engine/fsm.js';

const W = 480, H = 270;
const HAZMAP = [
  '############',
  '#..........#',
  '#P..~~~....#',
  '#...~~~....#',
  '#..........#',
  '#..........#',
  '############',
];
function makeGame(rows = HAZMAP) {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng: 0, theme: 0, map: rows }];
  g.loadLevel(0);
  return g;
}
function giveItem(g, type, x, y) {
  const it = g.items[g.itemCount++];
  it.type = type; it.x = x; it.y = y; it.active = true;
  return it;
}

test('parseLevel: ~ marks hazard cells (and is walkable)', () => {
  const g = makeGame();
  assert.ok(g.map.hasHazard, 'flag set');
  assert.equal(g.map.hazard[2 * g.map.gw + 4], 1);
  assert.equal(g.map.solid[2 * g.map.gw + 4], 0, 'hazard is floor, not wall');
});

test('standing on hazard drains hp; suit blocks it', () => {
  const g = makeGame();
  g.player.x = 4.5; g.player.y = 2.5; // on a ~ cell
  const hp0 = g.player.hp;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  assert.ok(g.player.hp < hp0, `toxic burn (${hp0} -> ${g.player.hp})`);
  const g2 = makeGame();
  g2.player.x = 4.5; g2.player.y = 2.5; g2.player.suit = 30;
  const hp1 = g2.player.hp;
  for (let i = 0; i < 60; i++) g2.tick(1 / 60);
  assert.equal(g2.player.hp, hp1, 'suit immunizes');
});

test('berserk: pickups set it and fists double', () => {
  const g = makeGame(['############', '#..........#', '#P.........#', '#..........#', '############']);
  giveItem(g, 'berserk', g.player.x + 0.2, g.player.y);
  updateItems(g);
  assert.equal(g.player.berserk, true);
  assert.equal(g.player.hp, 120, 'and +20 hp');
});

test('megasphere: heals past 100 up to the 200 cap', () => {
  const g = makeGame(['############', '#..........#', '#P.........#', '#..........#', '############']);
  g.player.hp = 90;
  giveItem(g, 'mega', g.player.x + 0.2, g.player.y);
  updateItems(g);
  assert.equal(g.player.hp, 190);
  const it2 = giveItem(g, 'mega', g.player.x + 0.2, g.player.y);
  g.player.hp = 200;
  updateItems(g);
  assert.equal(it2.active, true, 'refused at full 200');
});

test('invis timer decays and triples projectile scatter', () => {
  const g = makeGame(['############', '#..........#', '#P........i#', '#..........#', '############']);
  giveItem(g, 'invis', g.player.x + 0.2, g.player.y);
  updateItems(g);
  assert.ok(g.player.invis > 25);
  for (let i = 0; i < 60 * 31; i++) g.tick(1 / 60);
  assert.equal(g.player.invis, 0, 'decayed');
});
