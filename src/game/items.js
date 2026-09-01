// Floor items: fixed pool + auto-pickup. Pure (no DOM, no assets).
// Types come from map ENT_CODES: h g m s p k b -> ITEM_DEF keys.

import { camDepth } from '../engine/proj.js';
import { lightLevel } from '../engine/light.js';
import { diffOf } from './difficulty.js';

/** Draw active items into the sprite pass (call before sr.render). */
export function renderItems(game, sr, p, cosA, sinA) {
  for (let i = 0; i < game.itemCount; i++) {
    const it = game.items[i];
    if (!it.active) continue;
    const sp = game.itemSprites[it.type];
    const d = camDepth(p.x, p.y, cosA, sinA, it.x, it.y);
    if (d < 0.25) continue;
    sr.add(it.x, it.y, it.viewH, sp.tab, sp.w, sp.h, it.lift, lightLevel(d, 0, false));
  }
}

export const ITEM_MAX = 48;

export const ITEM_DEF = {
  health: { name: '+25 HEALTH', viewH: 0.34, hp: 25 },
  armor: { name: '+ARMOR', viewH: 0.40, armor: 50 },
  ammoP: { name: '+PISTOL AMMO', viewH: 0.30, ammo: ['ammoP', 10], cap: 200 },
  ammoS: { name: '+SHELLS', viewH: 0.30, ammo: ['ammoS', 4], cap: 50 },
  ammoPl: { name: '+PLASMA CELLS', viewH: 0.34, ammo: ['ammoPl', 10], cap: 100 },
  keyR: { name: 'GOT THE RED KEYCARD', viewH: 0.42, lift: 0.16, key: 'keyR' },
  keyB: { name: 'GOT THE BLUE KEYCARD', viewH: 0.42, lift: 0.16, key: 'keyB' },
};

export function makeItems(game) {
  game.items = new Array(ITEM_MAX);
  for (let i = 0; i < ITEM_MAX; i++) game.items[i] = { active: false, x: 0, y: 0, type: '', viewH: 0.3, lift: 0 };
  game.itemCount = 0;
}

/** (Re)populate the pool from the current level's parsed entities. */
export function setupItems(game) {
  for (const it of game.items) it.active = false;
  let n = 0;
  for (const e of game.map.ents) {
    const d = ITEM_DEF[e.type];
    if (!d || n >= ITEM_MAX) continue;
    const it = game.items[n++];
    it.active = true;
    it.x = e.x;
    it.y = e.y;
    it.type = e.type;
    it.viewH = d.viewH;
    it.lift = d.lift || 0;
  }
  game.itemCount = n;
}

/** Walk-onto pickup: apply, message, sfx. Full resources refuse silently. */
export function updateItems(game) {
  const p = game.player;
  for (let i = 0; i < game.itemCount; i++) {
    const it = game.items[i];
    if (!it.active) continue;
    const dx = it.x - p.x, dy = it.y - p.y;
    if (dx * dx + dy * dy > 0.55 * 0.55) continue;
    const d = ITEM_DEF[it.type];
    let take = true;
    if (d.hp) {
      if (p.hp >= 100) take = false;
      else p.hp = Math.min(100, p.hp + d.hp);
    } else if (d.armor) {
      if (p.armor >= 100) take = false;
      else p.armor = Math.min(100, p.armor + d.armor);
    } else if (d.ammo) {
      const stat = d.ammo[0];
      const amt = Math.max(1, Math.round(d.ammo[1] * diffOf(game).ammoMul));
      if (p[stat] >= d.cap) take = false;
      else p[stat] = Math.min(d.cap, p[stat] + amt);
    } else if (d.key) {
      if (p[d.key]) take = false;
      else p[d.key] = true;
    }
    if (take) {
      it.active = false;
      game.setMessage(d.name);
      game.sfx('pickup');
      game.emitSound(p.x, p.y, 3);
    }
  }
}
