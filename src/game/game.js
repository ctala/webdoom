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
import { updateWeapons, switchWeapon } from './weapons.js';
import { makeBlood, updateParticles, renderParticles, spawnBlood, BLOOD_MAX } from './particles.js';
import { buildSprites, buildGlowSprites } from '../gfx/sprites.js';
import { buildWeaponSprites } from '../gfx/weaponSprites.js';
import { buildItemSprites } from '../gfx/itemSprites.js';
import { makeFlatBg } from '../gfx/assets.js';
import { castRay } from '../engine/raycaster.js';
import { makeItems, setupItems, updateItems, renderItems } from './items.js';
import { initDoors, updateDoors, useAction, updateIntermission } from './interact.js';
import { renderHud, renderMenu, renderReticle, renderLevelStats } from '../gfx/hud.js';
import { renderAutomap } from './automap.js';
import { diffOf } from './difficulty.js';
import { saveGame, clearSave, loadOpts, applyOpts, levelStats } from './save.js';
import { E1M1 } from '../../levels/e1m1.js';
import { E2M1 } from '../../levels/e2m1.js';
import { E3M1 } from '../../levels/e3m1.js';
import { E4M1 } from '../../levels/e4m1.js';
import { E5M1 } from '../../levels/e5m1.js';

export const DEC_MAX = 128;
const _decRay = { perp: 0, side: 0, cellX: 0, cellY: 0, hitId: 0, texX: 0 };

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
    this.projectiles = new Pool(32, () => ({ x: 0, y: 0, vx: 0, vy: 0, active: false, kind: 'fire', dmg: 10, life: 0, owner: 0, splash: 0, splashDmg: 0 }));
    this.viewModels = buildWeaponSprites(typeof document !== 'undefined' ? document : null);
    this.itemSprites = buildItemSprites(typeof document !== 'undefined' ? document : null);
    makeItems(this);
    makeBlood(this);
    // wall decals: per-level head list (cell,0/1 sides) + fixed item pool
    this.decalItems = new Array(DEC_MAX);
    for (let i = 0; i < DEC_MAX; i++) {
      this.decalItems[i] = { active: false, cell: 0, side: 0, u: 0.5, v: 0.5, u64: 32, v64: 32, r: 3, kind: 1, next: 0 };
    }
    this.decalNext = new Int32Array(DEC_MAX);
    this.decalHead = new Int32Array(2);
    this.rng = 0x1234abcd;
    this.sfx = () => {}; // main.js points this at WebAudio
    this.sound = new Array(32);
    for (let i = 0; i < 32; i++) this.sound[i] = { x: 0, y: 0, vol: 0 };
    this.soundLen = 0;
    this.levelIdx = 0;
    this.levels = [E1M1, E2M1, E3M1, E4M1, E5M1];
    this.diff = 1; // 0 ITYTD, 1 HMP, 2 UV, 3 Nightmare (difficulty.js; menu selects)
    this.message = { text: '', t: 0 };
    this.stats = { kills: 0, totalKills: 0, secrets: 0, totalSecrets: 0, time: 0, levelTime: 0 };
    this.input = { up: false, down: false, left: false, right: false, run: false, fire: false, use: false, map: false };
    this.frame = 0;
    this.loadLevel(0);
    this._booted = true;
    this.opts = loadOpts();
    applyOpts(this, this.opts);
    this.state = 'MENU'; // title screen; ENTER starts (main.js)
  }

  loadLevel(idx, carryKeys = false) {
    const def = this.levels[idx];
    this.levelIdx = idx;
    this.map = parseLevel(def.map, def.name);
    const { gw, gh } = this.map;
    const prev = this.player || null;
    this.player = createPlayer(this.map.player.x, this.map.player.y, def.startAng || 0);
    if (carryKeys && prev) { this.player.keyR = prev.keyR; this.player.keyB = prev.keyB; }
    this.player.flash = 0;
    this.player.wpnCd = 0;
    this.player.swingT = 0;
    this.player.switchT = 0;
    this.player.latch = false;
    this.view = new Uint8Array(gw * gh);
    this.explored = new Uint8Array(gw * gh);
    this.doorH = new Float32Array(gw * gh);
    this.map.doorH = this.doorH; // renderer reads door height through the map
    // wall decals: reset the per-level head lists + expose to the renderer
    this.decalHead = new Int32Array(gw * gh * 2).fill(-1);
    for (const it of this.decalItems) it.active = false;
    this.map.decals = {
      head: this.decalHead, next: this.decalNext, items: this.decalItems,
      blood: this.assets.decalBlood || null, burn: this.assets.decalBurn || null,
    };
    this.rng = 0x1234abcd;
    this.player.pitch = 0;
    this.stats.levelTime = 0;
    this.secretCounted = false;
    this.levelStart = {
      kills: this.stats.kills, secrets: this.stats.secrets,
      totalSecrets: this.stats.totalSecrets, totalKillsBefore: this.stats.totalKills,
    };
    initDoors(this);
    this.setupLevelEntities();
    // per-level theme: floor + ceiling tables
    if (this.assets.floorTables) {
      const th = this.assets.floorTables[(def.theme ?? 0) % this.assets.floorTables.length];
      this.assets.floorTable = th.floor;
      this.assets.ceilTable = th.ceil;
      this.assets.floorTableHaz = th.floorHaz || th.floor;
    }
    this.state = 'PLAY';
    this.paused = false;
    this.rebuildView();
    if (def.objective) { this.setMessage(def.name + ' - ' + def.objective); this.message.t = 6; }
    else this.setMessage(def.name);
    if (this._booted) saveGame(this); // autosave at every level entry (stage 7)
  }

  /** Restart the current level (after death). Full intermission comes in stage 6. */
  respawn() {
    if (this.state === 'PLAY') return;
    this.loadLevel(this.levelIdx);
  }

  setupLevelEntities() {
    setupEnemies(this);
    setupItems(this);
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
    this.player.ang -= mx * 0.0021 * (this.sens || 1);
  }

  /** Vertical look (stage 8, [flash]): shear-only pitch, Doom-style. */
  pitchBy(dy) {
    this.player.pitch = Math.max(-0.42, Math.min(0.42, this.player.pitch + dy));
    return this.player.pitch;
  }

  centerView() {
    this.player.pitch = 0;
  }

  /** Weapon switch (keys 1-4 / wheel); message feedback before HUD. */
  switchWeapon(id) {
    switchWeapon(this, id);
  }

  spawnBlood(x, y, n, dirAng, power) {
    spawnBlood(this, x, y, n, dirAng, power);
  }

  /** Persist one decal on a wall face (kind: 0 blood, 1 burn). */
  addDecal(cell, side, u, kind = 1, r = 3) {
    const hU = this.map.heights[cell] || 2;
    let v = (hU - 1) / hU;
    if (v < 0.25) v = 0.25;
    if (v > 0.75) v = 0.75;
    const R = () => ((this.rng = (Math.imul(this.rng | 0, 1103515245) + 12345) | 0) >>> 8) / 16777216;
    u = (u + (R() - 0.5) * 0.08) % 1;
    if (u < 0) u += 1;
    v += (R() - 0.5) * 0.12;
    if (v < 0.05) v = 0.05;
    if (v > 0.95) v = 0.95;
    const hi = cell * 2 + side;
    // Coalesce + saturate: the renderer walks the per-face chain per pixel,
    // so a face keeps at most 16 decals and near-duplicate splats add nothing.
    let count = 0;
    for (let di = this.decalHead[hi]; di >= 0; di = this.decalNext[di]) {
      count++;
      const it = this.decalItems[di];
      if (it.kind === kind && Math.abs(it.u64 - u * 64) < r && Math.abs(it.v64 - v * 64) < r) return;
      if (count >= 16) return;
    }
    let di = -1;
    for (let i = 0; i < DEC_MAX; i++) if (!this.decalItems[i].active) { di = i; break; }
    if (di < 0) return; // pool full: skip (128 is plenty per level)
    const it = this.decalItems[di];
    it.active = true;
    it.cell = cell;
    it.side = side;
    it.u = u;
    it.v = v;
    it.u64 = u * 64;
    it.v64 = v * 64;
    it.r = r;
    it.kind = kind;
    it.next = this.decalHead[hi];
    this.decalNext[di] = it.next;
    this.decalHead[hi] = di;
  }

  /** Short re-raycast from just behind the impact point to find the exact wall face. */
  addSplatDecalAt(pr) {
    const { gw, gh } = this.map;
    const dl = Math.hypot(pr.vx, pr.vy) || 1;
    const bx = pr.vx / dl, by = pr.vy / dl;
    // pull the origin back into the last open cell, then cast forward again:
    // the first solid cell hit is the wall, with the exact face side + texX
    const ox = pr.x - bx * 0.2, oy = pr.y - by * 0.2;
    if (this.view[Math.floor(oy) * gw + Math.floor(ox)]) {
      this.addDecal(Math.floor(oy) * gw + Math.floor(ox), Math.abs(pr.vx) >= Math.abs(pr.vy) ? 0 : 1, Math.abs(pr.vx) >= Math.abs(pr.vy) ? pr.y % 1 : pr.x % 1, 1, 3);
      return;
    }
    if (castRay(ox, oy, bx, by, this.view, gw, gh, _decRay)) {
      if (_decRay.perp < 1.5) {
        this.addDecal(_decRay.cellY * gw + _decRay.cellX, _decRay.side, _decRay.texX);
      }
    }
  }

  tick(dt) {
    if (updateIntermission(this, dt)) return; // counts down and loads the next level
    if (this.state !== 'PLAY' || this.paused) return;
    const p = this.player;
    this.stats.levelTime += dt;
    this.vShear = Math.tan(p.pitch) * this.H * 0.5;
    this.renderer.shear = this.vShear;
    this.spriteR.shear = this.vShear;
    updatePlayer(p, this.input, dt, this.view, this.map);
    if (this.input.use) { useAction(this); this.input.use = false; }
    updateWeapons(this, dt);
    updateProjectiles(this, dt);
    updateParticles(this, dt);
    updateItems(this);
    updateDoors(this, dt);
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 5);
    if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 2.2);
    if (p.hurtVig > 0) p.hurtVig = Math.max(0, p.hurtVig - dt * 1.3);
    if (p.invis > 0) p.invis = Math.max(0, p.invis - dt);
    if (p.suit > 0) p.suit = Math.max(0, p.suit - dt);
    if (this.map.hasHazard && p.suit <= 0) {
      // toxic floor: steady 10 hp/s chunks through the normal hurt path
      const cell = Math.floor(p.y) * this.map.gw + Math.floor(p.x);
      if (this.map.hazard[cell]) {
        p.hazAcc = (p.hazAcc || 0) + dt;
        if (p.hazAcc >= 0.3) {
          p.hazAcc = 0;
          this.hurtPlayer(3, p.x, p.y);
          this.sfx('hazard');
        }
      } else p.hazAcc = 0;
    }
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
    let d = Math.round(dmg * damageFalloff(dist, 10) * diffOf(this).dmgTaken);
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
    p.shake = Math.min(1, p.shake + 0.12 + d * 0.02); // camera kick (game feel)
    p.hurtVig = Math.min(1, p.hurtVig + 0.2 + d * 0.05); // red screen edge
    this.emitSound(p.x, p.y, 8);
    this.sfx('hurt');
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

  /** Rocket blast: splash to enemies (+ player if the shooter stands too close). */
  explodeRocket(pr) {
    this.sfx('boom', pr.x, pr.y);
    this.addSplatDecalAt(pr);
    this.spawnBlood(pr.x, pr.y, 6, 0, 6);
    const sd = pr.splashDmg || 60;
    const SP = 2.4 * 2.4;
    for (let i = 0; i < this.enemyCount; i++) {
      const e2 = this.enemies[i];
      if (e2.state === 5 || e2.state === 6) continue;
      const dx = e2.x - pr.x, dy = e2.y - pr.y;
      if (dx * dx + dy * dy < SP) {
        damageEnemy(this, e2, Math.round(sd * damageFalloff(Math.hypot(dx, dy), 2.4)));
        this.spawnBlood(e2.x, e2.y, 6, Math.atan2(dy, dx), 4);
      }
    }
    if (pr.owner === 1) {
      const p = this.player;
      const pd = Math.hypot(p.x - pr.x, p.y - pr.y);
      if (pd < 2.4) this.hurtPlayer(Math.round(sd * damageFalloff(pd, 2.4)), pr.x, pr.y);
    }
  }

  onProjectileWall(pr) {
    if (pr.owner === 1 && pr.kind === 'rocket') this.explodeRocket(pr);
    this.emitSound(pr.x, pr.y, 2.5); // wall splat sound
    if (pr.owner === 1 && pr.kind === 'plasma') this.addSplatDecalAt(pr);
    else if (pr.owner === 0 && pr.kind === 'fire') {
      const { gw } = this.map;
      const cx = Math.floor(Math.max(0, Math.min(gw - 1, pr.x)));
      const cy = Math.floor(Math.max(0, Math.min(this.map.gh - 1, pr.y)));
      const cell = cy * gw + cx;
      if (this.map.solid[cell]) this.addDecal(cell, Math.abs(pr.vx) >= Math.abs(pr.vy) ? 0 : 1, Math.abs(pr.vx) >= Math.abs(pr.vy) ? pr.y % 1 : pr.x % 1, 1, 2);
    }
  }

  onProjectileHitEnemy(pr, e) {
    if (pr.kind === 'rocket') this.explodeRocket(pr);
    if (pr.dmg) {
      damageEnemy(this, e, pr.dmg);
      this.spawnBlood(e.x, e.y, 8, Math.atan2(-pr.vy, -pr.vx), Math.hypot(pr.vx, pr.vy) * 0.5);
      this.emitSound(e.x, e.y, 3);
    }
    if (pr.splash) {
      // plasma area damage around the impact point
      for (let i = 0; i < this.enemyCount; i++) {
        const e2 = this.enemies[i];
        if (e2 === e || e2.state === 5 || e2.state === 6) continue;
        const dx = e2.x - pr.x, dy = e2.y - pr.y;
        if (dx * dx + dy * dy < pr.splash * pr.splash) {
          damageEnemy(this, e2, pr.splashDmg);
          this.spawnBlood(e2.x, e2.y, 4, Math.atan2(dy, dx), 3);
        }
      }
    }
    pr.dmg = 0; // consumed
  }

  render(ctx) {
    this.frame++;
    const p = this.player;
    // game feel: camera shake (decayed p.shake + a low-HP tremor) as a tiny
    // yaw jitter + horizon bounce, shared by walls, floor, sprites, particles.
    const sh = Math.min(1, (p.shake || 0) + (p.hp < 40 && this.state === 'PLAY'
      ? 0.05 + 0.04 * Math.sin(this.frame * 0.16) : 0));
    const jx = sh * Math.sin(this.frame * 0.47) * 0.013;
    this.vAng = p.ang + jx;
    this.vJy = sh * Math.sin(this.frame * 0.71 + 1.3) * 4.5;
    this.vShear = Math.tan(p.pitch) * this.H * 0.5;
    this.renderer.shear = this.vShear;
    this.spriteR.shear = this.vShear;
    this.renderer.jy = this.vJy;
    this.spriteR.jy = this.vJy;
    this.renderer.flash = p.flash;
    // dynamic lights (<=8): muzzle flash decay + active plasma bolts
    const L = this._lights || (this._lights = []);
    L.length = 0;
    if (p.flash > 0.25) L.push({ x: p.x, y: p.y, r: 6.5, i: p.flash * 12 });
    this.projectiles.each((pr) => {
      if (pr.active && (pr.kind === 'plasma' || pr.kind === 'rocket') && L.length < 8) {
        L.push({ x: pr.x, y: pr.y, r: pr.kind === 'rocket' ? 4.5 : 4.0, i: 10 });
      }
    });
    this.renderer.lights = this.state === 'PLAY' ? L : null;
    this.renderer.render(
      p.x, p.y, Math.cos(this.vAng), Math.sin(this.vAng),
      this.view, this.map, this.bg,
      this.state === 'PLAY' ? this.explored : null
    );
    this.renderSprites();
    renderParticles(this);
    this.renderViewmodel();
    if (this.state === 'PLAY') {
      this.renderer.applyVignette(Math.min(1, p.hurtVig + (p.hp < 35 ? 0.3 : 0)));
    } else {
      this.renderer.applyVignette(0);
    }
    renderReticle(this);
    if (this.state === 'PLAY') renderHud(this);
    if (this.state === 'PLAY' && this.input.map) renderAutomap(this);
    if (this.state === 'MENU') renderMenu(this);
    if (this.state === 'INTERM') renderLevelStats(this);
    if (ctx && this.imageData) ctx.putImageData(this.imageData, 0, 0);
  }

  /** Billboards (enemies now; items in stage 5) with z-buffer occlusion. */
  renderSprites() {
    const sr = this.spriteR;
    const p = this.player;
    const vAng = this.vAng !== undefined ? this.vAng : p.ang;
    const cosA = Math.cos(vAng), sinA = Math.sin(vAng);
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
    renderItems(this, sr, p, cosA, sinA);
    const ex = this.map.exit; // exit switch: lit green marker so it reads across the room
    if (ex) {
      const exs = this.itemSprites.exit;
      const d = camDepth(p.x, p.y, cosA, sinA, ex.x, ex.y);
      if (d >= 0.25) sr.add(ex.x, ex.y, 0.8, exs.tab, exs.w, exs.h, 0, lightLevel(d, 0, false));
    }
    // projectiles: bright orbs (no dimming — they emit light)
    this.projectiles.each((pr) => {
      if (!pr.active) return;
      const g2 = this.glows[pr.kind === 'bolt' ? 'bolt' : 'fire'];
      const d = camDepth(p.x, p.y, cosA, sinA, pr.x, pr.y);
      if (d < 0.25) return;
      sr.add(pr.x, pr.y, pr.kind === 'rocket' ? 0.36 : 0.28, g2.tab, g2.w, g2.h, 0.25, 31);
    });
    sr.render(this.renderer.buf, this.renderer.depth, this.W, this.H);
  }

  /** First-person weapon viewmodel, bottom-center with walk bob. */
  renderViewmodel() {
    const p = this.player;
    const ws = this.viewModels[p.weapon];
    if (!ws) return;
    const fire = p.swingT > 0 && this.state === 'PLAY';
    // fists alternate hands (fire[1] = mirrored frame); guns keep one fire frame
    const fi = fire && p.weapon === 1 && ws.fire[1] ? (p.punchParity || 0) : 0;
    const tab = (fire ? ws.fire[fi] : ws.idle[0]) || ws.fire[0] || ws.idle[0];
    if (!tab) return;
    const { W, H } = this;
    const buf = this.renderer.buf;
    const w = W * 0.36;
    const h = w * (ws.h / ws.w);
    const drop = p.switchT > 0 ? (p.switchT / 0.16) * 10 : 0; // switch anim: rise into place
    const kick = fire ? (p.swingT / 0.18) * 6 : 0; // recoil kick-down
    const bx = W * 0.5 + W * 0.09 + Math.cos(p.bob) * 3 - w * 0.5; // left edge
    const by = H - h + drop + Math.sin(p.bob) * 2 + (fire ? -4 + kick : 0);
    const x0 = Math.max(0, bx | 0);
    const x1 = Math.min(W - 1, (bx + w) | 0);
    const y0 = Math.max(0, by | 0);
    const y1 = Math.min(H - 1, (by + h) | 0);
    const pxw = ws.w / w;
    const pxh = ws.h / h;
    for (let x = x0; x <= x1; x++) {
      let u = ((x - bx) * pxw) | 0;
      if (u < 0) u = 0; else if (u >= ws.w) u = ws.w - 1;
      for (let y = y0; y <= y1; y++) {
        let v = ((y - by) * pxh) | 0;
        if (v < 0) v = 0; else if (v >= ws.h) v = ws.h - 1;
        const c = tab[v * ws.w + u];
        if (c) buf[y * W + x] = c;
      }
    }
  }
}
