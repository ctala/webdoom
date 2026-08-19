// Player interaction with the world: E/U opens doors, secrets and the exit.

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
 * Consume one "use" action (E/U). Checks the cell ~1.3u ahead and the
 * exit switch cell; doors need their key (R/B), plain D and secret S don't.
 */
export function useAction(game) {
  const p = game.player;
  const { gw, gh, exit } = game.map;
  // exit: standing near the switch and press use (Doom-style wall switch)
  if (exit) {
    const dx = p.x - exit.x, dy = p.y - exit.y;
    if (dx * dx + dy * dy < 1.3 * 1.3) {
      levelComplete(game);
      return;
    }
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
    if ((t === 2 && !p.keyR) || (t === 3 && !p.keyB)) {
      game.setMessage(t === 2 ? 'NEED THE RED KEYCARD' : 'NEED THE BLUE KEYCARD');
      game.sfx('denied');
      return;
    }
    if (game.doorH[c] < 1) {
      game.doorH[c] = 0.02; // start the open animation
      game.sfx('door');
      if (t === 4 && !game.secretCounted) {
        game.secretCounted = true;
        game.stats.secrets++;
        game.setMessage('SECRET FOUND');
      }
    }
    return; // one door per use press
  }
  // nothing interactive ahead: brief feedback so E never feels dead
  game.sfx('denied');
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
  }
}
