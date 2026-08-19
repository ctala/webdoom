import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSprites, buildGlowSprites } from '../src/gfx/sprites.js';
import { StubCtx, CanvasProxy } from '../src/gfx/canvas2d.js';

test('CanvasProxy clamps negative radii (browser canvas throws on them)', () => {
  // Strict ctx: throws like a real CanvasRenderingContext2D for negative radius.
  class StrictCtx {
    constructor() { this.store = new Uint8ClampedArray(32 * 32 * 4); }
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
    getImageData(x, y, w, h) { return { data: this.store.subarray(x * h * 4 + y * 4, (x + w) * h * 4 + (y + h) * 4) }; }
    clearRect() { this.store.fill(0); }
    fillRect(x, y, w, h) { for (let py = y | 0; py < y + h; py++) for (let px = x | 0; px < x + w; px++) this.store[(py * 32 + px) * 4 + 3] = 255; }
    save() { } restore() { } translate() { } rotate() { }
    beginPath() { } moveTo() { } lineTo() { } closePath() { } stroke() { }
    fill() { this.fillRect(0, 0, 32, 32); }
    arc(x, y, r) { if (r < 0) throw new RangeError('negative arc radius'); this.fillRect(x - r, y - r, r * 2, r * 2); }
    ellipse(cx, cy, rx, ry) { if (rx < 0 || ry < 0) throw new RangeError('negative ellipse radius'); this.fillRect(cx - rx, cy - ry, rx * 2, ry * 2); }
  }
  const sc = new StrictCtx();
  const proxy = new CanvasProxy(sc, 32, 32, new Uint8ClampedArray(32 * 32 * 4));
  proxy.beginPath();
  proxy.ellipse(16, 16, -2.5, 3, 0, 0, Math.PI * 2); // painter bug would reach the real API
  proxy.fill(); // must not throw
  assert.ok(true, 'no IndexSizeError escaped the proxy');
});

// Fake browser canvas: a real software 2d ctx (StubCtx) behind the
// Canvas2D ImageData API, so CanvasProxy exercises its sync-from-canvas
// path exactly as a browser ctx would.
class FakeCtx extends StubCtx {
  constructor(w, h) { super(new Uint8ClampedArray(w * h * 4), w, h); }
  get width() { return this.w; }
  get height() { return this.h; }
  getImageData() { return { data: this.data }; }
  putImageData() { }
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
}
const fakeDoc = { createElement: () => ({ width: 0, height: 0, getContext: () => new FakeCtx(32, 32) }) };

const TYPES = ['imp', 'demon', 'commander', 'caco'];
const SETS = ['idle', 'walk', 'atk', 'pain', 'death', 'corpse'];

function opaqueCount(frame) {
  let n = 0;
  for (let i = 0; i < frame.length; i++) if (frame[i] !== 0) n++;
  return n;
}

test('stub path: every frame of every enemy is non-black, corpses stay flat', () => {
  const sp = buildSprites(null);
  for (const t of TYPES) {
    assert.ok(sp[t], t + ' built');
    for (const s of SETS) {
      const frames = sp[t][s];
      assert.ok(frames.length >= 1, `${t}/${s} has frames`);
      for (const f of frames) {
        const n = opaqueCount(f);
        assert.ok(n > 60, `${t}/${s} frame too empty (${n} px)`);
      }
      if (s === 'corpse') assert.ok(opaqueCount(frames[0]) < 900, 'corpse is a low pile');
    }
  }
});

test('browser path (CanvasProxy over fake ctx) matches stub path bit-for-bit', () => {
  const a = buildSprites(null);
  const b = buildSprites(fakeDoc);
  for (const t of TYPES)
    for (const s of SETS) {
      assert.equal(b[t][s].length, a[t][s].length, `${t}/${s} frame count`);
      for (let f = 0; f < a[t][s].length; f++)
        assert.ok(a[t][s][f].every((v, i) => v === b[t][s][f][i]), `${t}/${s}#${f} diverges from browser path`);
    }
});

test('glow orbs: fire hot core, bolt cool core, transparent rim', () => {
  const g = buildGlowSprites(null);
  for (const name of ['fire', 'bolt']) {
    const t = g[name].tab;
    assert.ok(t[3 * 8 + 3] !== 0 && t[4 * 8 + 4] !== 0, `${name} core opaque`);
    assert.equal(t[0], 0, `${name} corner transparent`);
  }
});

test('sprite build is deterministic', () => {
  const a = buildSprites(null);
  const b = buildSprites(null);
  for (const t of TYPES)
    for (const s of SETS)
      for (let f = 0; f < a[t][s].length; f++)
        assert.ok(a[t][s][f].every((v, i) => v === b[t][s][f][i]), `nondeterministic ${t}/${s}#${f}`);
});
