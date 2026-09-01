// Wall + floor/ceiling caster writing straight into a packed pixel buffer
// (Uint32Array view of ImageData.data, little-endian 0xAABBGGRR).
//
// World: eye at z=0, floor at z=-1, cell heights 1/2/3 units (H_LOW/NORM/TALL).
// Perpendicular depth d -> pixels per unit = H/(2d). A wall of hU world
// units (1/2/3) at depth d spans lineH = hU * H/(2d) px, anchored to the
// floor line yBot = H/2 + H/(2d); its top yTop = yBot - lineH. A 1-unit
// (low) wall tops out exactly at the horizon, exposing floor/ceiling of
// cells seen over it; a 3-unit wall tops out above the horizon —
// variable-height sectors via vertical projection offset.
//
// Draw order: floor/ceiling pass, then walls per column (walls overwrite),
// then sprites (z-tested against this.depth). No depth test is needed for
// floor/ceiling because walls are painted afterwards.

import { castRay } from './raycaster.js';
import { lightLevel, doorLight, pointLightAdd } from './light.js';

export class Renderer {
  /**
   * @param {object} assets { M, TEX, wallTable: Uint32Array[12], floorTable, ceilTable }
   * Tables are laid out [texel][level], level 0..31 = light, 32..63 = side-dim.
   */
  /**
   * @param {Uint32Array} [targetBuf] render target (defaults to an internal buffer;
   *        in the browser this is a view over ImageData.data.buffer)
   */
  constructor(assets, W = 480, H = 270, targetBuf = null) {
    this.assets = assets;
    this.W = W;
    this.H = H;
    this.buf = targetBuf || new Uint32Array(W * H);
    this.depth = new Float32Array(W);
    this.ray = { perp: 0, side: 0, cellX: 0, cellY: 0, hitId: 0, texX: 0 };
    this.flash = 0;
    this.jy = 0; // screen-space horizon offset (shake), pixels
    this.lights = null; // [{x,y,r,i}] up to 8 dynamic point lights (game.render)
    // radial vignette intensity per pixel (0 center .. 90 corners): used for
    // the low-HP / recent-damage red darkening pass.
    this.vig = new Uint8Array(W * H);
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = Math.hypot((x - cx) / cx, (y - cy) / cy);
        const v = Math.max(0, r - 0.55) * 2;
        this.vig[y * W + x] = v > 1 ? 90 : v * 90 | 0;
      }
    }
  }

  /** Post pass: darken toward red by `level` (0..1) using the radial table. */
  applyVignette(level) {
    if (level < 0.02) return;
    const { buf, vig } = this;
    for (let i = 0; i < buf.length; i++) {
      const w = (vig[i] * level) | 0;
      if (!w) continue;
      const c = buf[i];
      const m = 256 - w;
      let r = ((c & 0xff) * m >> 8) + (w * 16 >> 4);
      if (r > 255) r = 255;
      buf[i] = (0xff << 24) | ((((c >>> 16) & 0xff) * m >> 8) << 16) | ((((c >>> 8) & 0xff) * m >> 8) << 8) | r;
    }
  }

  /**
   * Render one frame into this.buf.
   * @param {Uint8Array} view merged solid grid (static walls + closed doors)
   * @param {object} map {gw, gh, heights, doorH}
   * @param {Uint32Array} [bg] flat background when no floor/ceil tables
   */
  render(px, py, cosA, sinA, view, map, bg, reveal = null, explored = null) {
    const { W, H, buf, depth, assets } = this;
    const M = assets.M;
    const ray = this.ray;
    const flash = this.flash;

    if (assets.floorTable && assets.ceilTable) this.floorCeil(px, py, cosA, sinA);
    else if (bg) buf.set(bg);

    const invW = 2 / W;
    const halfH = H * 0.5;
    this._haz = map.hasHazard ? map.hazard : null;
    this._gw = map.gw; this._gh = map.gh;
    const heights = map.heights;
    const doorH = map.doorH;
    const wallTable = assets.wallTable;

    for (let x = 0; x < W; x++) {
      const c = (x * invW - 1) * M;
      const rdx = cosA + c * sinA;
      const rdy = sinA - c * cosA;
      const hit = castRay(px, py, rdx, rdy, view, map.gw, map.gh, ray, reveal);
      if (!hit) {
        depth[x] = 999;
        continue;
      }
      const idx = ray.cellY * map.gw + ray.cellX;
      const id = ray.hitId;
      let d = ray.perp < 0.04 ? 0.04 : ray.perp;
      depth[x] = d;
      let hU = heights[idx]; // world units (1/2/3)
      if (id >= 8) {         // door sliding up
        hU *= 1 - doorH[idx];
        if (hU < 0.06) continue;
      }
      const tbl = wallTable[id];
      if (!tbl) { continue; }
      const lineH = (hU * H) / (2 * d); // px/unit = H/(2d)
      const yBot = halfH + this.jy + halfH / d;
      const yTop = yBot - lineH;
      const step = 64 / lineH; // texels per screen row
      const u = Math.min(63, (ray.texX * 64) | 0); // texture COLUMN for this slice
      const ut = ray.texX * 64; // continuous u (decal hit tests)
      let b = lightLevel(d, flash, ray.side === 1);
      if (id >= 8 && d < 6) b = doorLight(b); // closed doors read brighter than the walls around them
      const lights = this.lights;
      if (lights && lights.length) {
        // dynamic pools (muzzle, plasma bolts): added at the exact hit point
        const hx = px + rdx * ray.perp, hy = py + rdy * ray.perp;
        for (let li = 0; li < lights.length; li++) {
          const l = lights[li];
          const ldx = hx - l.x, ldy = hy - l.y;
          const ld = Math.sqrt(ldx * ldx + ldy * ldy);
          b += pointLightAdd(ld, l.r, l.i) | 0;
        }
        if (b > 31) b = 31;
      }
      const sideLvl = ray.side === 1 ? 32 : 0;
      const y0 = yTop < 0 ? 0 : yTop | 0;
      const y1 = yBot >= H ? H : (yBot | 0) + 1;
      if (map.decals) {
        this._dHead = map.decals.head[idx * 2 + ray.side];
        this._dNext = map.decals.next;
        this._dItems = map.decals.items;
        this._dBlood = map.decals.blood;
        this._dBurn = map.decals.burn;
      } else {
        this._dHead = -1; this._dItems = null; this._dBlood = null; this._dBurn = null;
      }
      let ty = (y0 - yTop) * step; // texture ROW from the slice top
      while (ty < 0) ty += 64;
      while (ty >= 64) ty -= 64;
      let off = y0 * W + x;
      const lvl = sideLvl + b;
      const dHead = this._dHead;
      for (let y = y0; y < y1; y++) {
        buf[off] = tbl[(((ty | 0) << 6) + u) << 6 | lvl];
        if (dHead !== -1) {
          for (let di = dHead; di >= 0; di = this._dNext[di]) {
            const dec = this._dItems[di];
            if (Math.abs(dec.u64 - ut) < dec.r && Math.abs(ty - dec.v64) < dec.r) {
              const t = dec.kind ? this._dBurn : this._dBlood;
              if (t) buf[off] = t[lvl];
            }
          }
        }
        ty += step;
        if (ty >= 64) ty -= 64;
        off += W;
      }
    }
  }

  /** Horizontal floor/ceiling casting (lodev style, per scanline). */
  floorCeil(px, py, cosA, sinA) {
    const { W, H, buf, assets } = this;
    const M = assets.M;
    const mid = (H >> 1) + this.jy;
    const halfH = H * 0.5;
    const flash = this.flash;
    const floorT = assets.floorTable;
    const ceilT = assets.ceilTable;

    // floor: rows mid..H-1
    const haz = this._haz;
    const hazT = haz ? this.assets.floorTableHaz : null;
    const gw = this._gw, gh = this._gh;
    for (let y = mid; y < H; y++) {
      const p = y - mid + 0.5;
      const t = halfH / p;
      const tm = t * M;
      let fx = px + t * cosA - tm * sinA;
      let fy = py + t * sinA + tm * cosA;
      const sx = (2 * tm / W) * sinA;
      const sy = (2 * tm / W) * -cosA;
      const b = lightLevel(t, flash) | 0;
      const bx = fx, by = fy; // raw flight coords for the hazard lookup
      fx -= Math.floor(fx);
      fy -= Math.floor(fy);
      let u = (fx * 64) | 0;
      let v = (fy * 64) | 0;
      let off = y * W;
      let rx = bx, ry = by;
      for (let x = 0; x < W; x++) {
        let tab = floorT;
        if (haz) {
          const cx = rx | 0, cy = ry | 0;
          if (cx >= 0 && cy >= 0 && cx < gw && cy < gh && haz[cy * gw + cx]) tab = hazT;
        }
        buf[off + x] = tab[((v << 6) + u) << 6 | b];
        u += sx * 64; v += sy * 64;
        if (u >= 64) u -= 64; else if (u < 0) u += 64;
        if (v >= 64) v -= 64; else if (v < 0) v += 64;
        rx += sx; ry += sy;
      }
    }
    // ceiling: rows 0..mid-1 (same 2D flight, different table)
    for (let y = 0; y < mid; y++) {
      const p = mid - y - 0.5;
      const t = halfH / p;
      const tm = t * M;
      let fx = px + t * cosA - tm * sinA;
      let fy = py + t * sinA + tm * cosA;
      const sx = (2 * tm / W) * sinA;
      const sy = (2 * tm / W) * -cosA;
      const b = lightLevel(t, flash) | 0;
      fx -= Math.floor(fx);
      fy -= Math.floor(fy);
      let u = (fx * 64) | 0;
      let v = (fy * 64) | 0;
      let off = y * W;
      for (let x = 0; x < W; x++) {
        buf[off + x] = ceilT[((v << 6) + u) << 6 | b];
        u += sx * 64; v += sy * 64;
        if (u >= 64) u -= 64; else if (u < 0) u += 64;
        if (v >= 64) v -= 64; else if (v < 0) v += 64;
      }
    }
  }

  /** Packed pixel helper (0xAABBGGRR). */
  static pack(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
  }
}
