// Game orchestrator: level state, fixed-step tick, render.
// Grows per stage: enemies (3), weapons (4), doors/keys (5), HUD/menus (6).

import { parseLevel } from '../engine/map.js';
import { Renderer } from '../engine/renderer.js';
import { createPlayer, updatePlayer } from './player.js';
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
    this.stats.levelTime = 0;
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
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 5);
    if (this.message.t > 0) {
      this.message.t -= dt;
      if (this.message.t <= 0) this.message.text = '';
    }
  }

  render(ctx) {
    const p = this.player;
    this.renderer.flash = p.flash;
    this.renderer.render(
      p.x, p.y, Math.cos(p.ang), Math.sin(p.ang),
      this.view, this.map, this.bg,
      this.state === 'PLAY' ? this.explored : null
    );
    if (ctx && this.imageData) ctx.putImageData(this.imageData, 0, 0);
  }
}
