// Player weapons (stage 4): definitions + fire logic. Pure, node-testable.
// Hitscan: one ray through the wall grid per pellet; the nearest enemy whose
// radius crosses the ray before the wall takes the damage. Plasma: owner-1
// projectile (see projectiles.js) + area splash. Fists: melee arc.
// Running out of ammo auto-falls-back (shotgun/plasma -> pistol -> fists).

import { castRay, hasLOS } from '../engine/raycaster.js';
import { ST } from '../engine/fsm.js';
import { damageFalloff } from '../engine/light.js';
import { damageEnemy } from './enemy.js';
import { nextRand, spawnBlood } from './particles.js';

// range = effective range for hitscan falloff (damageFalloff -> 30% beyond);
// projectiles (plasma) keep full damage at any distance they can reach.
export const WEAPON_DEF = {
  1: { name: 'FISTS', cd: 0.42, melee: true, dmgMin: 12, dmgMax: 26, range: 1.3, cone: 0.55, ammo: null },
  2: { name: 'PISTOL', cd: 0.45, hitscan: true, pellets: 1, dmgMin: 8, dmgMax: 16, spread: 0.014, range: 11, ammo: 'ammoP' },
  3: { name: 'SHOTGUN', cd: 0.95, hitscan: true, pellets: 8, dmgMin: 3, dmgMax: 9, spread: 0.06, range: 7, ammo: 'ammoS' },
  4: { name: 'PLASMA', cd: 0.30, projectile: true, kindP: 'plasma', pellets: 1, dmgMin: 16, dmgMax: 24, spread: 0.02, speed: 9.0, life: 1.5, splash: 1.6, splashDmg: 8, ammo: 'ammoPl' },
  5: { name: 'CHAINGUN', cd: 0.10, hitscan: true, pellets: 1, dmgMin: 6, dmgMax: 12, spread: 0.022, ramp: true, range: 10, ammo: 'ammoP' },
  // rocket: big splash; the blast also hurts the shooter at point-blank
  // (rocket-jump physics are deliberately absent, the self-damage is not).
  6: { name: 'ROCKET', cd: 0.90, projectile: true, kindP: 'rocket', pellets: 1, dmgMin: 20, dmgMax: 30, spread: 0, speed: 7.5, life: 2.4, splash: 2.4, splashDmg: 60, splashSelf: true, ammo: 'ammoR' },
};

export const WEAPON_IDS = [1, 2, 3, 4, 5, 6];

const _ray = { perp: 0, side: 0, cellX: 0, cellY: 0, hitId: 0, texX: 0 };

function dmgRoll(game, def) {
  return (def.dmgMin + nextRand(game) * (def.dmgMax - def.dmgMin + 1)) | 0;
}

/** Manual switch (keys 1-4 / wheel); message feedback before HUD exists. */
export function switchWeapon(game, id) {
  const p = game.player;
  const def = WEAPON_DEF[id];
  if (!def || p.weapon === id) return;
  p.weapon = id;
  p.latch = false;
  p.switchT = 0.16; // drop-and-rise animation (NOT the fire swing: must look neutral)
  game.setMessage(def.name);
  game.sfx('switch');
}

/** Called every fixed step; consumes input.fire (edge-latched for melee). */
export function updateWeapons(game, dt) {
  const p = game.player;
  if (p.wpnCd > 0) p.wpnCd -= dt;
  if (p.swingT > 0) p.swingT -= dt;
  if (p.switchT > 0) p.switchT -= dt;
  if (!game.input.fire) { p.latch = false; p.spreadRamp = 0; return; }
  const def = WEAPON_DEF[p.weapon];
  if (p.wpnCd > 0 || (def.melee && p.latch)) return;
  const slot = def.ammo;
  if (slot && p[slot] <= 0) {
    // Doom-style: advance through the weapon list to the next with ammo;
    // fists only as a last resort.
    let next = 1;
    for (let k = 1; k <= 5; k++) {
      const w = ((p.weapon - 1 + k) % 6) + 1;
      const a = WEAPON_DEF[w].ammo;
      if (a && p[a] > 0) { next = w; break; }
    }
    switchWeapon(game, next);
    game.setMessage('OUT OF AMMO: ' + WEAPON_DEF[next].name);
    p.latch = false;
    return;
  }
  p.latch = true;
  if (slot) p[slot]--;
  p.wpnCd = def.cd;
  p.swingT = def.melee ? 0.25 : 0.18;
  if (def.melee) p.punchParity ^= 1; // alternate fists L/R
  p.flash = 1;
  game.sfx(def.sfx || WEAPON_SFX[p.weapon]);
  const { gw, gh } = game.map;
  if (def.melee) melee(game, def, gw, gh);
  else if (def.projectile) shootProjectile(game, def);
  else for (let i = 0; i < def.pellets; i++) hitscan(game, def, gw, gh);
}

const WEAPON_SFX = { 1: 'punch', 2: 'pistol', 3: 'shotgun', 4: 'plasma', 5: 'chaingun', 6: 'rocket' };

function melee(game, def, gw, gh) {
  const p = game.player;
  let best = null;
  let bestD = 1e9;
  for (let i = 0; i < game.enemyCount; i++) {
    const e = game.enemies[i];
    if (e.state === ST.DEATH || e.state === ST.CORPSE) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const t = Math.hypot(dx, dy);
    if (t > def.range || t < 1e-4 || t >= bestD) continue;
    let da = Math.atan2(dy, dx) - p.ang;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) > def.cone) continue;
    if (!hasLOS(p.x, p.y, e.x, e.y, game.view, gw, gh, _ray)) continue;
    best = e; bestD = t;
  }
  if (best) {
    damageEnemy(game, best, dmgRoll(game, def) * (p.berserk ? 2 : 1));
    spawnBlood(game, best.x, best.y, 7, p.ang, 4);
    game.emitSound(best.x, best.y, 3);
    game.sfx('hit');
  }
}

function hitscan(game, def, gw, gh) {
  const p = game.player;
  const spr = def.ramp ? def.spread * (1 + 2.5 * p.spreadRamp) : def.spread;
  if (def.ramp) p.spreadRamp = Math.min(1, p.spreadRamp + 0.10); // sustained fire opens the cone
  const a = p.ang + (nextRand(game) * 2 - 1) * spr;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  if (!castRay(p.x, p.y, ca, sa, game.view, gw, gh, _ray)) return;
  const wallD = _ray.perp;
  let best = null;
  let bestT = Infinity;
  for (let i = 0; i < game.enemyCount; i++) {
    const e = game.enemies[i];
    if (e.state === ST.DEATH || e.state === ST.CORPSE) continue;
    const ex = e.x - p.x, ey = e.y - p.y;
    const t = ex * ca + ey * sa;
    if (t < 0.15 || t >= wallD - 0.1 || t >= bestT) continue;
    const perp = Math.abs(ex * sa - ey * ca);
    if (perp < game.enemyDef[e.type].r + 0.14) { best = e; bestT = t; }
  }
  if (best) {
    const dmg = Math.max(1, Math.round(dmgRoll(game, def) * damageFalloff(bestT, def.range)));
    damageEnemy(game, best, dmg);
    spawnBlood(game, best.x, best.y, def.pellets > 1 ? 9 : 5, a, def.pellets > 1 ? 4.5 : 3.5);
    game.emitSound(best.x, best.y, 2.5);
    game.sfx('hit');
  }
}

function shootProjectile(game, def) {
  const p = game.player;
  const a = p.ang + (nextRand(game) * 2 - 1) * def.spread;
  const pr = game.projectiles.acquire();
  if (!pr) return;
  pr.x = p.x + Math.cos(a) * 0.45;
  pr.y = p.y + Math.sin(a) * 0.45;
  pr.vx = Math.cos(a) * def.speed;
  pr.vy = Math.sin(a) * def.speed;
  pr.kind = def.kindP || 'plasma';
  pr.dmg = dmgRoll(game, def);
  pr.life = def.life;
  pr.owner = 1;
  pr.splash = def.splash;
  pr.splashDmg = def.splashDmg;
  pr.active = true;
}
