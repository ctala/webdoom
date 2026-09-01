// Billboard sprite renderer with per-column z-buffer occlusion.
// Sprites are drawn far-to-near into the same packed buffer as the walls;
// a column is drawn only where the wall depth is farther than the sprite.
// Zero allocation per frame: fixed slot array + insertion-sorted index.

export const MAX_SPR = 160;

export class SpriteRenderer {
  constructor() {
    this.items = new Array(MAX_SPR);
    for (let i = 0; i < MAX_SPR; i++) {
      this.items[i] = {
        d: 0, sx: 0, y0: 0, w: 0, h: 0,
        tab: null, sw: 0, sh: 0, anchor: 0, dim: 255,
      };
    }
    this.order = new Int32Array(MAX_SPR);
    this.count = 0;
    // camera
    this.px = 0; this.py = 0; this.cosA = 1; this.sinA = 0;
    this.M = 0.66; this.W = 480; this.H = 270;
    this.jy = 0; // horizon offset shared with the wall renderer (shake)
    // dim lookup per sprite: multiplier 0..254
    this.dimLut = new Uint8Array(32);
    for (let b = 0; b < 32; b++) this.dimLut[b] = 64 + (190 * b) / 31 | 0;
  }

  begin(px, py, cosA, sinA, M, W, H) {
    this.px = px; this.py = py; this.cosA = cosA; this.sinA = sinA;
    this.M = M; this.W = W; this.H = H;
    this.count = 0;
  }

  /**
   * @param {number} wx,wy world pos
   * @param {number} worldH sprite world height
   * @param {Uint32Array} tab frame pixels (sw*sh, alpha 0 = transparent)
   * @param {number} sw,sh frame size
   * @param {number} [lift] bottom anchored by default; lift raises it (hover)
   * @param {number} [b] precomputed light level 0..31 (default bright)
   */
  add(wx, wy, worldH, tab, sw, sh, lift = 0, b = 31) {
    if (this.count >= MAX_SPR) return;
    const rx = wx - this.px, ry = wy - this.py;
    const d = rx * this.cosA + ry * this.sinA;
    if (d < 0.18) return;
    const L = rx * this.sinA - ry * this.cosA;
    const it = this.items[this.count++];
    it.d = d;
    it.sx = this.W * 0.5 + (L / (this.M * d)) * this.W * 0.5;
    const halfH = this.H / (2 * d); // px per world unit
    it.h = worldH * halfH;
    if (it.h < 1.5) return; // too far: invisible
    it.w = it.h * (sw / sh);
    // bottom anchor at the floor line of this distance
    const groundY = this.H * 0.5 + this.jy + halfH;
    it.y0 = groundY - (worldH * halfH) - lift * halfH;
    it.tab = tab; it.sw = sw; it.sh = sh;
    it.dim = this.dimLut[b] | 0;
  }

  /** Draw all registered sprites (far to near) into buf, z-tested by depth. */
  render(buf, depth, W, H) {
    const n = this.count;
    if (!n) return;
    const ord = this.order;
    for (let i = 0; i < n; i++) ord[i] = i;
    // insertion sort by depth, far first
    for (let i = 1; i < n; i++) {
      const oi = ord[i];
      const od = this.items[oi].d;
      let j = i - 1;
      while (j >= 0 && this.items[ord[j]].d < od) { ord[j + 1] = ord[j]; j--; }
      ord[j + 1] = oi;
    }
    for (let k = 0; k < n; k++) {
      const it = this.items[ord[k]];
      const x0 = (it.sx - it.w * 0.5) | 0;
      const x1 = (it.sx + it.w * 0.5) | 0;
      if (x1 < 0 || x0 >= W) continue;
      const y0 = it.y0 > 0 ? it.y0 | 0 : 0;
      const y1 = (it.y0 + it.h) >= H ? H - 1 : (it.y0 + it.h) | 0;
      if (y1 < 0 || y0 >= H) continue;
      const pxPerTexX = it.sw / it.w;
      const pxPerTexY = it.sh / it.h;
      const dim = it.dim;
      const applyDim = dim < 200;
      const xs0 = x0 < 0 ? 0 : x0;
      const xs1 = x1 > W - 1 ? W - 1 : x1;
      for (let x = xs0; x <= xs1; x++) {
        if (depth[x] <= it.d + 1e-4) continue;
        let u = ((x - (it.sx - it.w * 0.5)) * pxPerTexX) | 0;
        if (u < 0) u = 0; else if (u >= it.sw) u = it.sw - 1;
        const rowBase = u;
        for (let y = y0; y <= y1; y++) {
          let v = ((y - it.y0) * pxPerTexY) | 0;
          if (v < 0) v = 0; else if (v >= it.sh) v = it.sh - 1;
          let p = it.tab[v * it.sw + rowBase];
          if (p === 0) continue;
          if (applyDim) {
            const r = (p & 0xff) * dim >> 8;
            const g = ((p >> 8) & 0xff) * dim >> 8;
            const bl = ((p >> 16) & 0xff) * dim >> 8;
            p = (255 << 24) | (bl << 16) | (g << 8) | r;
          }
          buf[y * W + x] = p;
        }
      }
    }
  }
}
