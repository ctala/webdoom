// Procedural texture generators (480x270 world, 64x64 texels).
// Each generator paints into a raw RGBA byte buffer (an ImageData buffer,
// i.e. Canvas2D offscreen pixels when a document is available). Buffers are
// compiled into 64-level shade tables laid out [texel][level]:
//   level 0..31  = brightness 0..31
//   level 32..63 = same brightness with 28% side dimming (E/O faces)
// Packed as 0xAABBGGRR for the little-endian Uint32 screen buffer.
// Fully deterministic (hashed noise), zero binary assets.

import { M, TEX } from './assets.js';
const S = TEX; // 64

function hash(x, y, seed) {
  let h = (x * 374761393) ^ (y * 668265263) ^ (seed * 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return h / 4294967295;
}
/** low-frequency mottle (0..1) from coarse hash cells */
function blot(x, y, seed) {
  const cx = x >> 2, cy = y >> 2;
  return (hash(cx, cy, seed) + hash(cx + 31, cy + 17, seed + 7)) * 0.5;
}
function putPx(px, i, r, g, b) {
  px[i] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  px[i + 3] = 255;
}

/* ---------------- wall generators ---------------- */

function paintBrick(px, seed) {
  for (let y = 0; y < S; y++) {
    const row = y >> 3;
    const off = (row & 1) ? 8 : 0;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const mx = ((x + off) % 16 + 16) % 16;
      const mortar = (y % 8 < 2) || (mx < 2);
      if (mortar) {
        const n = (hash(x, y, seed) - 0.5) * 14;
        putPx(px, i, 44 + n, 30 + n, 22 + n);
      } else {
        const n = (hash(x, y, seed) - 0.5) * 26;
        const top = y % 8 === 2 ? 14 : 0;
        const edge = mx === 15 ? -12 : 0;
        const chip = hash(x, y, seed + 3) > 0.985 ? -34 : 0;
        putPx(px, i, 146 + n + top + edge + chip, 70 + n * 0.8 + top * 0.7, 44 + n * 0.6 + top * 0.5);
      }
    }
  }
}

function paintTech(px, seed) {
  for (let y = 0; y < S; y++) {
    const band = (y & 31) < 16 ? 5 : -5;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const seam = x % 32 === 0 || y % 32 === 0;
      const rivX = x % 32 === 2 || x % 32 === 29;
      const rivY = y % 32 === 2 || y % 32 === 29;
      if (seam) {
        const n = (hash(x, y, seed) - 0.5) * 8;
        putPx(px, i, 32 + n, 42 + n, 56 + n);
      } else if (rivX && rivY) {
        putPx(px, i, 150, 168, 190);
      } else {
        const n = (hash(x, y, seed) - 0.5) * 13 + band;
        putPx(px, i, 70 + n, 88 + n, 110 + n);
      }
    }
  }
}

function paintStone(px, seed) {
  for (let y = 0; y < S; y++) {
    const row = y >> 4;
    const off = (row & 1) ? 16 : 0;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const mx = ((x + off) % 32 + 32) % 32;
      const mortar = (y % 16 < 2) || (mx < 2);
      const m = blot(x, y, seed);
      if (mortar) {
        const n = (hash(x, y, seed) - 0.5) * 10;
        putPx(px, i, 56 + n, 52 + n, 48 + n);
      } else {
        const v = (m - 0.5) * 42 + (hash(x, y, seed) - 0.5) * 12;
        putPx(px, i, 116 + v, 108 + v * 0.9, 96 + v * 0.8);
      }
    }
  }
}

function paintMetal(px, seed) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const vSeam = x % 32 === 31 || x % 32 === 30;
      const hSeam = y % 32 === 31;
      const rivet = x % 32 === 4 && y % 32 === 4;
      const shade = Math.sin(y * 0.22) * 4 + (hash(x, y, seed) - 0.5) * 9;
      if (vSeam || hSeam) putPx(px, i, 46 + shade, 48 + shade, 56 + shade);
      else if (rivet) putPx(px, i, 148, 150, 160);
      else putPx(px, i, 92 + shade, 95 + shade, 106 + shade);
    }
  }
}

function paintDoor(px, seed, stripe) {
  // stripe: null plain, 1 red, 2 blue, 3 secret-brick
  if (stripe === 3) {
    paintBrick(px, seed);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (x === 31 || x === 32 || y === 31 || y === 32) {
        const i = (y * S + x) * 4;
        putPx(px, i, 30, 24, 18);
      }
    }
    return;
  }
  const sr = stripe === 1 ? 168 : stripe === 2 ? 52 : 120;
  const sg = stripe === 1 ? 44 : stripe === 2 ? 78 : 116;
  const sb = stripe === 1 ? 36 : stripe === 2 ? 168 : 110;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const n = (hash(x, y, seed) - 0.5) * 10;
      const plate = y % 16 === 0 || x === 31 || x === 0;
      const stripeBand = (stripe && (y >= 8 && y <= 15) || (stripe && y >= 48 && y <= 55));
      const chev = stripeBand && ((x + (y & 7) * 2) % 16 < 8);
      if (plate) putPx(px, i, 40 + n, 42 + n, 50 + n);
      else if (chev) putPx(px, i, sr + n, sg + n, sb + n);
      else if (stripeBand) putPx(px, i, 28 + n, 28 + n, 30 + n);
      else putPx(px, i, 96 + n, 98 + n, 108 + n);
    }
  }
}

/* ---------------- floor / ceiling generators ---------------- */

function paintFloor0(px, seed) { // hessian concrete with pebbles
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const m = blot(x, y, seed);
    const seam = x % 16 === 0 || y % 16 === 0;
    const crack = hash(x * 2 + 7, y * 3 + 1, seed + 5) > 0.988;
    const peb = hash(x, y, seed + 9) > 0.993;
    if (seam) putPx(px, i, 52, 45, 37);
    else if (crack) putPx(px, i, 58, 50, 40);
    else {
      const v = (m - 0.5) * 22 + (hash(x, y, seed) - 0.5) * 14;
      putPx(px, i, 84 + v, 74 + v * 0.85, 60 + v * 0.7);
      if (peb) putPx(px, i, 112, 102, 88);
    }
  }
}

function paintFloor1(px, seed) { // tech plates
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (hash(x, y, seed) - 0.5) * 10;
    const seam = x % 32 < 2 || y % 32 < 2;
    const riv = ((x % 32 === 4 || x % 32 === 27) && (y % 32 === 4 || y % 32 === 27));
    if (seam) putPx(px, i, 38, 42, 50);
    else if (riv) putPx(px, i, 130, 138, 152);
    else putPx(px, i, 78 + n + ((y & 31) < 16 ? 5 : -4), 82 + n, 92 + n); // tech plate
  }
}

function paintFloor2(px, seed) { // toxic muck
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const m = blot(x, y, seed);
    const seam = x % 16 === 3 || y % 16 === 3;
    const stain = blot(x >> 1, y >> 1, seed + 4) > 0.62;
    if (seam) putPx(px, i, 34, 38, 28);
    else {
      let v = (m - 0.5) * 30 + (hash(x, y, seed) - 0.5) * 16;
      if (stain) v -= 18;
      putPx(px, i, 56 + v * 0.8, 66 + v, 44 + v * 0.6);
    }
  }
}

function paintCeil0(px, seed) { // light concrete
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const m = blot(x, y, seed);
    const seam = x % 32 === 0 || y % 32 === 0;
    if (seam) putPx(px, i, 60, 58, 54);
    else putPx(px, i, 96 + (m - 0.5) * 20 + (hash(x, y, seed) - 0.5) * 8, 94 + (m - 0.5) * 18, 90 + (m - 0.5) * 16);
  }
}

function paintCeil1(px, seed) { // dark metal panels
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = (hash(x, y, seed) - 0.5) * 8;
    const seam = x % 32 === 0 || y % 32 === 0;
    if (seam) putPx(px, i, 34, 36, 42);
    else putPx(px, i, 66 + n + ((y & 31) < 16 ? 4 : -4), 68 + n, 76 + n);
  }
}

function paintCeil2(px, seed) { // grimy dark slab
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const m = blot(x, y, seed);
    const v = (m - 0.5) * 14 + (hash(x, y, seed) - 0.5) * 10;
    putPx(px, i, 48 + v, 50 + v, 44 + v * 0.8);
  }
}

/* ---------------- table building ---------------- */

/** Compile RGBA pixels into the [texel][64-level] Uint32 shade table. */
export function shadeTable(rgba) {
  const n = S * S;
  const t = new Uint32Array(n * 64);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    for (let L = 0; L < 64; L++) {
      const base = L < 32 ? L : L - 32;
      let f = Math.pow(base / 31, 1.18);
      if (L >= 32) f *= 0.72;
      const rr = (r * f) | 0, gg = (g * f) | 0, bb = (b * f) | 0;
      t[(i << 6) | L] = (0xff << 24) | (gg << 16) | (bb << 8) | rr;
    }
  }
  return t;
}

/** 64-level shade table for a single flat color (wall decals: blood / burn). */
export function flatRowShades(r, g, b) {
  const t = new Uint32Array(64);
  for (let L = 0; L < 64; L++) {
    const base = L < 32 ? L : L - 32;
    let f = Math.pow(base / 31, 1.18);
    if (L >= 32) f *= 0.72;
    t[L] = (0xff << 24) | (((b * f) | 0) << 16) | (((g * f) | 0) << 8) | ((r * f) | 0);
  }
  return t;
}

/**
 * Build the full asset set. In the browser, pixels go through a Canvas2D
 * offscreen canvas (putImageData); with document=null the same generators
 * fill a plain buffer (node tests/bench path).
 */
export function makeTables(document) {
  const mk = (paint) => {
    let rgba;
    if (document) {
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const c = cv.getContext('2d');
      const img = c.createImageData(S, S);
      paint(img.data);
      c.putImageData(img, 0, 0); // Canvas2D offscreen path (spec: no binary assets)
      rgba = img.data;
    } else {
      rgba = new Uint8ClampedArray(S * S * 4);
      paint(rgba);
    }
    return shadeTable(rgba);
  };
  const wallTable = new Array(12).fill(null);
  wallTable[1] = mk((p) => paintBrick(p, 11));
  wallTable[2] = mk((p) => paintTech(p, 22));
  wallTable[3] = mk((p) => paintStone(p, 33));
  wallTable[4] = mk((p) => paintMetal(p, 44));
  wallTable[8] = mk((p) => paintDoor(p, 55, null));
  wallTable[9] = mk((p) => paintDoor(p, 66, 1));   // red
  wallTable[10] = mk((p) => paintDoor(p, 77, 2));  // blue
  wallTable[11] = mk((p) => paintDoor(p, 88, 3));  // secret (brick look)
  const floorTables = [
    { floor: mk(paintFloor0), ceil: mk(paintCeil0) },
    { floor: mk(paintFloor1), ceil: mk(paintCeil1) },
    { floor: mk(paintFloor2), ceil: mk(paintCeil2) },
  ];
  return {
    M, TEX: S,
    wallTable,
    floorTables,
    floorTable: floorTables[0].floor,
    ceilTable: floorTables[0].ceil,
    decalBlood: flatRowShades(148, 14, 14),
    decalBurn: flatRowShades(52, 44, 34),
  };
}
