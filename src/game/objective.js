// Objective resolution: what should the player go do RIGHT NOW?
// Pure over game state — shared by the HUD (banner + compass pointer),
// the automap (goal marker) and the playthrough QA, so they can never
// point at different things. This is the "how do I reach the next level"
// fix: the game always tells you the next target and where it is.

import { ST } from '../engine/fsm.js';

/** Packed colors (0xAABBGGRR) per objective kind. */
export const OBJ_COLORS = {
  keyR: ((0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0xc8) >>> 0,
  keyB: ((0xff << 24) | (0xc8 << 16) | (0x60 << 8) | 0x38) >>> 0,
  boss: ((0xff << 24) | (0x20 << 16) | (0x90 << 8) | 0xff) >>> 0,
  exit: ((0xff << 24) | (0x60 << 16) | (0xff << 8) | 0x40) >>> 0,
};

/** The live Warden entity, or null. */
export function bossAlive(game) {
  for (let i = 0; i < game.enemyCount; i++) {
    const e = game.enemies[i];
    if (e.type === 'boss' && e.state !== ST.DEATH && e.state !== ST.CORPSE) return e;
  }
  return null;
}

/**
 * The next thing to go at, in priority order:
 * 1) the level's keycard (if not carried), 2) the boss (boss levels,
 * while alive), 3) the exit switch.
 * @returns {{kind:string, x:number, y:number, label:string, color:number} | null}
 */
export function currentObjective(game) {
  const p = game.player;
  const lvl = game.levels[game.levelIdx];
  const k = lvl.needsKey;
  if (k && !p[k]) {
    for (let i = 0; i < game.itemCount; i++) {
      const it = game.items[i];
      if (it.active && it.type === k) {
        return { kind: k, x: it.x, y: it.y, label: k === 'keyR' ? 'FIND THE RED KEYCARD' : 'FIND THE BLUE KEYCARD', color: OBJ_COLORS[k] };
      }
    }
  }
  const b = bossAlive(game);
  if (lvl.boss && b) return { kind: 'boss', x: b.x, y: b.y, label: 'DEFEAT THE WARDEN', color: OBJ_COLORS.boss };
  const ex = game.map.exit;
  if (ex) return { kind: 'exit', x: ex.x, y: ex.y, label: 'REACH THE EXIT', color: OBJ_COLORS.exit };
  return null;
}

/**
 * Compass data for the objective: `rel` in [-PI,PI] (0 = dead ahead),
 * `dist` in world units. Testable without rendering.
 */
export function compassInfo(game, obj) {
  const p = game.player;
  const dx = obj.x - p.x, dy = obj.y - p.y;
  const dist = Math.hypot(dx, dy);
  let rel = Math.atan2(dy, dx) - p.ang;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  return { rel, dist };
}
