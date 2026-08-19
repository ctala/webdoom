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

// QA hook: expose the game graph behind ?debug (used by headless CDP tests)
if (new URLSearchParams(location.search).has('debug')) window.__wd = game;

// ---------------- on-page error log (visible only when something failed) -------
// Lets the player on another machine copy real error text for debugging without
// opening devtools. Catches window errors, unhandled rejections and anything
// thrown inside the frame loop (tick/render).
const errlog = document.getElementById('errlog');
const errLines = [];
function logError(where, err) {
  const line = `[${new Date().toLocaleTimeString()}] ${where}: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : String(err)}`;
  errLines.push(line);
  if (errLines.length > 20) errLines.shift();
  errlog.textContent = errLines.join('\n');
  errlog.style.display = 'block';
}
window.addEventListener('error', (e) => logError(`${e.filename || 'page'}:${e.lineno || '?'}`, e.message));
window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));

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

// ---------------- death / respawn (full HUD + menus arrive in stage 6) --------
const msg = document.getElementById('msg');
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && game.state === 'DEAD') {
    game.respawn();
  }
});

// ---------------- fixed-timestep loop ----------------
const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  try {
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
    // minimal state screens (full HUD/menus arrive in stage 6)
    const dead = game.state === 'DEAD';
    const paused = game.state === 'PLAY' && game.paused;
    msg.style.display = dead || paused ? 'block' : 'none';
    if (dead) msg.textContent = 'YOU DIED\npress ENTER to retry';
    else if (paused) msg.textContent = 'PAUSED\npress ESC to continue';
  } catch (err) {
    // one bad frame must not kill the loop; surface it in the on-page log
    if (!err._counted) { err._counted = true; logError('frame', err); }
  }
}
requestAnimationFrame(frame);
