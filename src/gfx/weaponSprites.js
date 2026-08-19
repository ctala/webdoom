// First-person weapon viewmodels (procedural, 128x80, idle + fire frames).
// Rendered bottom-center over the world with a walk bob (see game.renderViewmodel).

import { CanvasProxy, StubCtx, makeSpriteCanvas } from './canvas2d.js';

const W2 = 128, H2 = 80;

function toU32(data) {
  const out = new Uint32Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) {
    const a = data[i * 4 + 3];
    out[i] = a >= 128 ? (255 << 24) | (data[i * 4 + 2] << 16) | (data[i * 4 + 1] << 8) | data[i * 4] : 0;
  }
  return out;
}

function rect(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}
function blob(c, cx, cy, rx, ry, col) {
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function spike(c, cx, cy, ang, len, w, col) {
  c.save();
  c.translate(cx, cy);
  c.rotate(ang);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-w * 0.5, -len);
  c.lineTo(w * 0.5, -len);
  c.closePath();
  c.fill();
  c.restore();
}

const GUN = '#2b2b33', GUNDARK = '#14141a', GUNLIGHT = '#4a4a55';
const WOOD = '#5a3a22', PULSE = '#39ffcf', PULSEC = '#0e6e52';
const SKIN = '#8a6248', SKIND = '#5e4030';
const FLASH = '#ffd94a', FLASHC = '#fff2c0';

function paintFist(c, fire) {
  if (!fire) {
    // guard: both fists low
    blob(c, 26, 66, 15, 13, SKIND);
    blob(c, 22, 62, 9, 8, SKIN);
    blob(c, 102, 68, 15, 13, SKIND);
    blob(c, 106, 64, 9, 8, SKIN);
    for (const kx of [14, 24, 34]) { c.fillStyle = SKIND; c.fillRect(kx - 1, 52, 2, 4); }
    for (const kx of [94, 104, 114]) { c.fillStyle = SKIND; c.fillRect(kx - 1, 54, 2, 4); }
  } else {
    // punch: left fist thrusts toward center
    rect(c, 24, 42, 44, 15, SKIND);
    blob(c, 68, 48, 13, 11, SKIN);
    blob(c, 74, 46, 7, 6, '#a0745a');
    blob(c, 106, 68, 15, 13, SKIND);
    blob(c, 110, 64, 9, 8, SKIN);
  }
}

function paintPistol(c, fire) {
  if (fire) {
    spike(c, 86, 14, -0.5, 16, 5, FLASH);
    spike(c, 86, 14, 0.4, 14, 4, FLASH);
    spike(c, 86, 14, 0, 18, 3, FLASHC);
    blob(c, 86, 14, 7, 7, FLASHC);
  }
  const dy = fire ? -3 : 0;
  rect(c, 74, 24 + dy, 24, 20, GUN);
  rect(c, 80, 18 + dy, 12, 10, GUNDARK);
  rect(c, 83, 14 + dy, 6, 6, PULSEC);
  rect(c, 74, 42 + dy, 24, 8, GUNLIGHT);
  rect(c, 78, 48, 20, 26, GUNDARK);
  rect(c, 82, 54, 12, 16, WOOD);
}

function paintShotgun(c, fire) {
  if (fire) {
    blob(c, 80, 12, 9, 9, FLASH);
    blob(c, 80, 12, 5, 5, FLASHC);
    spike(c, 80, 12, -0.8, 16, 5, FLASH);
    spike(c, 80, 12, 0.8, 16, 5, FLASH);
  }
  const dy = fire ? -4 : 0;
  rect(c, 62, 20 + dy, 36, 26, GUN);
  rect(c, 70, 20 + dy, 8, 8, GUNDARK);
  rect(c, 86, 20 + dy, 8, 8, GUNDARK);
  rect(c, 62, 44 + dy, 36, 10, GUNLIGHT);
  rect(c, 66, 52, 28, 24, WOOD);
  rect(c, 74, 58, 12, 14, GUNDARK);
}

function paintPlasma(c, fire) {
  const glow = fire ? 11 : 7;
  blob(c, 84, 18, glow + 4, glow + 4, fire ? FLASH : '#1d5a4a');
  blob(c, 84, 18, glow, glow, PULSE);
  blob(c, 84, 18, glow * 0.45, glow * 0.45, FLASHC);
  if (fire) {
    rect(c, 83, 4, 2, 14, PULSE);
    rect(c, 76, 17, 16, 2, PULSE);
  }
  rect(c, 70, 22, 28, 22, '#23303a');
  rect(c, 76, 26, 16, 6, PULSEC);
  rect(c, 70, 42, 28, 8, GUNLIGHT);
  rect(c, 74, 48, 20, 28, GUNDARK);
  rect(c, 78, 56, 12, 14, '#101820');
  blob(c, 84, 34, 5, 5, PULSE);
}

const PAINT = { 1: paintFist, 2: paintPistol, 3: paintShotgun, 4: paintPlasma };

/**
 * Build viewmodel frames for all weapons.
 * @returns {{1:{w,h,idle:Uint32Array[],fire:Uint32Array[]},2:...,3:...,4:...}}
 */
export function buildWeaponSprites(document) {
  const out = {};
  const base = document ? makeSpriteCanvas(document, W2, H2) : null;
  const ctx = base ? base.c : null;
  for (const id of Object.keys(PAINT)) {
    out[id] = { w: W2, h: H2, idle: [], fire: [] };
    for (let f = 0; f < 2; f++) {
      const data = new Uint8ClampedArray(W2 * H2 * 4);
      const c2 = ctx
        ? (ctx.clearRect(0, 0, W2, H2), new CanvasProxy(ctx, W2, H2, data))
        : new StubCtx(data, W2, H2);
      PAINT[id](c2, f === 1);
      (f === 1 ? out[id].fire : out[id].idle).push(toU32(data));
    }
  }
  return out;
}
