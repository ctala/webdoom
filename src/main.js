// Boot: canvas + input (Pointer Lock mouse-look with keyboard fallback),
// fixed 60Hz timestep with accumulator, render decoupled via rAF.

import { Game } from './game/game.js';
import { makeTables } from './gfx/textures.js';
import { initAudio, playSfx } from './audio/sfx.js';
import { startMusic } from './audio/music.js';

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

// Audio: sfx via game.sfx; context created/resumed on the first gesture.
game.sfx = (n) => playSfx(n);
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (initAudio()) startMusic();
}

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
  unlockAudio();
  if (e.code >= 'Digit1' && e.code <= 'Digit4') {
    game.switchWeapon(+e.code[5]);
    return;
  }
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'KeyU') input.use = true; // E or U, Doom-style
  if (e.code === 'Tab') { input.map = true; e.preventDefault(); } // automap while held
});
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('wheel', (e) => {
  const p = game.player;
  const n = (((p.weapon - 1 + (e.deltaY > 0 ? 1 : -1)) % 4) + 4) % 4 + 1;
  game.switchWeapon(n);
}, { passive: true });
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
  if (e.code === 'KeyE') input.use = false;
  if (e.code === 'Tab') input.map = false;
  // KeyU stays true while held: useAction consumes it (edge handled in tick)
});

const locked = () => document.pointerLockElement === canvas;

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!locked()) {
    tryLock();
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
function tryLock() {
  // Chrome rejects a re-lock within ~1.25s after an ESC exit: don't let that
  // rejection show up in the on-page error log.
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}
// Single source of truth for pause, debounced: in some browsers one ESC press
// fires BOTH keydown(Escape) and pointerlockchange; without this the game
// would pause and instantly unpause (looks like ESC does nothing).
let lastPauseToggle = 0;
function setPaused(v) {
  if (game.state !== 'PLAY' || game.paused === v) return;
  const now = performance.now();
  if (now - lastPauseToggle < 350) return;
  lastPauseToggle = now;
  game.paused = v;
  if (v) {
    input.fire = false; input.up = input.down = input.left = input.right = input.run = false;
  } else if (!locked()) {
    tryLock();
  }
}
document.addEventListener('pointerlockchange', () => {
  if (game.state !== 'PLAY') return;
  if (!locked()) setPaused(true);  // just unlocked (ESC or focus loss) -> pause
  else setPaused(false);           // just re-locked -> resume
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || game.state !== 'PLAY') return;
  setPaused(!game.paused);         // ESC toggles pause, locked or not
});
window.addEventListener('blur', () => {
  input.fire = false;
  setPaused(true);
});

// ---------------- death / respawn / won (full HUD + menus arrive in stage 6) --
const msg = document.getElementById('msg');
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (game.state === 'MENU') { unlockAudio(); tryLock(); game.loadLevel(0); }
    else if (game.state === 'DEAD') game.respawn();
    else if (game.state === 'WON') game.loadLevel(0);
    else if (game.state === 'INTERM') game.intermT = 0; // skip the intermission
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
    const inter = game.state === 'INTERM';
    const won = game.state === 'WON';
    msg.style.display = dead || paused || inter || won ? 'block' : 'none';
    if (dead) msg.textContent = 'YOU DIED\npress ENTER to retry';
    else if (won) msg.textContent = 'YOU ESCAPED\npress ENTER to play again';
    else if (inter) msg.textContent = game.levels[game.levelIdx].name + ' — COMPLETE\nnext: ' + game.levels[game.levelIdx + 1].name + '\n(ENTER to skip)';
    else if (paused) msg.textContent = 'PAUSED\npress ESC to continue';
  } catch (err) {
    // one bad frame must not kill the loop; surface it in the on-page log
    if (!err._counted) { err._counted = true; logError('frame', err); }
  }
}
requestAnimationFrame(frame);
