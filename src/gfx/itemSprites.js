// Procedural 32x32 pickup item sprites (Canvas2D offscreen, deterministic).
// One frame per type; packed 0xAABBGGRR, alpha thresholded like enemies.

import { CanvasProxy, StubCtx, makeSpriteCanvas } from './canvas2d.js';

const SZ = 32;

function toU32(data) {
  const out = new Uint32Array(SZ * SZ);
  for (let i = 0; i < SZ * SZ; i++) {
    const a = data[i * 4 + 3];
    out[i] = a >= 128 ? (255 << 24) | (data[i * 4 + 2] << 16) | (data[i * 4 + 1] << 8) | data[i * 4] : 0;
  }
  return out;
}

function paintHealth(c) {
  c.fillStyle = '#e8e0d0'; c.fillRect(9, 22, 14, 9);
  c.fillStyle = '#8a8474'; c.fillRect(9, 22, 14, 1); c.fillRect(9, 30, 14, 1);
  c.fillStyle = '#c03028'; c.fillRect(15, 23, 3, 7); c.fillRect(12, 25, 9, 3);
}

function paintArmor(c) {
  c.fillStyle = '#3f7a36'; c.beginPath(); c.ellipse(16, 26, 7, 5.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2a5424'; c.fillRect(9, 25, 14, 3);
  c.fillStyle = '#5fa050'; c.beginPath(); c.ellipse(14, 23.5, 3, 2.2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1c3a16'; c.fillRect(12, 27, 8, 2); // visor
}

function paintAmmoP(c) {
  c.fillStyle = '#4a3a26'; c.fillRect(8, 24, 16, 7);
  c.fillStyle = '#5f4a30'; c.fillRect(8, 24, 16, 1);
  c.fillStyle = '#c09a52';
  for (let i = 0; i < 4; i++) c.fillRect(10 + i * 3.4, 25.5, 2.4, 4.5);
  c.fillStyle = '#8a6a34';
  for (let i = 0; i < 4; i++) c.fillRect(10 + i * 3.4, 25.5, 2.4, 1.2);
}

function paintAmmoS(c) {
  c.fillStyle = '#3c444e'; c.fillRect(8, 24, 16, 7);
  c.fillStyle = '#505a66'; c.fillRect(8, 24, 16, 1);
  c.fillStyle = '#c04838';
  for (let i = 0; i < 3; i++) { c.fillRect(10 + i * 4.6, 25.5, 3, 4.5); }
  c.fillStyle = '#e8b040';
  for (let i = 0; i < 3; i++) { c.fillRect(10 + i * 4.6, 29.2, 3, 0.8); } // brass base
}

function paintAmmoR(c) {
  c.fillStyle = '#6a3a28'; c.fillRect(9, 18, 14, 13); // wooden crate
  c.fillStyle = '#8a5236'; c.fillRect(9, 18, 14, 2);
  c.fillStyle = '#c8c0b0'; c.fillRect(12, 20, 8, 8); // shell box
  c.fillStyle = '#d8b040'; c.fillRect(13, 21, 6, 3); // primer band
  c.fillStyle = '#30343a'; c.fillRect(14, 24, 4, 4); // fin block
}

function paintAmmoPl(c) {
  c.fillStyle = '#5a6a7a'; c.fillRect(12, 19, 8, 12);
  c.fillStyle = '#7c8c9c'; c.fillRect(12, 19, 8, 2);
  c.fillStyle = '#1c242e'; c.fillRect(13, 17, 6, 2); // cap
  c.fillStyle = '#5affd0'; c.fillRect(13, 22, 6, 3); // glowing band
}

function paintKey(c, body, dark) {
  c.fillStyle = body; c.fillRect(8, 14, 16, 11);
  c.fillStyle = dark; c.fillRect(8, 14, 16, 2); c.fillRect(8, 23, 16, 2);
  c.fillStyle = '#e8e0d0'; c.fillRect(19, 17, 3, 5); // chip window
  c.fillStyle = dark; c.fillRect(10, 20, 7, 2); // stripe
}

const MICRO = {
  E: ['XXXX', 'X...', 'XXX.', 'X...', 'XXXX'],
  X: ['X..X', 'X..X', '.X.X', '.X.X', 'X..X'],
  I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  T: ['XXXX', '.XX.', '.XX.', '.XX.', '.XX.'],
};

/** Tiny 5-tall bitmap text into the 2d context (sprite-space pixels). */
function paintText(c, msg, x, y, color) {
  c.fillStyle = color;
  let cx = x;
  for (const ch of msg) {
    const g = MICRO[ch];
    for (let r = 0; r < 5; r++) for (let col = 0; col < g[r].length; col++) {
      if (g[r][col] === 'X') c.fillRect(cx + col, y + r, 1, 1);
    }
    cx += g[0].length + 1;
  }
}

function paintExit(c) {
  // Tall glowing arch with an up arrow and an EXIT plaque — must NOT read
  // as a medkit cross (player feedback: the old cross looked like health).
  c.fillStyle = '#0c1c0e'; c.beginPath(); c.ellipse(16, 20, 11.5, 11, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1e5c28'; // dark arch body
  c.beginPath();
  c.moveTo(6, 30); c.lineTo(6, 15); c.quadraticCurveTo(6, 5, 16, 5); c.quadraticCurveTo(26, 5, 26, 15); c.lineTo(26, 30);
  c.closePath(); c.fill();
  c.fillStyle = '#3cff5a'; // glowing doorway
  c.beginPath();
  c.moveTo(9, 30); c.lineTo(9, 16); c.quadraticCurveTo(9, 8, 16, 8); c.quadraticCurveTo(23, 8, 23, 16); c.lineTo(23, 30);
  c.lineTo(19.5, 30); c.lineTo(19.5, 17); c.quadraticCurveTo(19.5, 11, 16, 11); c.quadraticCurveTo(12.5, 11, 12.5, 17); c.lineTo(12.5, 30);
  c.closePath(); c.fill();
  c.fillStyle = '#0c1c0e'; // dark up arrow on the glow (contrast)
  c.fillRect(14.9, 15.5, 2.2, 4);
  c.beginPath(); c.moveTo(16, 10.5); c.lineTo(12.2, 16.5); c.lineTo(19.8, 16.5); c.closePath(); c.fill();
  c.fillStyle = '#0c1c0e'; c.fillRect(6, 20, 20, 6); // sign plate
  paintText(c, 'EXIT', 7, 21, '#7dff8e');
}

const PAINT = {
  health: paintHealth,
  armor: paintArmor,
  ammoP: paintAmmoP,
  ammoS: paintAmmoS,
  ammoPl: paintAmmoPl,
  ammoR: paintAmmoR,
  keyR: (c) => paintKey(c, '#c84030', '#7a2018'),
  keyB: (c) => paintKey(c, '#3860c8', '#1c3a7a'),
  exit: paintExit,
};

/**
 * Build the item sprite set.
 * @returns {object} {type: {w:32, h:32, tab:Uint32Array}}
 */
export function buildItemSprites(document) {
  const out = {};
  const base = document ? makeSpriteCanvas(document, SZ, SZ) : null;
  const ctx = base ? base.c : null;
  for (const type of Object.keys(PAINT)) {
    const data = new Uint8ClampedArray(SZ * SZ * 4);
    const c = ctx ? new CanvasProxy(ctx, SZ, SZ, data) : new StubCtx(data, SZ, SZ);
    if (ctx) ctx.clearRect(0, 0, SZ, SZ);
    PAINT[type](c);
    out[type] = { w: SZ, h: SZ, tab: toU32(data) };
  }
  return out;
}
