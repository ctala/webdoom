// Boot: canvas + input (Pointer Lock mouse-look with keyboard fallback),
// fixed 60Hz timestep with accumulator, render decoupled via rAF.

import { Game } from './game/game.js';
import { makeTables } from './gfx/textures.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const W = 480, H = 270;
const img = new ImageData(W, H);
// Procedural textures (Canvas2D offscreen). First frame does the one-time
// table build (~14 x 64x64 shade tables); later frames are allocation-free.
const game = new Game(makeTables(document), W, H, new Uint32Array(img.data.buffer), img);

// ---------------- input ----------------
const input = game.input;
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'fire',
};

window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.code === 'KeyE') input.use = true;
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
  if (e.code === 'KeyE') input.use = false;
});

const locked = () => document.pointerLockElement === canvas;

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!locked()) {
    canvas.requestPointerLock();
    return;
  }
  input.fire = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
});
window.addEventListener('mousemove', (e) => {
  if (locked()) game.turn(e.movementX);
});
document.addEventListener('pointerlockchange', () => {
  if (!locked() && game.state === 'PLAY' && !game.paused) {
    // ESC releases the lock; treat unlock as pause.
    game.paused = true;
    input.fire = false; input.up = input.down = input.left = input.right = input.run = false;
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.state === 'PLAY' && game.paused) {
    game.paused = false;
    if (!locked()) canvas.requestPointerLock();
  }
});
window.addEventListener('blur', () => {
  if (game.state === 'PLAY' && !game.paused) game.paused = true;
  input.fire = false;
});

// ---------------- fixed-timestep loop ----------------
const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let d = now - last;
  last = now;
  if (d > 250) d = 250; // tab refocus spike
  acc += d;
  let n = 0;
  while (acc >= STEP && n < 5) {
    game.tick(STEP / 1000);
    acc -= STEP;
    n++;
  }
  if (n === 5) acc = 0; // spiral-of-death guard
  game.render(ctx);
}
requestAnimationFrame(frame);
