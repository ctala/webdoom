// CPU frame-time benchmark (headless, node): full tick + render pipeline.
// Run with: node tests/bench.js
// Numbers are CPU-only (V8) at 480x270; GPU cost in the browser is minimal
// (one putImageData + a few 2D calls per frame).
import { Game } from '../src/game/game.js';
import { makeFlatAssets } from '../src/gfx/assets.js';

function bench(label, setup) {
  const W = 480, H = 270;
  const game = new Game(makeFlatAssets(), W, H, new Uint32Array(W * H));
  if (setup) setup(game);
  // warmup
  for (let i = 0; i < 60; i++) game.tick(1 / 60);
  const N = 600;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    game.tick(1 / 60);
    game.render(null);
  }
  const ms = performance.now() - t0;
  const f = ms / N;
  console.log(`${label.padEnd(34)} ${ms.toFixed(0).padStart(6)}ms total  ${f.toFixed(3)} ms/frame  ${Math.floor(1000 / f)} fps-headroom(60Hz)`);
  return f;
}

// walk east into the first wall
let g1 = null;
const p1 = bench('stage1: player idle-walk', (g) => { g.input.up = true; g1 = g; });
// walk while spinning (DDA covers all directions)
bench('stage1: walking + continuous spin', (g) => {
  g.input.up = true;
  const orig = g.tick.bind(g);
  g.tick = (dt) => { orig(dt); g.turn(60); }; // 0.126 rad/frame
});
console.log(`\nfloor budget: 16.66 ms/frame for 60fps; stage1 uses ${p1.toFixed(3)} ms`);
