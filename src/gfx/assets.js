// Asset builders.
// makeFlatAssets(): noise-dithered flat-color shade tables (no DOM needed —
// used by node tests/bench and as a runtime fallback).
// Stage 2+ (gfx/textures.js) builds the real procedural canvas textures into
// the exact same table layout: [texel][level], level 0..31 light / 32..63
// side-dim, packed 0xAABBGGRR.

export const TEX = 64;
export const M = Math.tan((33 * Math.PI) / 180); // FOV 66deg

export function makeFlatAssets() {
  const wallTable = new Array(12).fill(null);
  wallTable[1] = flatTable([146, 72, 42]);  // brick
  wallTable[2] = flatTable([72, 92, 116]);  // tech
  wallTable[3] = flatTable([112, 106, 98]); // stone
  wallTable[4] = flatTable([96, 96, 108]);  // metal
  wallTable[8] = flatTable([128, 118, 96]); // door D
  wallTable[9] = flatTable([150, 60, 48]);  // door R
  wallTable[10] = flatTable([70, 90, 150]); // door B
  wallTable[11] = flatTable([146, 72, 42]); // secret (brick look)
  return {
    M, TEX,
    wallTable,
    floorTable: null,
    ceilTable: null,
  };
}

export function makeFlatBg(W, H) {
  const bg = new Uint32Array(W * H);
  const ceil = (0xff << 24) | (0x1c << 16) | (0x1c << 8) | 0x22;
  const floor = (0xff << 24) | (0x0e << 16) | (0x10 << 8) | 0x14;
  const mid = H >> 1;
  for (let y = 0; y < H; y++) {
    const c = y < mid ? ceil : floor;
    for (let x = 0; x < W; x++) bg[y * W + x] = c;
  }
  return bg;
}

/** 64-level (32 light + 32 side-dim) shade table for a flat RGB color. */
function flatTable(rgb) {
  const t = new Uint32Array(TEX * TEX * 64);
  const [r0, g0, b0] = rgb;
  for (let i = 0; i < TEX * TEX; i++) {
    const h = (i * 0x9e3779b1) >>> 0;
    const n = ((h & 0xff) - 128) / 128 * 9;
    const r = clamp255(r0 + n), g = clamp255(g0 + n), b = clamp255(b0 + n);
    for (let L = 0; L < 64; L++) {
      const base = L < 32 ? L : L - 32;
      let f = Math.pow(base / 31, 1.25);
      if (L >= 32) f *= 0.72;
      t[(i << 6) | L] = (0xff << 24) | ((g * f) | 0 << 16) | ((b * f) | 0 << 8) | ((r * f) | 0);
    }
  }
  return t;
}

function clamp255(v) {
  v |= 0;
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
