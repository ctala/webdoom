// Save/continue, level stats, persisted options (post-base stage 7, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { saveGame, hasSave, clearSave, continueGame, levelStats, tweakOpt, applyOpts } from '../src/game/save.js';

// node has no localStorage: the stub keeps save.js' guarded calls honest
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const W = 480, H = 270;
function makeGame() {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  return g;
}

test('loadLevel autosaves once the game is running; clearSave wipes it', () => {
  store.clear();
  const g = makeGame();
  assert.equal(hasSave(), false, 'boot load does not save');
  g._booted = true;
  g.loadLevel(2);
  assert.ok(hasSave(), 'level entry saved');
  clearSave();
  assert.equal(hasSave(), false);
});

test('continueGame restores level, difficulty and carried status', () => {
  store.clear();
  const g = makeGame();
  g._booted = true;
  g.loadLevel(1);
  g.diff = 3;
  g.loadLevel(1, true); // respawn to be sure save reflects it
  saveGame(g);
  g.player.hp = 1; g.player.ammoS = 0; g.player.armor = 0;
  const g2 = makeGame();
  assert.ok(continueGame(g2), 'resumed');
  assert.equal(g2.levelIdx, 1);
  assert.equal(g2.diff, 3, 'difficulty persisted');
  assert.ok(g2.player.hp > 1, `hp restored (${g2.player.hp})`);
  assert.ok(g2.player.ammoS >= 0);
  assert.match(g2.message.text, /CONTINUE/);
});

test('continueGame survives a stale/broken save', () => {
  store.clear();
  store.set('wd.save', '{oops');
  const g = makeGame();
  assert.equal(continueGame(g), false);
  store.set('wd.save', JSON.stringify({ lvl: 99 }));
  assert.equal(continueGame(g), false, 'level index out of range');
});

test('levelStats reports kills and secrets against level totals', () => {
  store.clear();
  const g = makeGame();
  g._booted = true;
  g.loadLevel(0);
  const s0 = levelStats(g);
  assert.equal(s0.killTotal, g.enemyCount, 'level enemy count is the total');
  assert.equal(s0.kills, 0, 'nothing killed yet = 0 percent');
  const e = g.enemies[0];
  e.hp = 0; e.state = 5; // fake a kill
  g.stats.kills++;
  const s = levelStats(g);
  assert.equal(s.kills, Math.round((1 / s.killTotal) * 100), `killed 1 of ${s.killTotal}`);
  assert.equal(s.killed, 1);
});

test('options: FOV drives the camera plane, gamma and sens clamp', () => {
  store.clear();
  const g = makeGame();
  const m0 = g.assets.M;
  tweakOpt(g, 'fov', 10);
  assert.ok(g.assets.M > m0, 'wider fov = bigger plane');
  tweakOpt(g, 'fov', -100);
  assert.equal(g.opts.fov, 60, 'clamped low');
  tweakOpt(g, 'gamma', 50);
  assert.equal(g.opts.gamma, 6, 'clamped high');
  assert.equal(g.renderer.gamma, 6, 'renderer sees gamma');
  tweakOpt(g, 'sens', 5);
  assert.equal(g.opts.sens, 2.5, 'sens clamp');
  assert.ok(g.sens <= 2.5);
  assert.ok(store.has('wd.opts'), 'persisted');
  const g2 = makeGame();
  assert.equal(g2.opts.fov, 60, 'a fresh game picks persisted opts up');
});
