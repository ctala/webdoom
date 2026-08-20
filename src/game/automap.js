// TAB automap: opaque panel centered over the scene. Draws only cells the
// player has seen (this.explored), the player with heading, live enemies,
// the exit switch and a scale of 6 px per cell (32x24 map -> 192x144).

const S = 6;

const C_BG = (0xff << 24) | (0x00 << 16) | (0x00 << 8) | 0x00;
const C_FLOOR = (0xff << 24) | (0x18 << 16) | (0x24 << 8) | 0x14;
const C_WALL = (0xff << 24) | (0x30 << 16) | (0x40 << 8) | 0x90;
const C_DOOR = (0xff << 24) | (0x60 << 16) | (0xd0 << 8) | 0xff;
const C_SECRET = (0xff << 24) | (0x40 << 16) | (0x10 << 8) | 0x60;
const C_EXIT = (0xff << 24) | (0x60 << 16) | (0xff << 8) | 0xff;
const C_PLAYER = (0xff << 24) | (0xff << 16) | (0xff << 8) | 0xff;
const C_ENEMY = (0xff << 24) | (0x10 << 16) | (0x20 << 8) | 0xd0;

/**
 * @param {object} game
 * @returns {{x0:number, y0:number, x1:number, y1:number}} panel bounds (for tests)
 */
export function automapBounds(game) {
  const { gw, gh } = game.map;
  const x0 = (game.W - gw * S) / 2 | 0;
  const y0 = (game.H - gh * S) / 2 | 0;
  return { x0, y0, x1: x0 + gw * S - 1, y1: y0 + gh * S - 1 };
}

export function renderAutomap(game) {
  const { W, H } = game;
  const buf = game.renderer.buf;
  const { gw, gh, solid, doorType } = game.map;
  const explored = game.explored;
  const ex = game.map.exit;
  const b = automapBounds(game);
  if (b.x0 < 4) return; // map wider than screen: skip (not our levels)
  // opaque panel
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) buf[y * W + x] = C_BG;
  const seen = (cx, cy) => cx >= 0 && cy >= 0 && cx < gw && cy < gh && explored[cy * gw + cx] !== 0;
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      if (!seen(cx, cy)) continue;
      const i = cy * gw + cx;
      let col = C_FLOOR;
      const s = solid[i];
      if (s === 0) col = C_FLOOR;
      else if (s >= 8 && s <= 11) col = doorType[i] === 4 ? C_SECRET : C_DOOR;
      else col = C_WALL;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const px = b.x0 + cx * S + dx, py = b.y0 + cy * S + dy;
        buf[py * W + px] = col;
      }
    }
  }
  // exit switch
  if (ex && seen(Math.floor(ex.x), Math.floor(ex.y))) {
    const ex0 = b.x0 + Math.floor(ex.x) * S, ey0 = b.y0 + Math.floor(ex.y) * S;
    for (let dy = 1; dy < S - 1; dy++) for (let dx = 1; dx < S - 1; dx++) buf[(ey0 + dy) * W + (ex0 + dx)] = C_EXIT;
  }
  // enemies (alive, in seen cells)
  for (let i = 0; i < game.enemyCount; i++) {
    const e = game.enemies[i];
    if (e.state === undefined) continue;
    const st = e.state;
    if (st === 5 || st === 6) continue; // death anim / corpse
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    if (!seen(cx, cy)) continue;
    const ex0 = b.x0 + cx * S, ey0 = b.y0 + cy * S;
    for (let dy = 2; dy < S - 1; dy++) for (let dx = 2; dx < S - 1; dx++) buf[(ey0 + dy) * W + (ex0 + dx)] = C_ENEMY;
  }
  // player dot + heading tick
  const p = game.player;
  const px = b.x0 + (p.x * S) | 0, py = b.y0 + (p.y * S) | 0;
  buf[py * W + px] = C_PLAYER;
  let hx = (Math.cos(p.ang) * 4) | 0, hy = (Math.sin(p.ang) * 4) | 0;
  if (!hx && !hy) hx = 4;
  buf[(py + hy < 0 ? py - 1 : (py + hy >= H ? H - 1 : py + hy)) * W + (px + hx < 0 ? px - 1 : (px + hx >= W ? W - 1 : px + hx))] = C_PLAYER;
}
