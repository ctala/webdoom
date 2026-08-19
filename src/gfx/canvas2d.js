// Canvas2D abstraction for procedural sprite painting.
// - CanvasProxy wraps a real browser 2d ctx and mirrors its output into a
//   plain RGBA buffer (so the same painter code runs in both worlds).
// - StubCtx is a minimal software 2d context for node (tests/bench):
//   rects, closed-polygon fills, arcs/ellipses as polyline paths, strokes.
// Both share a small interface: clearRect, fillRect, save/restore,
// translate/rotate, beginPath, moveTo, lineTo, closePath, arc, ellipse,
// fill, stroke.

export function makeSpriteCanvas(document, w, h) {
  if (document) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    // willReadFrequently: we getImageData back after each draw (one-time build)
    const c = cv.getContext('2d', { willReadFrequently: true });
    return { c, img: c.createImageData(w, h) };
  }
  return { c: null, img: { data: new Uint8ClampedArray(w * h * 4) } };
}

/**
 * Wraps a real Canvas2D ctx and mirrors the canvas contents into a plain
 * RGBA target buffer after each draw op. Style state (fillStyle etc.) is
 * forwarded to the real ctx so fill()/stroke() use what the painter set.
 */
export class CanvasProxy {
  constructor(ctx, w, h, target) {
    this.ctx = ctx; this.target = target;
    this.w = w; this.h = h;
  }
  get fillStyle() { return this.ctx.fillStyle; }
  set fillStyle(v) { this.ctx.fillStyle = v; }
  get strokeStyle() { return this.ctx.strokeStyle; }
  set strokeStyle(v) { this.ctx.strokeStyle = v; }
  get lineWidth() { return this.ctx.lineWidth; }
  set lineWidth(v) { this.ctx.lineWidth = v; }
  _sync() {
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    for (let i = 0; i < this.target.length; i++) this.target[i] = d[i];
  }
  fillRect(x, y, w, h) { this.ctx.fillRect(x, y, w, h); this._sync(); }
  clearRect(x, y, w, h) { this.ctx.clearRect(x, y, w, h); this._sync(); }
  fill() { this.ctx.fill(); this._sync(); }
  stroke() { this.ctx.stroke(); this._sync(); }
  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  translate(a, b) { this.ctx.translate(a, b); }
  rotate(a) { this.ctx.rotate(a); }
  beginPath() { this.ctx.beginPath(); }
  moveTo(a, b) { this.ctx.moveTo(a, b); }
  lineTo(a, b) { this.ctx.lineTo(a, b); }
  closePath() { this.ctx.closePath(); }
  // The real Canvas2D API throws IndexSizeError on negative radii; the node
  // StubCtx does not. Clamp so a painter bug can't take down the browser.
  arc(x, y, r, a0, a1, ...rest) { this.ctx.arc(x, y, Math.max(0.001, r), a0, a1, ...rest); }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ...rest) {
    this.ctx.ellipse(cx, cy, Math.max(0.001, rx), Math.max(0.001, ry), rot, a0, a1, ...rest);
  }
}

/** Minimal software Canvas2D stub (node): polygons, ellipses, arcs, strokes. */
export class StubCtx {
  constructor(data, w, h) {
    this.data = data;
    this.w = w; this.h = h;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.tr = [1, 0, 0, 1, 0, 0]; // 2d affine
    this.path = [];
  }
  _rgb(col) {
    if (col[0] === '#') {
      return [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
    }
    const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [m[1] | 0, m[2] | 0, m[3] | 0] : [0, 0, 0];
  }
  _pt(x, y) {
    const [a, b2, c2, d, e, f2] = this.tr;
    return [a * x + c2 * y + e, b2 * x + d * y + f2];
  }
  fill() {
    const [r, g, b] = this._rgb(this.fillStyle);
    const p = this.path;
    if (!p.length) return;
    const pts = p.map(([x, y]) => this._pt(x, y)); // bounding box of path
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let py = Math.floor(y0); py <= Math.ceil(y1); py++)
      for (let px = Math.floor(x0); px <= Math.ceil(x1); px++) {
        if (!this._inside(pts, px + 0.5, py + 0.5)) continue;
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        const i = (py * this.w + px) * 4;
        this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
      }
  }
  _inside(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  stroke() {
    const [r, g, b] = this._rgb(this.strokeStyle);
    const pts = this.path.map(([x, y]) => this._pt(x, y));
    const w = Math.max(1, this.lineWidth);
    for (const [x, y] of pts)
      for (let dy = -w; dy <= w; dy++)
        for (let dx = -w; dx <= w; dx++) {
          const px = Math.round(x + dx), py = Math.round(y + dy);
          if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
          const i = (py * this.w + px) * 4;
          this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
        }
  }
  save() { }
  restore() { this.tr = [1, 0, 0, 1, 0, 0]; }
  translate(x, y) {
    const [a, b2, c2, d, e, f2] = this.tr;
    this.tr = [a, b2, c2, d, e + a * x + c2 * y, f2 + b2 * x + d * y];
  }
  rotate(a) {
    const [m11, m12, m21, m22, e, f2] = this.tr;
    const ca = Math.cos(a), sa = Math.sin(a);
    this.tr = [m11 * ca + m21 * sa, m12 * ca + m22 * sa, m11 * -sa + m21 * ca, m12 * -sa + m22 * ca, e, f2];
  }
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push([x, y]); }
  lineTo(x, y) { this.path.push([x, y]); }
  closePath() { }
  arc(x, y, r, a0, a1) {
    for (let a = a0; a <= a1 + 0.01; a += 0.4) this.path.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    this.path.push([x + Math.cos(a1) * r, y + Math.sin(a1) * r]);
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1) {
    for (let a = a0; a <= a1 + 0.01; a += 0.35) {
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      const co = Math.cos(rot), si = Math.sin(rot);
      this.path.push([cx + ex * co - ey * si, cy + ex * si + ey * co]);
    }
  }
  fillRect(x, y, w, h) { this._fillRectRaw(x, y, w, h, this._rgb(this.fillStyle), 255); }
  _fillRectRaw(x, y, w, h, [r, g, b], a) {
    for (let py = Math.floor(y); py < y + h; py++)
      for (let px = Math.floor(x); px < x + w; px++) {
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        const i = (py * this.w + px) * 4;
        this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
      }
  }
  clearRect(x, y, w, h) { this._fillRectRaw(x, y, w, h, [0, 0, 0], 0); }
}
