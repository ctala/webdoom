// Level definition: multiline ASCII array (see levels/*.js).
//
// Legend:
//   '#' brick (h1)   '1' tech (h1)      '2' stone (h1)     '3' metal (h1)
//   'T' brick x1.5   'L' stone x0.5     (variable-height sectors)
//   'D' door (use)   'R' red-key door   'B' blue-key door  'S' secret wall
//   'X' exit switch  'P' player start
//   'i' imp          'd' demon          'c' commander      'v' cacodemon
//   'h' +health      'g' +armor         'm' pistol ammo    's' shotgun shells
//   'p' plasma cells 'k' red key        'b' blue key       '.' open floor
//   'J' the Warden (E3M1 boss)

export const W_BRICK = 1;
export const W_TECH = 2;
export const W_STONE = 3;
export const W_METAL = 4;
export const DOOR_ID_BASE = 8; // solid ids 8..11 = doors, type = id - 8 (0 D,1 R,2 B,3 S)

export const H_LOW = 1;   // 1.0 world units tall
export const H_NORM = 2;  // 2.0 world units tall
export const H_TALL = 3;  // 3.0 world units tall

const WALLS = new Map([
  ['#', [W_BRICK, H_NORM]],
  ['1', [W_TECH, H_NORM]],
  ['2', [W_STONE, H_NORM]],
  ['3', [W_METAL, H_NORM]],
  ['T', [W_BRICK, H_TALL]],
  ['L', [W_STONE, H_LOW]],
]);

const ENT_CODES = { i: 'imp', d: 'demon', c: 'commander', v: 'caco', J: 'boss', h: 'health', g: 'armor', m: 'ammoP', s: 'ammoS', p: 'ammoPl', r: 'ammoR', k: 'keyR', b: 'keyB', L: 'lostsoul', N: 'baron', Q: 'pain' };

export function parseLevel(rows, name = '') {
  const gh = rows.length;
  let gw = 0;
  for (let i = 0; i < gh; i++) if (rows[i].length > gw) gw = rows[i].length;
  const solid = new Uint8Array(gw * gh);
  const heights = new Uint8Array(gw * gh);
  const doorType = new Uint8Array(gw * gh); // 1=D 2=R 3=B 4=S (0 = none)
  const ents = [];
  let player = null;
  let exit = null;

  for (let cy = 0; cy < gh; cy++) {
    const row = (rows[cy] || '').padEnd(gw, '#');
    for (let cx = 0; cx < gw; cx++) {
      const ch = row[cx];
      const idx = cy * gw + cx;
      const w = WALLS.get(ch);
      if (w) {
        solid[idx] = w[0];
        heights[idx] = w[1];
        continue;
      }
      switch (ch) {
        case 'D': case 'R': case 'B': {
          const t = ch === 'D' ? 0 : ch === 'R' ? 1 : 2;
          solid[idx] = DOOR_ID_BASE + t;
          heights[idx] = H_NORM;
          doorType[idx] = t === 0 ? 1 : t + 1;
          break;
        }
        case 'S':
          solid[idx] = DOOR_ID_BASE + 3;
          heights[idx] = H_NORM;
          doorType[idx] = 4;
          break;
        case 'P':
          player = { x: cx + 0.5, y: cy + 0.5 };
          break;
        case 'X':
          exit = { x: cx + 0.5, y: cy + 0.5 };
          break;
        case '.':
          break;
        default: {
          const code = ENT_CODES[ch];
          if (code) ents.push({ type: code, x: cx + 0.5, y: cy + 0.5 });
          else if (ch !== ' ') { solid[idx] = W_BRICK; heights[idx] = H_NORM; }
        }
      }
    }
  }
  // Enforce a solid border so rays never escape the grid.
  for (let cx = 0; cx < gw; cx++) {
    if (!solid[cx]) { solid[cx] = W_BRICK; heights[cx] = H_NORM; }
    if (!solid[(gh - 1) * gw + cx]) { solid[(gh - 1) * gw + cx] = W_BRICK; heights[(gh - 1) * gw + cx] = H_NORM; }
  }
  for (let cy = 0; cy < gh; cy++) {
    if (!solid[cy * gw]) { solid[cy * gw] = W_BRICK; heights[cy * gw] = H_NORM; }
    if (!solid[cy * gw + gw - 1]) { solid[cy * gw + gw - 1] = W_BRICK; heights[cy * gw + gw - 1] = H_NORM; }
  }

  return {
    name, gw, gh, solid, heights, doorType,
    player: player || { x: 1.5, y: 1.5 },
    exit, ents,
  };
}
