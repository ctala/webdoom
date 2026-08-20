// CPU frame-time benchmark (headless, node): full tick + render pipeline.
// Run with: node tests/bench.js
// Numbers are CPU-only (V8) at 480x270; GPU cost in the browser is minimal
// (one putImageData + a few 2D calls per frame).
import { Game } from '../src/game/game.js';
import { makeTables } from '../src/gfx/textures.js';
import { makeFlatAssets } from '../src/gfx/assets.js';

function bench(label, assets, setup) {
  const W = 480, H = 270;
  const game = new Game(assets, W, H, new Uint32Array(W * H));
  if (setup) setup(game);
  for (let i = 0; i < 60; i++) game.tick(1 / 60); // warmup
  const N = 600;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    game.tick(1 / 60);
    game.render(null);
  }
  const ms = performance.now() - t0;
  const f = ms / N;
  console.log(`${label.padEnd(44)} ${ms.toFixed(0).padStart(6)}ms total  ${f.toFixed(3)} ms/frame  (budget 16.66)`);
  return f;
}

const real = makeTables(null);
const flat = makeFlatAssets();

bench('stage1 flat walls, idle-walk', flat, (g) => { g.input.up = true; });
bench('stage2 textured+floor/ceil, walk', real, (g) => { g.input.up = true; });
bench('stage2 textured+floor/ceil, walk+spin', real, (g) => {
  g.input.up = true;
  const orig = g.tick.bind(g);
  g.tick = (dt) => { orig(dt); g.turn(60); };
});
bench('stage3 E1M1: 6 enemies AI+projectiles+sprites', real, (g) => { g.input.up = true; });
bench('stage4 E1M1 combat: pistol fire+blood+viewmodel', real, (g) => {
  g.input.up = true; g.input.fire = true; g.player.hp = 1e5;
});
bench('stage4 E1M1 combat: plasma bolts+splash+decals', real, (g) => {
  g.input.up = true; g.input.fire = true; g.player.hp = 1e5; g.player.weapon = 4;
});
bench('stage5 E2M1: enemies+items+doors+shotgun viewmodel', real, (g) => {
  g.loadLevel(1);
  g.input.up = true; g.input.fire = true; g.player.hp = 1e5; g.player.weapon = 3;
  for (let i = 0; i < g.doorCells.length; i++) g.doorH[g.doorCells[i]] = 0.02 + (i % 5) * 0.18;
});
bench('stage6 E1M1 full: HUD + automap open + combat', real, (g) => {
  g.loadLevel(0);
  g.input.up = true; g.input.fire = true; g.player.hp = 1e5; g.input.map = true;
});
console.log('\nnote: CPU-only V8 timings; browser adds ~<0.5ms GPU blit for 480x270.');
