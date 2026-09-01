// Save/continue + persisted options (post-base stage 7, [flash]).
// localStorage is stubbed in node tests (see tests/meta.test.js); every
// access is guarded so headless runs no-op.

const SAVE_KEY = 'wd.save';
const OPTS_KEY = 'wd.opts';

export function saveGame(game) {
  try {
    const p = game.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      lvl: game.levelIdx, diff: game.diff,
      hp: p.hp, armor: p.armor, keyR: p.keyR, keyB: p.keyB,
      ammoP: p.ammoP, ammoS: p.ammoS, ammoPl: p.ammoPl, ammoR: p.ammoR,
      berserk: p.berserk,
      kills: game.stats.kills, totalKills: game.stats.totalKills,
      secrets: game.stats.secrets, totalSecrets: game.stats.totalSecrets,
      time: game.stats.time,
    }));
  } catch (e) { /* private mode / node: skip */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* skip */ }
}

export function continueGame(game) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* skip */ }
  if (!s || !Number.isInteger(s.lvl) || s.lvl >= game.levels.length) return false;
  game.diff = s.diff | 0;
  game.loadLevel(s.lvl, true);
  const p = game.player;
  p.hp = Math.max(1, s.hp | 0);
  p.armor = Math.max(0, Math.min(100, s.armor | 0));
  p.keyR = !!s.keyR; p.keyB = !!s.keyB;
  p.ammoP = s.ammoP | 0; p.ammoS = s.ammoS | 0;
  p.ammoPl = s.ammoPl | 0; p.ammoR = s.ammoR | 0;
  p.berserk = !!s.berserk;
  game.stats.kills = s.kills | 0;
  game.stats.totalKills = Math.max(game.stats.totalKills, s.totalKills | 0);
  game.stats.secrets = s.secrets | 0;
  game.stats.totalSecrets = Math.max(game.stats.totalSecrets, s.totalSecrets | 0);
  game.stats.time = s.time || 0;
  game.setMessage('CONTINUE - ' + game.levels[s.lvl].name);
  return true;
}

/* options ------------------------------------------------------------------ */
export const OPT_DEFAULT = { fov: 74, gamma: 0, sens: 1 };

export function loadOpts() {
  try {
    const o = JSON.parse(localStorage.getItem(OPTS_KEY));
    if (o && typeof o === 'object') return { ...OPT_DEFAULT, ...o };
  } catch (e) { /* skip */ }
  return { ...OPT_DEFAULT };
}

export function storeOpts(o) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(o)); } catch (e) { /* skip */ }
}

export function applyOpts(game, o) {
  game.opts = o;
  game.assets.M = Math.tan((o.fov * Math.PI) / 180 / 2); // camera plane scale
  game.renderer.gamma = o.gamma | 0;
  game.sens = Math.max(0.4, Math.min(2.5, o.sens));
  return game.opts;
}

export function tweakOpt(game, key, delta) {
  const o = game.opts;
  if (key === 'fov') o.fov = Math.max(60, Math.min(100, o.fov + delta));
  else if (key === 'gamma') o.gamma = Math.max(-6, Math.min(6, o.gamma + delta));
  else if (key === 'sens') o.sens = Math.max(0.4, Math.min(2.5, o.sens + delta));
  applyOpts(game, o);
  storeOpts(o);
  return o;
}

/** Level-end stats (Doom INTERMAP-style), all pure numbers for the renderer. */
export function levelStats(game) {
  const ls = game.levelStart;
  if (!ls) return { kills: 0, killed: 0, killTotal: 0, secrets: 0, time: 0 };
  const killed = game.stats.kills - ls.kills;
  const total = game.stats.totalKills - ls.totalKillsBefore; // level spawns + births
  const secrets = game.stats.secrets - ls.secrets;
  const totalSecrets = game.stats.totalSecrets - ls.totalSecretsBefore;
  return {
    kills: total > 0 ? Math.round((killed / total) * 100) : 100,
    killed, killTotal: total,
    secrets: totalSecrets > 0 ? Math.round((secrets / totalSecrets) * 100) : 0,
    time: game.stats.levelTime,
  };
}
