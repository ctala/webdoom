// Player interaction with the world: E/U opens doors, secrets and the exit.

import { bossAlive } from './objective.js';
import { clearSave } from './save.js';

/** Collect door cells for the level (all four door kinds animate). */
export function initDoors(game) {
  const dt = game.map.doorType;
  const cells = [];
  for (let i = 0; i < dt.length; i++) if (dt[i]) cells.push(i);
  game.doorCells = cells;
}

/** Animate any door mid-open; rebuild the walkable view once it passes. */
export function updateDoors(game, ddt) {
  const doorH = game.doorH;
  let crossed = false;
  for (let i = 0; i < game.doorCells.length; i++) {
    const c = game.doorCells[i];
    if (doorH[c] > 0 && doorH[c] < 1) {
      doorH[c] = Math.min(1, doorH[c] + ddt / 0.55);
      if (doorH[c] >= 0.95) crossed = true;
    }
  }
  if (crossed) game.rebuildView();
}

/** Count down the intermission; returns true while it (and load) handle the tick. */
export function updateIntermission(game, dt) {
  if (game.state !== 'INTERM') return false;
  game.intermT -= dt;
  if (game.intermT <= 0) game.loadLevel(game.levelIdx + 1, true); // keys carry forward
  return true;
}

/**
 * What is in front of the player right now? Shared by useAction (E/U) and
 * the HUD proximity hint so they can never disagree.
 * @returns {{kind:string, cell:number, t:number} | null}
 *   kind: 'exit' | 'door-plain' | 'door-secret' | 'door-R' | 'door-B'
 */
export function scanUse(game) {
  const p = game.player;
  const { gw, gh, exit } = game.map;
  if (exit) {
    const dx = p.x - exit.x, dy = p.y - exit.y;
    if (dx * dx + dy * dy < 1.3 * 1.3) return { kind: 'exit', cell: -1, t: 0 };
  }
  const cells = game.useScratch || (game.useScratch = []);
  cells.length = 0;
  for (const r of [0.9, 1.4]) {
    const cx = Math.floor(p.x + Math.cos(p.ang) * r);
    const cy = Math.floor(p.y + Math.sin(p.ang) * r);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
    const c = cy * gw + cx;
    let dup = false;
    for (let i = 0; i < cells.length; i++) if (cells[i] === c) { dup = true; break; }
    if (!dup) cells.push(c);
  }
  for (const c of cells) {
    const t = game.map.doorType[c];
    if (!t) continue;
    return { kind: t === 1 ? 'door-plain' : t === 2 ? 'door-R' : t === 3 ? 'door-B' : 'door-secret', cell: c, t };
  }
  return null;
}

/** Consume one "use" action (E/U): doors need their key, the exit completes. */
export function useAction(game) {
  const p = game.player;
  const hit = scanUse(game);
  if (!hit) {
    // nothing interactive ahead: brief feedback so E never feels dead
    game.sfx('denied');
    return;
  }
  if (hit.kind === 'exit') {
    // boss levels: the Warden must fall first (its death unseals the exit)
    if (game.levels[game.levelIdx].boss && bossAlive(game)) {
      game.setMessage('THE WARDEN GUARDS THE EXIT');
      game.sfx('denied');
      return;
    }
    const ks = game.levels[game.levelIdx].keys || (game.levels[game.levelIdx].needsKey ? [game.levels[game.levelIdx].needsKey] : []);
    const missing = ks.find((k) => !game.player[k]);
    if (missing) {
      game.setMessage('BOTH KEYCARDS NEEDED');
      game.sfx('denied');
      return;
    }
    levelComplete(game);
    return;
  }
  if ((hit.t === 2 && !p.keyR) || (hit.t === 3 && !p.keyB)) {
    game.setMessage(hit.t === 2 ? 'NEED THE RED KEYCARD' : 'NEED THE BLUE KEYCARD');
    game.sfx('denied');
    return;
  }
  if (game.doorH[hit.cell] < 1) {
    game.doorH[hit.cell] = 0.02; // start the open animation
    game.sfx('door', (hit.cell % game.map.gw) + 0.5, ((hit.cell / game.map.gw) | 0) + 0.5);
    if (hit.t === 4 && !game.secretCounted) {
      game.secretCounted = true;
      game.stats.secrets++;
      game.setMessage('SECRET FOUND');
    }
  }
}

/** Exit switch used: intermission to the next level, or WON on the last one. */
export function levelComplete(game) {
  if (game.state !== 'PLAY') return;
  game.input.fire = false;
  if (game.levelIdx < game.levels.length - 1) {
    game.state = 'INTERM';
    game.intermT = 2.4;
    game.sfx('complete');
    game.setMessage(game.levels[game.levelIdx].name + ' — COMPLETE');
  } else {
    game.state = 'WON';
    game.sfx('complete');
    game.setMessage('YOU ESCAPED');
    clearSave(); // a finished run does not resume
  }
}
