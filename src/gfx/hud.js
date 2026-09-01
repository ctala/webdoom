// In-buffer HUD: bottom strip (face, hp, weapon+ammo, armor, keycards),
// transient message line, proximity "press E" hint, aim reticle, title screen.
// All pixel work goes straight into the packed 0xAABBGGRR buffer.

import { blit, blitCenter } from './font5x7.js';
import { scanUse } from '../game/interact.js';
import { currentObjective, compassInfo } from '../game/objective.js';
import { DIFFS } from '../game/difficulty.js';

// Packed colors (0xAABBGGRR)
const C_BG = (0xff << 24) | (0x14 << 16) | (0x14 << 8) | 0x14; // near-black strip
const C_BG_LN = (0xff << 24) | (0x2c << 16) | (0x2c << 8) | 0x2c;
const C_HP = (0xff << 24) | (0x20 << 16) | (0xff << 8) | 0x50; // bright green
const C_AMMO = (0xff << 24) | (0xaa << 16) | (0xd9 << 8) | 0xff; // yellow
const C_NAME = (0xff << 24) | (0xaa << 16) | (0xaa << 8) | 0xaa; // gray
const C_HINT = (0xff << 24) | (0x80 << 16) | (0xcf << 8) | 0xcf; // cyan
const C_MSG = (0xff << 24) | (0xcc << 16) | (0xff << 8) | 0xff; // amber
const C_RET = (0xff << 24) | (0x20 << 16) | (0xff << 8) | 0x50; // reticle green
const C_KEYR = (0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0xc8;
const C_KEYB = (0xff << 24) | (0xc8 << 16) | (0x60 << 8) | 0x38;

const WEAPON_NAME = { 1: 'FISTS', 2: 'PISTOL', 3: 'SHOTGUN', 4: 'PLASMA' };

/**
 * 8x8 marine face, hurt 0..4 (0 fresh, 4 near death), dir -1/0/1 eye shift.
 * Drawn at (x, y) with pixel scale s.
 */
export function drawFace(buf, W, x, y, s, hurt, dir) {
  const put = (fx, fy, c) => {
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const px = x + fx * s + dx, py = y + fy * s + dy;
      if (px >= 0 && px < W && py >= 0 && py < buf.length / W) buf[py * W + px] = c;
    }
  };
  const SKIN = hurt >= 4 ? ((0xff << 24) | (0x90 << 16) | (0x88 << 8) | 0x90) : hurt >= 2 ? ((0xff << 24) | (0x78 << 16) | (0x9c << 8) | 0xc8) : ((0xff << 24) | (0x5a << 16) | (0x90 << 8) | 0xc8);
  const DARK = (0xff << 24) | (0x20 << 16) | (0x34 << 8) | 0x52;
  const HAIR = (0xff << 24) | (0x20 << 16) | (0x3a << 8) | 0x5c;
  const BLOOD = (0xff << 24) | (0x18 << 16) | (0x18 << 8) | 0xb0;
  const EYE = hurt >= 3 ? DARK : ((0xff << 24) | (0xf0 << 16) | (0xf0 << 8) | 0xe0);
  // hair top
  for (let c = 1; c <= 6; c++) put(c, 0, HAIR);
  // face
  for (let fy = 1; fy <= 6; fy++) for (let c = 1; c <= 6; c++) put(c, fy, SKIN);
  put(0, 2, DARK); put(0, 3, DARK); put(7, 2, DARK); put(7, 3, DARK);
  // eyes (shift with faceDir)
  const dx = dir < 0 ? -1 : dir > 0 ? 1 : 0;
  put(2 + dx, 3, EYE); put(5 + dx, 3, EYE);
  // mouth
  const m = hurt >= 3 ? ((0xff << 24) | (0x28 << 16) | (0x30 << 8) | 0x70) : ((0xff << 24) | (0x28 << 16) | (0x30 << 8) | 0x70);
  put(3, 5, m); put(4, 5, m);
  // blood layers by hurt
  if (hurt >= 1) { put(6, 1, BLOOD); put(6, 2, BLOOD); }
  if (hurt >= 2) { put(1, 3, BLOOD); put(2, 4, BLOOD); put(6, 4, BLOOD); }
  if (hurt >= 3) { put(1, 2, BLOOD); put(2, 3, BLOOD); put(5, 2, BLOOD); put(7, 4, BLOOD); put(4, 6, BLOOD); }
  if (hurt >= 4) { put(3, 2, BLOOD); put(4, 3, BLOOD); put(5, 4, BLOOD); put(2, 5, BLOOD); put(6, 5, BLOOD); }
}

/** Firing reticle: the exact spot the center bolt/pellet lands (PLAY only). */
export function renderReticle(game) {
  if (game.state !== 'PLAY') return;
  const { W, H } = game;
  const buf = game.renderer.buf;
  const cx = W >> 1, cy = H >> 1;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [3, 0], [-3, 0], [0, 1], [0, -1], [0, 3], [0, -3]]) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = C_RET;
  }
}

/** Bottom strip + message + proximity hint. PLAY only. */
export function renderHud(game) {
  const { W, H } = game;
  const buf = game.renderer.buf;
  const p = game.player;
  const TOP = H - 26;
  for (let y = TOP; y < H; y++) {
    for (let x = 0; x < W; x++) buf[y * W + x] = y === TOP ? C_BG_LN : C_BG;
  }
  drawFace(buf, W, 6, TOP + 4, 2, Math.min(4, Math.max(0, p.faceHurt | 0)), p.faceDir);
  // hp (green), 2-3 digits
  blit(buf, W, String(p.hp), 34, TOP + 6, 2, C_HP);
  // weapon name (gray) + ammo (yellow)
  const name = WEAPON_NAME[p.weapon] || '';
  blit(buf, W, name, 132, TOP + 6, 2, C_NAME);
  const ammo = p.weapon === 1 ? '-' : p.weapon === 2 ? String(p.ammoP) : p.weapon === 3 ? String(p.ammoS) : String(p.ammoPl);
  blit(buf, W, ammo, 132 + name.length * 12 + 10, TOP + 6, 2, C_AMMO);
  // armor (yellow)
  blit(buf, W, String(p.armor), 356, TOP + 6, 2, C_AMMO);
  // keycard slots
  for (let i = 0; i < 2; i++) {
    const kx = 432 + i * 22;
    for (let y = TOP + 5; y < TOP + 19; y++) for (let x = kx; x < kx + 14; x++) buf[y * W + x] = C_BG_LN;
    if (i === 0 && p.keyR) { for (let y = TOP + 7; y < TOP + 17; y++) for (let x = kx + 2; x < kx + 12; x++) buf[y * W + x] = C_KEYR; }
    if (i === 1 && p.keyB) { for (let y = TOP + 7; y < TOP + 17; y++) for (let x = kx + 2; x < kx + 12; x++) buf[y * W + x] = C_KEYB; }
  }
  // top-edge compass pointer to the current objective (always drawn while
  // there is one): triangle slides across the top toward the target's
  // screen direction + distance in units. 0 rad = dead ahead.
  const obj = currentObjective(game);
  if (obj) {
    const { rel, dist } = compassInfo(game, obj);
    const cx = Math.round(W / 2 + Math.max(-1, Math.min(1, rel / 2.2)) * (W / 2 - 16));
    for (let r = 0; r < 5; r++) {
      for (let x = -r; x <= r; x++) {
        const xx = cx + x;
        if (xx >= 0 && xx < W) buf[(5 + r) * W + xx] = obj.color;
      }
    }
    blit(buf, W, String(Math.round(dist)), Math.max(4, Math.min(W - 24, cx - 10)), 11, 1, obj.color);
  }
  // banner priority: transient message > use-hint > persistent objective
  let hint = '';
  const hit = scanUse(game);
  if (hit) {
    hint = hit.kind === 'exit' ? 'PRESS E / U - EXIT'
      : hit.kind === 'door-R' ? (p.keyR ? 'PRESS E / U - DOOR' : 'RED KEYCARD NEEDED')
      : hit.kind === 'door-B' ? (p.keyB ? 'PRESS E / U - DOOR' : 'BLUE KEYCARD NEEDED')
      : 'PRESS E / U - DOOR';
  }
  if (game.message.t > 0 && game.message.text) {
    const msg = game.message.text.toUpperCase(); // long objectives drop to scale 1
    blitCenter(buf, W, msg, H - 44, msg.length * 12 > W - 8 ? 1 : 2, C_MSG);
  } else if (hint) {
    blitCenter(buf, W, hint, H - 38, 1, C_HINT);
  } else if (obj) {
    blitCenter(buf, W, obj.label, H - 38, 1, obj.color);
  }
}

/** Title screen: big WEBDOOM + prompt (state MENU; scene renders behind). */
export function renderMenu(game) {
  const { W, H } = game;
  const buf = game.renderer.buf;
  const C_TITLE = (0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0xc8;
  const C_SUB = (0xff << 24) | (0x88 << 16) | (0x88 << 8) | 0x88;
  blitCenter(buf, W, 'WEBDOOM', 58, 5, C_TITLE);
  if ((game.frame / 30 | 0) % 2 === 0) blitCenter(buf, W, 'PRESS ENTER TO START', 156, 2, C_SUB);
  const C_DIFF = (0xff << 24) | (0x3a << 16) | (0xd0 << 8) | 0xd0;
  blitCenter(buf, W, 'DIFFICULTY: ' + DIFFS[game.diff | 0].name + ' - CHANGE WITH LEFT/RIGHT', 176, 1, C_DIFF);
  blitCenter(buf, W, 'WASD MOVE - MOUSE LOOK - 1 2 3 4 WEAPONS - E USE', 212, 1, C_SUB);
  blitCenter(buf, W, 'TAB AUTOMAP - SHIFT RUN', 224, 1, C_SUB);
}
