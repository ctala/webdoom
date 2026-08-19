// Game orchestrator: level state, fixed-step tick, render.
// Grows per stage: enemies (3), weapons (4), doors/keys (5), HUD/menus (6).

import { parseLevel } from '../engine/map.js';
import { Renderer } from '../engine/renderer.js';
import { SpriteRenderer } from '../engine/spriteRenderer.js';
import { AStar } from '../engine/astar.js';
import { Pool } from '../engine/pool.js';
import { ST } from '../engine/fsm.js';
import { camDepth } from '../engine/proj.js';
import { lightLevel, damageFalloff } from '../engine/light.js';
import { createPlayer, updatePlayer } from './player.js';
import { setupEnemies, updateEnemies, damageEnemy, ENEMY_DEF, ENEMY_MAX } from './enemy.js';
import { updateProjectiles } from './projectiles.js';
import { buildSprites, buildGlowSprites } from '../gfx/sprites.js';
import { makeFlatBg } from '../gfx/assets.js';
import { E1M1 } from '../../levels/e1m1.js';

export class Game {
  constructor(assets, W = 480, H = 270, targetBuf = null, imageData = null) {
    this.W = W;
    this.H = H;
    this.assets = assets;
    this.renderer = new Renderer(assets, W, H, targetBuf);
    this.imageData = imageData;
    this.bg = makeFlatBg(W, H);
    this.state = 'PLAY'; // MENU PLAY PAUSED INTERM DEAD WON
    this.paused = false;
    // entity pools (allocated once, reused per level)
    this.sprites = buildSprites(typeof document !== 'undefined' ? document : null);
    this.glows = buildGlowSprites(typeof document !== 'undefined' ? document : null);
    this.spriteR = new SpriteRenderer();
    this.astar = new AStar();
    this.enemyDef = ENEMY_DEF;
    this.enemies = new Array(ENEMY_MAX);
    for (let i = 0; i < ENEMY_MAX; i++) this.enemies[i] = {};
    this.enemyCount = 0;
    this.projectiles = new Pool(32, () => ({ x: 0, y: 0, vx: 0, vy: 0, active: false, kind: 'fire', dmg: 10, life: 0, owner: 0 }));
    this.sound = new Array(32);
    for (let i = 0; i < 32; i++) this.sound[i] = { x: 0, y: 0, vol: 0 };
    this.soundLen = 0;
    this.levelIdx = 0;
    this.levels = [E1M1];
    this.message = { text: '', t: 0 };
    this.stats = { kills: 0, totalKills: 0, secrets: 0, totalSecrets: 0, time: 0, levelTime: 0 };
    this.input = { up: false, down: false, left: false, right: false, run: false, fire: false, use: false };
    this.loadLevel(0);
  }

  loadLevel(idx) {
    const def = this.levels[idx];
    this.levelIdx = idx;
    this.map = parseLevel(def.map, def.name);
    const { gw, gh } = this.map;
    this.player = createPlayer(this.map.player.x, this.map.player.y, def.startAng || 0);
    this.player.flash = 0;
    this.view = new Uint8Array(gw * gh);
    this.explored = new Uint8Array(gw * gh);
    this.doorH = new Float32Array(gw * gh);
    this.map.doorH = this.doorH; // renderer reads door height through the map
    this.stats.levelTime = 0;
    this.setupLevelEntities();
    // per-level theme: floor + ceiling tables
    if (this.assets.floorTables) {
      const th = this.assets.floorTables[(def.theme ?? 0) % this.assets.floorTables.length];
      this.assets.floorTable = th.floor;
      this.assets.ceilTable = th.ceil;
    }
    this.state = 'PLAY';
    this.paused = false;
    this.rebuildView();
    this.setMessage(def.name);
  }

  setupLevelEntities() {
    setupEnemies(this);
    this.soundLen = 0;
    this.projectiles.each((pr) => { pr.active = false; });
  }

  rebuildView() {
    const { solid, doorType, gw } = this.map;
    const view = this.view;
    const doorH = this.doorH;
    for (let i = 0; i < solid.length; i++) {
      view[i] = doorType[i] && doorH[i] > 0.95 ? 0 : solid[i];
    }
  }

  setMessage(text) {
    this.message.text = text;
    this.message.t = 3.0;
  }

  turn(mx) {
    this.player.ang -= mx * 0.0021;
  }

  tick(dt) {
    if (this.state !== 'PLAY' || this.paused) return;
    const p = this.player;
    this.stats.levelTime += dt;
    updatePlayer(p, this.input, dt, this.view, this.map);
    updateProjectiles(this, dt);
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 5);
    if (this.state === 'PLAY') updateEnemies(this, dt);
    this.soundLen = 0; // sounds consumed by enemies this tick; clear last
    if (this.message.t > 0) {
      this.message.t -= dt;
      if (this.message.t <= 0) this.message.text = '';
    }
  }

  /** Damage from an enemy source; handles armor split + HUD face + death. */
  hurtPlayer(dmg, sx, sy) {
    const p = this.player;
    if (this.state !== 'PLAY') return;
    const dist = Math.hypot(p.x - sx, p.y - sy);
    let d = Math.round(dmg * damageFalloff(dist, 10));
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, Math.round(d * 0.7));
      p.armor -= absorbed;
      d -= absorbed;
    }
    if (d <= 0) return;
    p.hp -= d;
    if (p.hp < 0) p.hp = 0;
    let rel = Math.atan2(sy - p.y, sx - p.x) - p.ang;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    p.faceHurt = p.hp > 70 ? 1 : p.hp > 45 ? 2 : p.hp > 20 ? 3 : 4;
    p.faceDir = Math.abs(rel) < Math.PI * 0.75 ? (rel > 0 ? 1 : -1) : 0;
    this.emitSound(p.x, p.y, 8);
    if (p.hp <= 0) {
      this.state = 'DEAD';
      this.setMessage('YOU DIED');
    }
  }

  emitSound(x, y, vol) {
    if (this.soundLen >= 32) return;
    const s = this.sound[this.soundLen++];
    s.x = x; s.y = y; s.vol = vol;
  }

  onProjectileWall(pr) {
    this.emitSound(pr.x, pr.y, 2.5); // wall splat sound
  }

  onProjectileHitEnemy(pr, e) {
    if (pr.dmg) {
      damageEnemy(this, e, pr.dmg);
      this.emitSound(e.x, e.y, 3);
    }
    pr.dmg = 0; // consumed
  }

  render(ctx) {
    const p = this.player;
    this.renderer.flash = p.flash;
    this.renderer.render(
      p.x, p.y, Math.cos(p.ang), Math.sin(p.ang),
      this.view, this.map, this.bg,
      this.state === 'PLAY' ? this.explored : null
    );
    this.renderSprites();
    if (ctx && this.imageData) ctx.putImageData(this.imageData, 0, 0);
  }

  /** Billboards (enemies now; items in stage 5) with z-buffer occlusion. */
  renderSprites() {
    const sr = this.spriteR;
    const p = this.player;
    const cosA = Math.cos(p.ang), sinA = Math.sin(p.ang);
    sr.begin(p.x, p.y, cosA, sinA, this.assets.M, this.W, this.H);
    for (let i = 0; i < this.enemyCount; i++) {
      const e = this.enemies[i];
      const def = ENEMY_DEF[e.type];
      const sp = this.sprites[e.type];
      let set = 'idle', f = 0;
      if (e.state === ST.CORPSE) set = 'corpse';
      else if (e.state === ST.DEATH) { set = 'death'; f = Math.min(3, ((e.deadT / 0.75) * 4) | 0); }
      else if (e.state === ST.PAIN) { set = 'pain'; f = 0; }
      else if (e.state === ST.ATTACK && e.anim === 'atk') { set = 'atk'; f = Math.min(3, (e.animT / 0.45 * 4) | 0); }
      else if (e.anim === 'walk' && e.state === ST.CHASE) { set = 'walk'; f = e.animF & 3; }
      const d = camDepth(p.x, p.y, cosA, sinA, e.x, e.y);
      if (d < 0.25) continue;
      sr.add(e.x, e.y, def.viewH, sp[set][f], sp.w, sp.h, def.lift || 0, lightLevel(d, 0, false));
    }
    // projectiles: bright orbs (no dimming — they emit light)
    this.projectiles.each((pr) => {
      if (!pr.active) return;
      const g2 = this.glows[pr.kind === 'bolt' ? 'bolt' : 'fire'];
      const d = camDepth(p.x, p.y, cosA, sinA, pr.x, pr.y);
      if (d < 0.25) return;
      sr.add(pr.x, pr.y, 0.28, g2.tab, g2.w, g2.h, 0.25, 31);
    });
    sr.render(this.renderer.buf, this.renderer.depth, this.W, this.H);
  }
}
