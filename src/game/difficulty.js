// Difficulty settings (post-base stage 1, [flash]).
// dmgTaken: multiplier on damage the player takes.
// cdMul:    multiplier on enemy attack cooldowns (lower = fire faster).
// ammoMul:  multiplier on ammo pickups.
// mobMul:   enemy COUNT (<1: ITYTD drops every third spawn; >1: UV/Nightmare
//           duplicate a twin beside open-ground originals; boss untouched).
// Pure — node-testable. The menu (main.js/hud) owns selection + persistence.

export const DIFFS = [
  { name: 'IT CANNOT HAPPEN HERE', abbr: 'ITYTD', dmgTaken: 0.5, cdMul: 1.4, ammoMul: 0.7, mobMul: 0.6 },
  { name: 'HURT ME PLENTY', abbr: 'HMP', dmgTaken: 1.0, cdMul: 1.0, ammoMul: 1.0, mobMul: 1.0 },
  { name: 'ULTRA VIOLENCE', abbr: 'UV', dmgTaken: 1.5, cdMul: 0.8, ammoMul: 1.0, mobMul: 1.3 },
  { name: 'NIGHTMARE', abbr: 'NIGHTMARE', dmgTaken: 2.0, cdMul: 0.65, ammoMul: 1.0, mobMul: 1.6 },
];

export function diffOf(game) {
  return DIFFS[game.diff] || DIFFS[1];
}

/** Cycle-safe selection (menu arrows): wraps into [0, DIFFS.length). */
export function setDifficulty(game, i) {
  const n = DIFFS.length;
  game.diff = ((i % n) + n) % n;
  return game.diff;
}
