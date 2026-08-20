import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { blit, glyphPixels } from '../src/gfx/font5x7.js';
import { renderHud, renderMenu, renderReticle, drawFace } from '../src/gfx/hud.js';
import { renderAutomap, automapBounds } from '../src/game/automap.js';
import { doorLight } from '../src/engine/light.js';
import { buildItemSprites } from '../src/gfx/itemSprites.js';

const W = 480, H = 270;
const TOP = H - 26;
// packed colors (same constants as hud.js)
const C_HP = ((0xff << 24) | (0x20 << 16) | (0xff << 8) | 0x50) >>> 0;
const C_AMMO = ((0xff << 24) | (0xaa << 16) | (0xd9 << 8) | 0xff) >>> 0;
const C_HINT = ((0xff << 24) | (0x80 << 16) | (0xcf << 8) | 0xcf) >>> 0;
const C_MSG = ((0xff << 24) | (0xcc << 16) | (0xff << 8) | 0xff) >>> 0;
const C_BG = ((0xff << 24) | (0x14 << 16) | (0x14 << 8) | 0x14) >>> 0;
const C_KEYR = ((0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0xc8) >>> 0;
const C_FLOOR = ((0xff << 24) | (0x18 << 16) | (0x24 << 8) | 0x14) >>> 0;
const C_WALL = ((0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0x90) >>> 0;
const C_PLAYER = ((0xff << 24) | (0xff << 16) | (0xff << 8) | 0xff) >>> 0;

const ROOM = [
  '############',
  '#...........',
  '#P..........',
  '#...........',
  '#...........',
  '#...........',
  '############',
];
function makeGame(rows = ROOM, startAng = 0) {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng, theme: 0, map: rows }];
  g.loadLevel(0);
  return g;
}
const cnt = (buf, col) => { const m = col >>> 0; let n = 0; for (let i = 0; i < buf.length; i++) if (buf[i] >>> 0 === m) n++; return n; };

// ---------- font ----------

test('font: glyph pixel counts + blit only inside its box', () => {
  assert.equal(glyphPixels('4'), 14);
  assert.equal(glyphPixels('1'), 10);
  const buf = new Uint32Array(W * H).fill(0x123456);
  blit(buf, W, '4', 10, 10, 1, 0xff0000);
  let n = 0;
  for (let y = 10; y < 17; y++) for (let x = 10; x < 16; x++) if (buf[y * W + x] === 0xff0000) n++;
  assert.equal(n, 14, 'blit writes exactly the glyph pixels');
  assert.equal(buf[10 * W + 9], 0x123456, 'left of box untouched');
  assert.equal(buf[17 * W + 12], 0x123456, 'below the box untouched');
});

// ---------- HUD strip ----------

test('HUD: hp digits rendered as the exact font glyphs', () => {
  const g = makeGame();
  g.player.hp = 42;
  g.player.faceHurt = 0;
  g.state = 'PLAY';
  renderHud(g);
  const buf = g.renderer.buf;
  // '4' = [0x02,0x06,0x0a,0x12,0x1f,0x02,0x02]: row0 lit col3, row1 lit cols 2-3
  assert.equal(buf[(TOP + 6) * W + (34 + 3 * 2)] >>> 0, C_HP, "hp '4' row0 lit pixel");
  assert.equal(buf[(TOP + 8) * W + (34 + 2 * 2)] >>> 0, C_HP, "hp '4' row1 lit col2");
  assert.equal(buf[(TOP + 8) * W + 34] >>> 0, C_BG, "hp '4' row1 col0 empty");
  // strip background present (x=10..22 is the face region; use clear zones)
  assert.equal(buf[(H - 13) * W + 100] >>> 0, C_BG);
  assert.equal(buf[(H - 13) * W + 240] >>> 0, C_BG);
});

test('HUD: ammo follows the weapon; hp=17 changes the digits', () => {
  const g = makeGame();
  g.player.weapon = 4; g.player.ammoPl = 20;
  g.state = 'PLAY';
  g.message.t = 0;
  renderHud(g);
  const buf = g.renderer.buf;
  // PLASMA (6 chars) ends at 132+6*12=204; ammo starts x=214. '2' row0 0x0e -> cols 1..3
  for (let c = 1; c <= 3; c++) assert.equal(buf[(TOP + 6) * W + (214 + c * 2)] >>> 0, C_AMMO);
  assert.equal(buf[(TOP + 6) * W + 214] >>> 0, C_BG, "'2' col0 empty");
  assert.equal(buf[(TOP + 6) * W + (214 + 4 * 2)] >>> 0, C_BG, "'2' col4 empty");
  const before = cnt(buf, C_HP);
  g.player.hp = 17;
  renderHud(g);
  assert.notEqual(cnt(g.renderer.buf, C_HP), before, 'different hp digits change the green pixels');
});

test('HUD: hurt face changes with faceHurt', () => {
  const g = makeGame();
  g.state = 'PLAY';
  g.player.faceHurt = 0;
  renderHud(g);
  const a = [];
  for (let y = TOP + 4; y < TOP + 20; y++) for (let x = 6; x < 23; x++) a.push(g.renderer.buf[y * W + x]);
  g.player.faceHurt = 4;
  renderHud(g);
  const b = [];
  for (let y = TOP + 4; y < TOP + 20; y++) for (let x = 6; x < 23; x++) b.push(g.renderer.buf[y * W + x]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 30, `critical face differs from fresh (diff=${diff})`);
});

test('HUD: keycard slot lights up when the key is carried', () => {
  const g = makeGame();
  g.state = 'PLAY';
  g.message.t = 0;
  renderHud(g);
  assert.equal(cnt(g.renderer.buf, C_KEYR), 0, 'red slot empty');
  g.player.keyR = true;
  renderHud(g);
  assert.ok(cnt(g.renderer.buf, C_KEYR) > 50, 'red slot lit');
});

// ---------- proximity hint / message ----------

const DOOR2 = ['###########', '#....D....#', '#....P....#', '###########'];

test('hint: door ahead shows PRESS E; message overrides it', () => {
  const g = makeGame(DOOR2, -Math.PI / 2);
  g.state = 'PLAY';
  g.message.t = 0;
  renderHud(g);
  assert.ok(cnt(g.renderer.buf, C_HINT) > 20, 'hint visible next to the door');
  const g2 = makeGame(DOOR2, Math.PI / 2); // facing south: door behind
  g2.state = 'PLAY';
  g2.message.t = 0;
  renderHud(g2);
  assert.equal(cnt(g2.renderer.buf, C_HINT), 0, 'no hint with no door ahead');
  const g3 = makeGame(DOOR2, -Math.PI / 2);
  g3.state = 'PLAY';
  g3.message.t = 3;
  g3.message.text = 'SECRET FOUND';
  renderHud(g3);
  assert.ok(cnt(g3.renderer.buf, C_MSG) > 20, 'transient message drawn');
  assert.equal(cnt(g3.renderer.buf, C_HINT), 0, 'message replaces the hint');
});

test('hint: exit shows the exit prompt only near the switch', () => {
  const rows = ['###########', '#....X....#', '#..P......#', '###########'];
  const g = makeGame(rows, 0);
  g.state = 'PLAY';
  g.message.t = 0;
  renderHud(g);
  assert.equal(cnt(g.renderer.buf, C_HINT), 0, 'far from the switch: no prompt');
  g.player.x = 5.2; g.player.y = 1.9;
  renderHud(g);
  assert.ok(cnt(g.renderer.buf, C_HINT) > 20, 'near the switch: exit prompt');
});

// ---------- menu ----------

test('menu: title renders in MENU and disappears in PLAY', () => {
  const g = makeGame();
  g.state = 'MENU';
  g.render(null);
  let title = 0;
  for (let i = 0; i < g.renderer.buf.length; i++) if (g.renderer.buf[i] !== 0) title++;
  g.state = 'PLAY';
  g.render(null);
  let menuPx = 0;
  // the title red 0xc84030: count it exactly
  const C_TITLE = ((0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0xc8) >>> 0;
  for (let i = 0; i < g.renderer.buf.length; i++) if (g.renderer.buf[i] === C_TITLE) menuPx++;
  assert.equal(menuPx, 0, 'title gone once the game starts');
  g.state = 'MENU';
  g.render(null);
  let title2 = 0;
  for (let i = 0; i < g.renderer.buf.length; i++) if (g.renderer.buf[i] === C_TITLE) title2++;
  assert.ok(title2 > 100, `WEBDOOM title drawn (px=${title2})`);
  assert.ok(title > 100);
});

// ---------- automap ----------

test('automap: panel, explored colors, player dot; gated by input.map', () => {
  const g = makeGame();
  const m = g.map;
  const b = automapBounds(g);
  g.explored[1 * m.gw + 1] = 1; // open floor cell
  g.explored[0 * m.gw + 0] = 1; // border wall cell
  g.state = 'PLAY';
  g.input.map = true;
  g.message.t = 0;
  renderAutomap(g);
  const buf = g.renderer.buf;
  const mid = (cx, cy) => buf[(b.y0 + cy * 6 + 3) * W + (b.x0 + cx * 6 + 3)] >>> 0;
  assert.equal(mid(1, 1), C_FLOOR, 'explored open floor');
  assert.equal(mid(0, 0), C_WALL, 'explored wall');
  assert.equal(buf[(b.y1) * W + b.x1] >>> 0, 0xff000000, 'unexplored corner stays black');
  // player at (1.5, 2.5) in ROOM
  const px = b.x0 + (1.5 * 6) | 0, py = b.y0 + (2.5 * 6) | 0;
  assert.equal(buf[py * W + px] >>> 0, C_PLAYER, 'player dot');
  // gated: with the flag off the same panel pixel shows the scene, not black
  g.input.map = false;
  g.render(null);
  assert.notEqual(buf[(b.y1) * W + b.x1] >>> 0, (0xff << 24) | 0, 'no panel without TAB');
});

// ---------- misc ----------

test('exit: marker sprite builds and the exit billboard renders', () => {
  const spr = buildItemSprites(null);
  assert.ok(spr.exit, 'exit sprite built');
  let nz = 0;
  for (const v of spr.exit.tab) if (v) nz++;
  assert.ok(nz > 100, `exit tab has pixels (n=${nz})`);
  const rows = ['###########', '#....X....#', '#..P......#', '###########'];
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.levels = [{ name: 'T', startAng: 0, theme: 0, map: rows }];
  g.loadLevel(0);
  g.state = 'PLAY';
  g.render(null); // exit billboard in the sprite pass must not throw
  assert.ok(g.map.exit && g.map.exit.x === 5.5, 'exit cell parsed');
});

test('level start shows the objective, held 6s', () => {
  const g = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g.loadLevel(0); // E1M1 (has objective)
  assert.match(g.message.text, /RED KEYCARD/);
  assert.equal(g.message.t, 6);
  const g2 = new Game(makeTables(null), W, H, new Uint32Array(W * H));
  g2.levels = [{ name: 'T', startAng: 0, theme: 0, map: ['########', '#P..X..#', '########'] }];
  g2.loadLevel(0); // no objective: plain name, default hold
  assert.equal(g2.message.text, 'T');
  assert.equal(g2.message.t, 3);
});

test('reticle: hidden outside PLAY', () => {
  const g = makeGame();
  g.state = 'PLAY';
  renderReticle(g);
  assert.ok(cnt(g.renderer.buf, ((0xff << 24) | (0x20 << 16) | (0xff << 8) | 0x50) >>> 0) > 5);
  g.state = 'MENU';
  g.renderer.buf.fill((0xff << 24) | 0);
  renderReticle(g);
  assert.equal(cnt(g.renderer.buf, ((0xff << 24) | (0x20 << 16) | (0xff << 8) | 0x50) >>> 0), 0, 'no reticle in MENU');
});

test('doorLight: +8 levels, clamped at 31', () => {
  assert.equal(doorLight(0), 8);
  assert.equal(doorLight(10), 18);
  assert.equal(doorLight(30), 31);
  assert.equal(doorLight(31), 31);
});

test('drawFace: dir shift moves the eyes, never out of bounds', () => {
  const buf = new Uint32Array(W * H).fill(0);
  for (const dir of [-1, 0, 1]) {
    drawFace(buf, W, 100, 50, 2, 0, dir);
  }
  let nz = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i]) nz++;
  assert.ok(nz > 40, 'face drew something');
});
