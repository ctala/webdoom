// Procedural 32x32 enemy sprite sets (Canvas2D offscreen, deterministic).
// Each type exposes frame arrays: idle[1], walk[4], atk[4], pain[2],
// death[4], corpse[1]. Packed 0xAABBGGRR, alpha thresholded (>=128 opaque).

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

function blob(c, cx, cy, rx, ry, col) {
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function horn(c, x, y, dir, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + 4 * dir, y - 8);
  c.lineTo(x + 7 * dir, y + 1);
  c.closePath();
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
function dot(c, x, y, r, col) {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/* ------- per-type painters: (c, set, f, t) t = type ------- */

function paintImp(c, set, f) {
  const sway = set === 'walk' ? [0, -1, 0, 1][f & 3] : (set === 'idle' ? 0 : 0);
  let by = 19 + Math.sin(f * 2.1) * 0; // base
  let squash = 1;
  if (set === 'pain') { by += 2; squash = 0.9; }
  if (set === 'death') {
    const t = f / 3; // 0..1 falling
    by = 24 + t * 3;
    squash = 1 - t * 0.6;
    blob(c, 16, 28, 5 + f * 2.5, 1.6 + f * 0.5, '#4a100c'); // gore pool
    if (f === 3) { blob(c, 16, 28, 4, 1.2, '#6a1810'); }
  }
  if (set !== 'corpse') {
    blob(c, 14.5 + sway, by + 8.5, 2.4, 2.6 - squash, '#37572a'); // leg
    blob(c, 18.5 - sway, by + 8.5, 2.4, 2.6 - squash, '#37572a');
    blob(c, 16, by, 7.5 * squash, 8.5 * squash, '#4c7a3a'); // body
    blob(c, 16, by - 2, 5.5 * squash, 5.5, '#5c8a48');
    blob(c, 16, by - 8 * squash, 5.8, 5.2, '#4c7a3a'); // head
    horn(c, 11, by - 11, -1, '#d8c8a0');
    horn(c, 21, by - 11, 1, '#d8c8a0');
    const ex = set === 'pain' ? 1 : 1.6;
    dot(c, 13.6, by - 8.5, ex, set === 'pain' ? '#ffffff' : '#ff4030');
    dot(c, 18.4, by - 8.5, ex, set === 'pain' ? '#ffffff' : '#ff4030');
    // arms
    let ay = by - 1, awp = 0;
    if (set === 'atk') {
      const up = [0, 0.5, 1, 1][f];
      ay = by - 1 - up * 9; awp = 9;
      if (f >= 3) dot(c, 24.5, ay - 3, 3.2, f === 3 ? '#ffb040' : '#ff7030'); // fireball
    }
    const armRy = Math.max(0.6, 2 - awp * 0.25); // never pass a negative radius to ellipse()
    blob(c, 9.5 - awp * 0.3, ay, 2, armRy, set === 'pain' ? '#3a5c2e' : '#4c7a3a');
    blob(c, 22.5 + awp * 0.3, ay - up(awp), 2, armRy, set === 'pain' ? '#3a5c2e' : '#4c7a3a');
    if (set === 'corpse') { blob(c, 16, 27, 8, 3, '#3a4a2c'); blob(c, 16, 27, 6, 1.6, '#571511'); }
  }
  function up(v) { return v > 0 ? 6 : 0; }
}

function paintDemon(c, set, f) {
  const sway = set === 'walk' ? [0, -1.5, 0, 1.5][f & 3] : 0;
  let by = 18;
  let squash = 1;
  if (set === 'pain') { by += 1.5; squash = 0.93; }
  if (set === 'death') {
    const t = f / 3;
    by = 23 + t * 4; squash = 1 - t * 0.55;
    blob(c, 16, 28, 6 + f * 2.5, 1.8, '#3f0d0a');
  }
  if (set !== 'corpse') {
    blob(c, 13 + sway, by + 9, 2.8, 3, '#4a1512');
    blob(c, 19 - sway, by + 9, 2.8, 3, '#4a1512');
    blob(c, 16, by, 9.5 * squash, 10.5 * squash, '#8a2f2a'); // wide body
    blob(c, 16, by - 3, 7 * squash, 6, '#a03a32');
    blob(c, 16, by - 10, 6, 5.4, '#8a2f2a'); // head
    dot(c, 16, by - 10.5, 3.6, '#701f1a'); // brow
    dot(c, 13.4, by - 10, 1.4, '#ffd040');
    dot(c, 18.6, by - 10, 1.4, '#ffd040');
    // maw
    blob(c, 16, by - 7.4, 2.6, 1.4, '#3a0d0a');
    // claw arms
    let ay = by + 2, upAmt = 0;
    if (set === 'atk') { upAmt = [0, 0.6, 1, 0.7][f]; ay = by + 2 - upAmt * 12; }
    blob(c, 7.5, ay, 2.6, 2.6 - upAmt, '#6a231e');
    blob(c, 24.5, ay, 2.6, 2.6 - upAmt, '#6a231e');
    if (upAmt > 0.4) { // claws
      c.strokeStyle = '#e8d8b0'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(7.5, ay); c.lineTo(6, ay - 5); c.stroke();
      c.beginPath(); c.moveTo(24.5, ay); c.lineTo(26, ay - 5); c.stroke();
    }
  } else { blob(c, 16, 26.5, 9, 3.2, '#4e1713'); blob(c, 15, 26.5, 7, 1.8, '#5e1410'); }
}

function paintCommander(c, set, f) {
  const step = set === 'walk' ? [0, -1, 0, 1][f & 3] : 0;
  let by = 20;
  if (set === 'pain') by += 1;
  if (set === 'death') {
    const t = f / 3;
    by = 22 + t * 4;
    blob(c, 16, 27.5, 4 + f * 2, 1.4 + t, '#3a0d0a');
  }
  if (set !== 'corpse') {
    c.fillStyle = '#39424e';
    c.fillRect(12 + step * 0.4, by + 3, 3, 7 - step * 0.4); // legs
    c.fillRect(17 - step * 0.4, by + 3, 3, 7 + step * 0.4);
    c.fillStyle = '#4a5a6a';
    c.beginPath();
    c.moveTo(10, by - 8);
    c.lineTo(22, by - 8);
    c.lineTo(24, by + 4);
    c.lineTo(8, by + 4);
    c.closePath(); c.fill(); // torso
    c.fillStyle = '#2c3540';
    c.fillRect(11, by - 6, 10, 2); // belt
    c.fillStyle = '#5a6a7a';
    c.beginPath(); c.arc(16, by - 12, 4.6, 0, Math.PI * 2); c.fill(); // helmet
    c.fillStyle = '#141a20';
    c.fillRect(12, by - 13, 8, 3); // visor
    // arms + gun
    let gy = by - 2, up = 0;
    if (set === 'atk') { up = [0, 4, 6, 6][f]; gy = by - 2 - up; }
    c.fillStyle = '#4a5a6a';
    c.fillRect(21, by - 6, 3, 5); // shoulder arm
    c.fillStyle = '#181c22';
    c.fillRect(21, gy - 1, 10, 3); // gun barrel
    c.fillStyle = '#2c3540';
    c.fillRect(21, gy + 2, 4, 4); // grip
    if (set === 'atk' && f >= 2) {
      c.fillStyle = f === 3 ? '#ffe090' : '#ffb040';
      c.beginPath(); c.arc(31, gy, f === 3 ? 3.4 : 2.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.fillRect(30, gy - 1, 3, 2);
    }
  } else {
    c.fillStyle = '#414c58';
    c.fillRect(8, 25, 16, 4);
    c.beginPath(); c.arc(10, 25, 3, 0, Math.PI * 2); c.fill();
    blob(c, 16, 28, 8, 2, '#3a0d0a');
  }
}

function paintCaco(c, set, f) {
  let bob = set === 'idle' ? [0, -2][f & 1] : 0;
  let cy = 14 + bob;
  let r = 9.5;
  if (set === 'pain') { cy += 2; r = 8.6; }
  if (set === 'death') {
    const t = f / 3;
    r = 9.5 * (1 - t * 0.8);
    cy = 15 + t * 6;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const d2 = 10 + f * 3;
      dot(c, 16 + Math.cos(a) * d2, 16 + Math.sin(a) * d2 * 0.7, 1.6 - f * 0.3, '#7a4a9a');
    }
    blob(c, 16, 28, 6 + f * 2, 1.8, '#4a100c');
  }
  if (set !== 'corpse') {
    for (let k = 0; k < 5; k++) { // crown spikes
      const a = -Math.PI / 2 + (k - 2) * 0.55;
      spike(c, 16 + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, a, 4.5 + (k % 2) * 1.5, 2.6, '#d8b8e8');
    }
    blob(c, 16, cy, r, r * 0.92, set === 'pain' ? '#583575' : '#6a3f8a');
    blob(c, 16, cy - 1.5, r * 0.66, r * 0.6, '#7a4f9a');
    blob(c, 16, cy + 4, r * 0.5, r * 0.34, set === 'pain' ? '#3e2258' : '#4a2a63'); // mouth band
    dot(c, 12.6, cy - 1.5, 1.7, '#ffd840');
    dot(c, 19.4, cy - 1.5, 1.7, '#ffd840');
    c.fillStyle = '#1c1026';
    c.fillRect(13.4, cy - 2.2, 1.6, 1.6);
    c.fillRect(19, cy - 2.2, 1.6, 1.6);
    if (set === 'atk' && f >= 1) {
      dot(c, 16, cy + 5, 1.6 + f * 0.9, f >= 3 ? '#ffb040' : '#ff7040');
      if (f >= 3) dot(c, 16, cy + 5, 2.6, '#ffd070');
    }
  } else { blob(c, 16, 26, 7, 3.4, '#4a2a63'); blob(c, 16, 27, 5.5, 1.6, '#4e1410'); }
}

function paintBoss(c, set, f) {
  let cy = 13, r = 11;
  if (set === 'idle') cy += [0, -2][f & 1];
  if (set === 'pain') { cy += 2; r = 10; }
  if (set === 'death') {
    const t = f / 3;
    r = 11 * (1 - t * 0.75);
    cy = 14 + t * 7;
    for (let k = 0; k < 10; k++) { // ember burst
      const a = k / 10 * Math.PI * 2 + f * 0.7;
      dot(c, 16 + Math.cos(a) * (9 + f * 5), 15 + Math.sin(a) * (9 + f * 5) * 0.7, 1.9 - f * 0.3, '#d0703c');
    }
    blob(c, 16, 28, 6 + f * 2.5, 1.8, '#4a100c');
  }
  if (set !== 'corpse') {
    for (let k = 0; k < 8; k++) { // crown of spikes
      const a = k / 8 * Math.PI * 2 - Math.PI / 2;
      spike(c, 16 + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, a, 5 + (k % 3), 3, '#e05540');
    }
    blob(c, 16, cy, r, r * 0.94, set === 'pain' ? '#701c16' : '#92281e');
    blob(c, 16, cy - 2, r * 0.62, r * 0.55, '#b8402e');
    const flare = set === 'atk' && f >= 2;
    dot(c, 16, cy + 1, 3.4 + f * 0.4, flare ? '#ffd060' : '#ff9030'); // molten core
    dot(c, 16, cy + 1, 2, flare ? '#fff0b0' : '#ffc860');
    dot(c, 11.5, cy - 3.5, 2, '#ffd840'); // eyes
    dot(c, 20.5, cy - 3.5, 2, '#ffd840');
    c.fillStyle = '#200a08';
    c.fillRect(10.6, cy - 4.4, 1.8, 1.8);
    c.fillRect(19.6, cy - 4.4, 1.8, 1.8);
    if (set === 'atk' && f >= 1) {
      dot(c, 16, cy + 6, 1.8 + f * 0.9, f >= 3 ? '#ffb040' : '#ff7040');
      if (f >= 3) dot(c, 16, cy + 6, 3, '#ffd070');
    }
  }
}

function paintCorpse(c, t) {
  c.clearRect(0, 0, SZ, SZ);
  const map = {
    imp: ['#3a4a2c', '#571511', 4],
    demon: ['#4e1713', '#5e1410', 5],
    commander: ['#414c58', '#3a0d0a', 4],
    caco: ['#4a2a63', '#4e1410', 5],
    boss: ['#92281e', '#5e1410', 8],
  };
  const [body, blood, seed] = map[t];
  const h1 = (i) => ((i * 9301 + seed * 49297) % 233280) / 233280;
  c.fillStyle = body;
  c.beginPath(); c.ellipse(16, 24 - h1(1) * 2, 8 + h1(2) * 3, 3 + h1(3), h1(4) * 0.6 - 0.3, 0, Math.PI * 2); c.fill();
  c.fillStyle = blood;
  c.beginPath(); c.ellipse(16, 27.5 - h1(5), 10, 2.2, 0, 0, Math.PI * 2); c.fill();
  for (let k = 0; k < 7; k++) {
    dot(c, 8 + h1(10 + k) * 16, 25 + h1(30 + k) * 5, 1.2, blood);
  }
}

const PAINT = { imp: paintImp, demon: paintDemon, commander: paintCommander, caco: paintCaco, boss: paintBoss };
const SETS = { idle: 1, walk: 4, atk: 4, pain: 2, death: 4, corpse: 1 };

/** Small 8x8 glowing orbs for projectiles (fireball / caco bolt). */
export function buildGlowSprites(document) {
  const sizes = { fire: { col: [255, 128, 48], core: [255, 220, 140] }, bolt: { col: [190, 90, 255], core: [230, 180, 255] } };
  const out = {};
  for (const name of Object.keys(sizes)) {
    const S2 = 8;
    const data = new Uint8ClampedArray(S2 * S2 * 4);
    const { col, core } = sizes[name];
    for (let y = 0; y < S2; y++)
      for (let x = 0; x < S2; x++) {
        const d = Math.hypot(x - 3.5, y - 3.5);
        let a = 0, r = col[0], g2 = col[1], b = col[2];
        if (d < 4) {
          a = d < 1.8 ? 255 : Math.round(255 * (4 - d) / 2.2);
          if (d < 1.8) { r = core[0]; g2 = core[1]; b = core[2]; }
        }
        const i = (y * S2 + x) * 4;
        data[i] = r; data[i + 1] = g2; data[i + 2] = b; data[i + 3] = a;
      }
    const tab = new Uint32Array(S2 * S2);
    for (let i = 0; i < S2 * S2; i++) {
      const j = i * 4;
      tab[i] = data[j + 3] >= 128 ? (255 << 24) | (data[j + 2] << 16) | (data[j + 1] << 8) | data[j] : 0;
    }
    out[name] = { tab, w: S2, h: S2 };
  }
  return out;
}

/**
 * Build all enemy sprite sets.
 * @returns {{im: {imp: {w,h, idle:Uint32Array[], walk:[], ...}, ...}}}
 */
export function buildSprites(document) {
  const out = {};
  const base = document ? makeSpriteCanvas(document, SZ, SZ) : null;
  const ctx = base ? base.c : null;
  for (const t of Object.keys(PAINT)) {
    out[t] = { w: SZ, h: SZ };
    for (const set of Object.keys(SETS)) {
      out[t][set] = [];
      for (let f = 0; f < SETS[set]; f++) {
        const data = new Uint8ClampedArray(SZ * SZ * 4);
        const c2 = ctx
          ? (ctx.clearRect(0, 0, SZ, SZ), new CanvasProxy(ctx, SZ, SZ, data))
          : new StubCtx(data, SZ, SZ);
        if (set === 'corpse') paintCorpse(c2, t);
        else PAINT[t](c2, set, f);
        out[t][set].push(toU32(data));
      }
    }
  }
  return out;
}

