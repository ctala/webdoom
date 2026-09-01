// Chaingun + rocket (post-base stage 4, [flash]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { WEAPON_DEF } from '../src/game/weapons.js';

const W = 480, H = 270;
const ROOM = [
  '############',
  '#...........',
  '#...........',
  '#P........i#',
  '#...........',
  '#...........',
  '############',
];
function makeGame() {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng: 0, theme: 0, map: ROOM }];
  g.loadLevel(0);
  return g;
}

test('chaingun: fast shots share pistol ammo, cone opens while holding fire', () => {
  const g = makeGame();
  g.player.weapon = 5;
  let shots = 0;
  g.input.fire = true;
  for (let i = 0; i < 40; i++) { g.tick(1 / 60); } // 0.66s -> ~6 shots at cd 0.10
  g.input.fire = false;
  shots = 50 - g.player.ammoP;
  assert.ok(shots >= 5 && shots <= 8, `burst of ${shots} shots in 0.66s`);
  assert.ok(g.player.spreadRamp > 0.3, `cone ramp active (${g.player.spreadRamp})`);
  for (let i = 0; i < 30; i++) g.tick(1 / 60); // release -> ramp decays
  assert.equal(g.player.spreadRamp, 0, 'ramp resets when fire released');
});

test('rocket: splash pool + self-damage at point blank, boom sfx fired', () => {
  const g = makeGame();
  g.player.weapon = 6; g.player.ammoR = 5;
  const heard = [];
  g.sfx = (n) => heard.push(n);
  g.player.wpnCd = 0; g.input.fire = true; g.tick(1 / 60); g.input.fire = false;
  assert.equal(heard[0], 'rocket');
  const pr = [];
  g.projectiles.each((p) => { if (p.active) pr.push(p); });
  assert.equal(pr.length, 1);
  assert.equal(pr[0].kind, 'rocket');
  // slam it into the far wall: splash must not hurt the shooter 9u away
  const hp0 = g.player.hp;
  pr[0].x = 10.6; pr[0].y = 3.5;
  g.onProjectileWall(pr[0]);
  assert.equal(g.player.hp, hp0, 'no self-damage far away');
  assert.ok(heard.includes('boom'), 'boom played');
  // point blank explosion hurts
  const hp1 = g.player.hp;
  pr[0].x = g.player.x + 0.5; pr[0].y = g.player.y;
  g.onProjectileWall(pr[0]);
  assert.ok(g.player.hp < hp1, `self blast hurts (${hp1} -> ${g.player.hp})`);
});

test('rocket splash kills the aligned imp', () => {
  const g = makeGame();
  const e = g.enemies[0];
  e.x = 5.5; e.y = 3.5;
  g.explodeRocket({ x: 5.5, y: 3.5, owner: 1 }); // blast center on the imp: full 60
  assert.ok(e.hp <= 0, `splash killed imp (hp ${e.hp})`);
});

test('out of ammo fallback generalizes (rocket -> plasma/pistol/fists)', () => {
  const g = makeGame();
  g.player.weapon = 6; g.player.ammoR = 0; g.player.ammoPl = 0; g.player.ammoP = 3; g.player.ammoS = 0;
  g.player.wpnCd = 0; g.input.fire = true; g.tick(1 / 60); g.input.fire = false;
  assert.equal(g.player.weapon, 2, 'falls back to pistol (only ammo left)');
});

test('weapon defs: 6 entries, ammo slots exist on the player', () => {
  const g = makeGame();
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const d = WEAPON_DEF[id];
    assert.ok(d && d.cd > 0);
    if (d.ammo) assert.ok(Number.isInteger(g.player[d.ammo]), `player.${d.ammo}`);
  }
});
