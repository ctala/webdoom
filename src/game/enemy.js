// Enemy AI: FSM (SLEEP->ALERT->CHASE->ATTACK->PAIN->DEATH->CORPSE) with
// line-of-sight + A* fallback pathing, sound propagation, melee swings,
// ranged projectiles and hitscan bursts. All state lives in preallocated
// slots (no allocation during play).

import { hasLOS } from '../engine/raycaster.js';
import { moveCircle } from '../engine/collision.js';
import { enemyNextState, ST } from '../engine/fsm.js';
import { diffOf } from './difficulty.js';

export const ENEMY_MAX = 48;
const _mv = new Float64Array(2);
const _los = { perp: 0, side: 0, cellX: 0, cellY: 0, hitId: 0, texX: 0 };

export const ENEMY_DEF = {
  imp:       { hp: 60, speed: 2.3, range: 8.5, kind: 'ranged', pKind: 'fire', dmg: 16, cd: 1.7, r: 0.3, viewH: 0.95 },
  demon:     { hp: 85, speed: 3.4, range: 1.25, kind: 'melee', dmg: 22, cd: 0.95, r: 0.34, viewH: 1.08 },
  commander: { hp: 70, speed: 2.1, range: 9.0, kind: 'hitscan', pellets: 3, dmg: 21, cd: 1.5, r: 0.3, viewH: 0.95 },
  caco:      { hp: 95, speed: 1.7, range: 9.0, kind: 'ranged', pKind: 'bolt', dmg: 20, cd: 1.4, r: 0.32, viewH: 1.05, lift: 0.35 },
  // THE WARDEN (E3M1): hovers, 3-way bolt spray; below 45% hp it enrages
  // (faster attack, +50% bolt damage). press: closes to 5u instead of kiting
  // at its max range — kills the "snipe it safely from 11u" strat.
  boss:      { hp: 550, speed: 1.4, range: 8.0, kind: 'ranged', pKind: 'bolt', dmg: 24, cd: 1.7, r: 0.45, viewH: 1.4, lift: 0.5, spread: 3, press: 5.0 },
};
const SIGHT = 13.5;

/** True while the Warden is below 45% hp (fires faster, hits harder). */
export function isEnraged(e) {
  return e.type === 'boss' && e.hp > 0 && e.hp < e.maxHp * 0.45;
}

export function setupEnemies(game) {
  game.enemyCount = 0;
  const { gw, solid } = game.map;
  const spawn = (type, x, y) => {
    const def = ENEMY_DEF[type];
    if (!def || game.enemyCount >= ENEMY_MAX) return false;
    const s = game.enemies[game.enemyCount++];
    s.type = type; s.x = x; s.y = y;
    s.hp = def.hp; s.maxHp = def.hp;
    s.state = ST.SLEEP; s.tState = ((x * 7 + y * 13) % 5) * 0.1;
    s.cd = 0.4; s.justHurt = false; s.heard = false;
    s.hasPath = false; s.pathI = 0; s.pathT = 0; s.stuck = 0;
    s.anim = 'idle'; s.animF = 0; s.animT = 0;
    s.deadT = 0; s.swing = 0; s.swingDone = false;
    s.enraged = false; // slot reuse: never carry the enrage flag across levels/respawns
    s.path = (s.path && s.path.length >= 128) ? s.path : new Int16Array(128);
    return true;
  };
  // mobMul: ITYTD drops every third spawn (boss exempt); UV/Nightmare add a
  // twin beside originals that have open ground. The boss is sacred.
  const ratio = diffOf(game).mobMul;
  let kept = 0, idx = 0;
  for (const e of game.map.ents) {
    if (!ENEMY_DEF[e.type]) continue;
    if (ratio < 1 && e.type !== 'boss' && idx++ % 3 === 2) continue;
    if (spawn(e.type, e.x, e.y)) kept++;
  }
  if (ratio > 1) {
    let extra = Math.round(kept * (ratio - 1));
    for (const e of game.map.ents) {
      if (extra <= 0) break;
      if (!ENEMY_DEF[e.type] || e.type === 'boss') continue;
      for (const [ox, oy] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        const nx = e.x + ox, ny = e.y + oy;
        if (solid[Math.floor(ny) * gw + Math.floor(nx)]) continue; // only open ground
        if (spawn(e.type, nx, ny)) { extra--; break; }
      }
    }
  }
  game.stats.totalKills += game.enemyCount;
}

function stepEnemy(e, def, nx, ny, dist, dt, view, map) {
  if (dist < 1e-4) return 0;
  const a = nx / dist, b = ny / dist;
  const moved = moveCircle(e.x, e.y, def.r, a * def.speed * dt, b * def.speed * dt, view, map.gw, map.gh, _mv);
  const dx = _mv[0] - e.x, dy = _mv[1] - e.y;
  e.x = _mv[0]; e.y = _mv[1];
  if (moved) e.stuck = 0; else e.stuck += dt;
  return Math.abs(dx) + Math.abs(dy);
}

export function fireEnemyProjectile(game, e) {
  const def = ENEMY_DEF[e.type];
  const p = game.player;
  const enraged = isEnraged(e);
  const dmg = def.dmg * (enraged ? 1.5 : 1);
  const n = def.spread || 1;
  const dx = p.x - e.x, dy = p.y - e.y;
  const base = Math.atan2(dy, dx);
  // small inaccuracy (±~1.1deg) so throws usually connect at mid range
  const acc = (((dx * 9301 + dy * 49297 + (e.x * 7) | 0) % 128 - 64) * 0.02) / 64;
  const sp = def.pKind === 'bolt' ? 8 : 6.5;
  for (let k = 0; k < n; k++) {
    const pr = game.projectiles.acquire();
    if (!pr) return;
    const a = base + acc + (n === 1 ? 0 : (k - (n - 1) / 2) * 0.16);
    pr.x = e.x; pr.y = e.y;
    pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
    pr.kind = def.pKind; pr.dmg = dmg; pr.life = 2.4;
    pr.owner = 0;
    pr.active = true;
  }
}

/**
 * Advance all enemies one fixed step.
 */
export function updateEnemies(game, dt) {
  const p = game.player;
  const { gw, gh } = game.map;
  const view = game.view;

  // sound events (emitted this tick frame)
  for (let i = 0; i < game.enemyCount; i++) game.enemies[i].heard = false;
  for (let si = 0; si < game.soundLen; si++) {
    const s = game.sound[si];
    for (let i = 0; i < game.enemyCount; i++) {
      const e = game.enemies[i];
      if (e.state === ST.DEATH || e.state === ST.CORPSE) continue;
      const dx = e.x - s.x, dy = e.y - s.y;
      if (dx * dx + dy * dy <= s.vol * s.vol) e.heard = true;
    }
  }

  for (let i = 0; i < game.enemyCount; i++) {
    const e = game.enemies[i];
    const def = ENEMY_DEF[e.type];
    if (e.state === ST.CORPSE) continue;
    if (e.state === ST.DEATH) {
      e.deadT += dt;
      e.anim = 'death';
      if (e.deadT > 0.75) e.state = ST.CORPSE;
      continue;
    }
    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    const sees = dist < SIGHT && (dist < 0.7 || hasLOS(e.x, e.y, p.x, p.y, view, gw, gh, _los));
    e.cd = Math.max(0, e.cd - dt);
    const ev = {
      sees, hears: e.heard, inRange: dist <= def.range + 0.15,
      hurt: e.justHurt, dead: e.hp <= 0,
      painDone: e.state === ST.PAIN && e.tState <= 0,
      targetLost: false,
    };
    if (e.state === ST.PAIN) e.tState -= dt;
    e.justHurt = false;
    const ns = enemyNextState(e.state, ev);
    if (ns !== e.state) {
      e.state = ns;
      e.tState = ns === ST.ALERT ? 0.5 : ns === ST.PAIN ? 0.3 : 0;
      if (ns === ST.DEATH) {
        game.stats.kills++;
        game.emitSound(e.x, e.y, 7);
        const boss = e.type === 'boss';
        game.spawnBlood(e.x, e.y, boss ? 26 : 12, Math.atan2(game.player.y - e.y, game.player.x - e.x), boss ? 6 : 4.5);
        game.sfx('edead');
        if (boss) {
          game.sfx('bossdie');
          game.setMessage('THE WARDEN FALLS - THE EXIT IS OPEN');
        }
      } else if (ns === ST.ALERT) {
        game.emitSound(e.x, e.y, 4);
      }
    }
    switch (e.state) {
      case ST.SLEEP:
        e.anim = 'idle';
        break;
      case ST.ALERT:
        e.tState -= dt;
        e.anim = 'idle';
        stepEnemy(e, def, dx, dy, dist, dt * 0.4, view, game.map);
        break;
      case ST.CHASE: {
        e.animT += dt;
        if (e.animT > 0.24) { e.animT = 0; e.animF = (e.animF + 1) & 3; e.anim = 'walk'; }
        else if (e.anim === 'walk') e.anim = 'walk';
        if (sees) {
          stepEnemy(e, def, dx, dy, dist, dt, view, game.map);
        } else {
          e.pathT -= dt;
          if (!e.hasPath || e.pathT <= 0) {
            const n = game.astar.find(Math.floor(e.x), Math.floor(e.y), Math.floor(p.x), Math.floor(p.y), view, gw, gh, e.path);
            e.hasPath = n > 0;
            e.pathLen = n;
            e.pathI = 0;
            e.pathT = 1.3;
            if (!e.hasPath) { // unreachable: go dormant
              e.state = ST.SLEEP;
              break;
            }
          }
          if (e.hasPath) {
            const cell = e.path[e.pathI];
            const tx = (cell % gw) + 0.5, ty = ((cell / gw) | 0) + 0.5;
            const pdx = tx - e.x, pdy = ty - e.y;
            const pd = Math.hypot(pdx, pdy);
            if (pd < 0.12) {
              e.pathI++;
              if (e.pathI >= e.pathLen) e.hasPath = false;
            } else {
              stepEnemy(e, def, pdx, pdy, pd, dt * 0.85, view, game.map);
            }
          }
        }
        if (e.stuck > 0.9) { e.stuck = 0; e.hasPath = false; e.pathT = 0; }
        break;
      }
      case ST.ATTACK: {
        e.animT += dt;
        if (def.kind === 'ranged') {
            if (def.press && dist > def.press && sees) {
              stepEnemy(e, def, dx, dy, dist, dt * (isEnraged(e) ? 1.3 : 1), view, game.map);
            }
            if (e.cd <= 0 && sees) {
              e.cd = def.cd * diffOf(game).cdMul * (isEnraged(e) ? 0.55 : 1); e.anim = 'atk'; e.animT = 0;
              fireEnemyProjectile(game, e);
              game.emitSound(e.x, e.y, 3);
              game.sfx('eshoot');
            } else if (e.anim !== 'atk') e.anim = 'idle';
          if (e.anim === 'atk' && e.animT > 0.45) e.anim = 'idle';
        } else if (def.kind === 'melee') {
          if (dist > def.range * 0.85 && sees) stepEnemy(e, def, dx, dy, dist, dt, view, game.map);
          if (e.cd <= 0) {
            e.cd = def.cd * diffOf(game).cdMul; e.anim = 'atk'; e.animT = 0;
            e.swing = 0.35; e.swingDone = false;
            game.emitSound(e.x, e.y, 3);
          }
          if (e.swing > 0) {
            e.swing -= dt;
            if (e.swing <= 0.16 && !e.swingDone) {
              if (dist < def.range + 0.35 && sees) {
                game.hurtPlayer(def.dmg, e.x, e.y);
                e.swingDone = true;
              }
            }
            if (e.swing <= 0) e.swing = 0;
          }
          if (e.anim === 'atk' && e.animT > 0.4) e.anim = 'idle';
        } else { // hitscan burst
          if (e.cd <= 0 && sees && dist <= def.range) {
            e.cd = def.cd * diffOf(game).cdMul; e.anim = 'atk'; e.animT = 0;
            game.hurtPlayer(def.dmg, e.x, e.y);
            game.emitSound(e.x, e.y, 4.5);
          } else if (e.anim !== 'atk') e.anim = 'idle';
          if (e.anim === 'atk' && e.animT > 0.35) e.anim = 'idle';
        }
        break;
      }
      case ST.PAIN:
        e.anim = 'pain';
        break;
      default:
        break;
    }
  }

  // cheap pairwise separation so enemies don't stack
  for (let i = 0; i < game.enemyCount; i++) {
    const a = game.enemies[i];
    if (a.state === ST.DEATH || a.state === ST.CORPSE) continue;
    for (let j = i + 1; j < game.enemyCount; j++) {
      const b = game.enemies[j];
      if (b.state === ST.DEATH || b.state === ST.CORPSE) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.36 || d2 < 1e-7) continue;
      const d = Math.sqrt(d2);
      const push = (0.6 - d) * 0.25;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
    }
  }
}

/** Damage an enemy (called by weapons; 0 = no kill change handled in FSM). */
export function damageEnemy(game, e, dmg) {
  if (e.state === ST.DEATH || e.state === ST.CORPSE) return;
  e.hp -= dmg;
  e.justHurt = true;
  if (e.type === 'boss' && !e.enraged && isEnraged(e)) {
    e.enraged = true;
    game.setMessage('THE WARDEN IS ENRAGED');
    game.sfx('enrage');
  }
}
