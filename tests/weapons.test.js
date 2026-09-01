import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { ST } from '../src/engine/fsm.js';
import { updateWeapons, switchWeapon, WEAPON_DEF } from '../src/game/weapons.js';
import { BLOOD_COLORS } from '../src/game/particles.js';

const W = 480, H = 270;

function makeGame(rows, startAng = 0) {
  const buf = new Uint32Array(W * H);
  const g = new Game(makeTables(null), W, H, buf, null);
  g.levels = [{ name: 'T', startAng, theme: 0, map: rows }];
  g.loadLevel(0);
  return g;
}

// 12x7 room; note the forced-solid border: entities must stay in cols 1..10.
const ROOM = [
  '############',
  '#...........',
  '#...........',
  '#P........i#',
  '#...........',
  '#...........',
  '############',
];

function tickN(g, n) {
  for (let i = 0; i < n; i++) g.tick(1 / 60);
}
function shot(g, rest = 30) {
  g.input.fire = true;
  g.tick(1 / 60);
  g.input.fire = false;
  tickN(g, rest);
}

test('weapon defs: sane values and ammo slots', () => {
  for (const id of [1, 2, 3, 4]) {
    const d = WEAPON_DEF[id];
    assert.ok(d && d.cd > 0 && d.cd < 1.5, 'cd for ' + id);
    assert.ok(d.dmgMax >= d.dmgMin > 0, 'dmg range for ' + id);
    if (d.ammo) assert.ok(d.pellets >= 1);
  }
  assert.equal(WEAPON_DEF[2].ammo, 'ammoP');
  assert.equal(WEAPON_DEF[3].ammo, 'ammoS');
  assert.equal(WEAPON_DEF[4].ammo, 'ammoPl');
});

test('pistol hitscan damages the aligned enemy; kill counts', () => {
  const g = makeGame(ROOM);
  const e = g.enemies[0];
  assert.equal(e.x, 10.5);
  const hp0 = e.hp;
  let kills = 0;
  for (let s = 0; s < 24 && kills === 0; s++) {
    shot(g);
    if (e.hp <= 0 || e.state === ST.DEATH || e.state === ST.CORPSE) kills = 1;
  }
  assert.ok(e.hp < hp0, 'pistol dealt damage (hp ' + e.hp + ' < ' + hp0 + ')');
  assert.equal(kills, 1, 'enemy eventually dies to pistol');
  assert.equal(g.stats.kills, 1);
  assert.ok(g.player.ammoP < 50, 'ammoP consumed');
});

test('hitscan falloff: pistol at 9u does a fraction of its close-range damage', () => {
  const g = makeGame(ROOM);
  const e = g.enemies[0];
  e.hp = 1e9;
  const fireOne = (x) => {
    e.x = x; e.y = 3.5; e.state = ST.SLEEP; e.cd = 9; // pin the imp so only distance varies
    g.player.wpnCd = 0; g.input.fire = true; g.tick(1 / 60); g.input.fire = false;
  };
  let far = 0;
  for (let k = 0; k < 10; k++) { const h = e.hp; fireOne(10.5); far += h - e.hp; }
  let near = 0;
  for (let k = 0; k < 10; k++) { const h = e.hp; fireOne(3.0); near += h - e.hp; } // dist 1.5
  assert.ok(far < near / 2, `falloff halves damage at 9u (far ${far} vs near ${near})`);
  assert.ok(far <= 70 && near >= 80, `ranges sane (far ${far} in <=7/shot, near ${near} >=8/shot)`);
});

test('pistol cooldown: holding fire does not double-shoot', () => {
  const g = makeGame(ROOM);
  const ammo0 = g.player.ammoP;
  g.input.fire = true;
  g.tick(1 / 60);
  g.tick(1 / 60); // cd still running
  g.tick(1 / 60);
  g.input.fire = false;
  assert.equal(g.player.ammoP, ammo0 - 1, 'one shot per cooldown window');
});

test('out of ammo auto-falls back (pistol -> fists, shotgun -> pistol)', () => {
  const g = makeGame(ROOM);
  const p = g.player;
  p.weapon = 2; p.ammoP = 0;
  g.input.fire = true; g.tick(1 / 60); g.input.fire = false;
  assert.equal(p.weapon, 1, 'fell back to fists');
  assert.ok(/OUT OF AMMO/.test(g.message.text));
  const g2 = makeGame(ROOM);
  const p2 = g2.player;
  p2.weapon = 3; p2.ammoS = 0; p2.ammoP = 12;
  g2.input.fire = true; g2.tick(1 / 60); g2.input.fire = false;
  assert.equal(p2.weapon, 2, 'shotgun fell back to pistol');
});

test('fists: hits inside range+cone, misses outside', () => {
  const g = makeGame(ROOM);
  g.switchWeapon(1);
  let n0 = g.enemyCount;
  // straight ahead at 1.0 (within range 1.3)
  const a = g.enemies[n0++] = { type: 'imp', x: 2.5, y: 3.5, hp: 60, maxHp: 60, state: ST.CHASE };
  // 43 deg sideways at 1.0 (outside cone 0.55 rad)
  const b = g.enemies[n0++] = { type: 'imp', x: 1.5 + Math.cos(0.75), y: 3.5 + Math.sin(0.75), hp: 60, maxHp: 60, state: ST.CHASE };
  g.enemyCount = n0;
  shot(g);
  assert.ok(a.hp < 60, 'in-cone target hurt: ' + a.hp);
  assert.equal(b.hp, 60, 'out-of-cone target untouched');
});

test('walls block hitscan: front enemy hit, back enemy untouched', () => {
  const rows = [
    '############',
    '#...........',
    '#...........',
    '#P..i.#...i#',
    '#...........',
    '#...........',
    '############',
  ];
  const g = makeGame(rows);
  const [front, back] = g.enemies; // map order: back (row3 col10) then front? parse order is row-major
  const fe = front.x < back.x ? front : back;
  const be = front.x < back.x ? back : front;
  assert.equal(fe.x, 4.5); assert.equal(be.x, 10.5);
  const hpF = fe.hp, hpB = be.hp;
  shot(g);
  assert.ok(fe.hp < hpF, 'front enemy hit');
  assert.equal(be.hp, hpB, 'enemy behind wall untouched');
});

test('shotgun spread can reach both flanking enemies', () => {
  const rows = [
    '############',
    '#...........',
    '#...........',
    '#...........',
    '#P.........#',
    '#...........',
    '############',
  ];
  const g = makeGame(rows);
  g.switchWeapon(3);
  let n0 = g.enemyCount;
  const a = g.enemies[n0++] = { type: 'imp', x: 10.5, y: 4.9, hp: 60, maxHp: 60, state: ST.CHASE };
  const b = g.enemies[n0++] = { type: 'imp', x: 10.5, y: 4.1, hp: 60, maxHp: 60, state: ST.CHASE };
  g.enemyCount = n0;
  shot(g);
  assert.ok(a.hp < 60 && b.hp < 60, `spread reached both flanks: ${a.hp} / ${b.hp}`);
  assert.equal(g.player.ammoS, 7, 'one shell consumed');
});

test('plasma: projectile flights, damages, kills over 4 shots', () => {
  const rows = [
    '############',
    '#...........',
    '#...........',
    '#P.........#',
    '#P....i....#',
    '#...........',
    '############',
  ];
  const g = makeGame(rows);
  const e = g.enemies[0]; // (6.5, 4.5), 5 ahead
  assert.equal(e.x, 6.5);
  g.switchWeapon(4);
  const ammo0 = g.player.ammoPl;
  for (let s = 0; s < 4; s++) shot(g, 50);
  assert.ok(e.hp <= 0 || e.state >= ST.DEATH, 'plasma killed the enemy');
  assert.equal(g.stats.kills, 1);
  assert.equal(g.player.ammoPl, ammo0 - 4);
  // no instant hitscan damage: right after the first shot it was still full hp or only partially shot
});

test('plasma splash damages a bystander near the impact', () => {
  const rows = [
    '############',
    '#...........',
    '#...........',
    '#P.........#',
    '#P....i....#',
    '#...........',
    '############',
  ];
  const g = makeGame(rows);
  const e = g.enemies[0]; // (6.5, 4.5)
  let n0 = g.enemyCount;
  const b = g.enemies[n0++] = { type: 'demon', x: 6.9, y: 4.5, hp: 85, maxHp: 85, state: ST.CHASE };
  g.enemyCount = n0; // 0.4 beside the impact line
  g.switchWeapon(4);
  shot(g, 60);
  assert.ok(b.hp < 85, 'splash damaged the bystander: ' + b.hp);
});

test('plasma wall splat leaves a burn decal that renders', () => {
  const rows = [
    '############',
    '#...........',
    '#P.........#',
    '#...........',
    '#...........',
    '#...........',
    '############',
  ];
  const g = makeGame(rows);
  g.switchWeapon(4);
  g.input.fire = true; g.tick(1 / 60); g.input.fire = false;
  tickN(g, 130); // let the bolt fly into the east wall
  let dec = null;
  for (const it of g.decalItems) if (it.active && it.kind === 1) { dec = it; break; }
  assert.ok(dec, 'a burn decal was registered');
  assert.equal(dec.side, 0, 'X face (ray side 0)');
  // stand near the wall and verify pixels actually change to decal color
  const p = g.player;
  p.x = 9.5; p.y = 2.5; p.ang = 0;
  g.render(null);
  const burn = g.assets.decalBurn;
  const set = new Set();
  for (let L = 0; L < 64; L++) set.add(burn[L]);
  let hits = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (set.has(g.renderer.buf[y * W + x])) hits++;
  assert.ok(hits >= 4, 'burn decal pixels visible: ' + hits);
});

test('decals reset on level reload', () => {
  const g = makeGame(ROOM);
  g.addDecal(1 * g.map.gw + 5, 0, 0.5, 1, 3);
  assert.ok(g.decalItems[0].active || g.decalItems.some((i) => i.active));
  g.loadLevel(0);
  assert.ok(!g.decalItems.some((i) => i.active), 'all decals cleared');
  assert.ok(g.decalHead.every((h) => h === -1));
});

test('blood particles: spawn, fall, expire and render onto the buffer', () => {
  const g = makeGame(ROOM);
  const e = g.enemies[0];
  // offset sideways so clots project off the exact aim column (reticle sits there)
  g.spawnBlood(e.x, e.y + 0.5, 14, 0, 4);
  let alive = 0;
  g.particles.each((q) => { if (q.active) alive++; });
  assert.equal(alive, 14);
  g.render(null);
  // 24-bit mask: the packed constants carry the 0xff alpha (signed int32 in JS)
  const m1 = BLOOD_COLORS[0] & 0xffffff, m2 = BLOOD_COLORS[1] & 0xffffff;
  let px = 0;
  for (let i = 0; i < W * H; i++) if ((g.renderer.buf[i] & 0xffffff) === m1 || (g.renderer.buf[i] & 0xffffff) === m2) px++;
  assert.ok(px >= 3, 'blood pixels drawn: ' + px);
  tickN(g, 80); // > max life
  alive = 0;
  g.particles.each((q) => { if (q.active) alive++; });
  assert.equal(alive, 0, 'particles expired');
});

const hasFlash = (snap) => {
  let n = 0;
  for (let i = 0; i < snap.length; i++) {
    const r = snap[i] & 0xff, gg = (snap[i] >> 8) & 0xff;
    if (r > 230 && gg > 200) n++; // warm muzzle-flash whites/yellows
  }
  return n;
};

test('wall u/v sampling: columns differ along a brick face (stage4 fix + decal anchor)', () => {
  const rows = [
    '##########',
    '#........#',
    '#........#',
    '#........#',
    '#P..######',
    '#........#',
    '##########',
  ];
  const g = makeGame(rows);
  // player (1.5,4.5) faces the 1-cell wall at col 4 (d=2.5, screen ~x 166..314, y 108..162)
  g.addDecal(4 * g.map.gw + 4, 0, 0.5, 1, 6); // burn at face center (u=0.5, v=0.5)
  g.render(null);
  const lum = (v) => (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff);
  let lo = 1e9, hi = -1e9;
  for (let x = 170; x <= 310; x += 2) {
    let sum = 0;
    for (let y = 112; y <= 158; y += 3) sum += lum(g.renderer.buf[y * W + x]);
    const m = sum / 17;
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  assert.ok(hi - lo > 25, `brick column variety across the wall (spread ${Math.round(hi - lo)})`);
  // the decal: burn pixels near the face center (x~240, y~135)
  const burn = g.assets.decalBurn;
  const set = new Set();
  for (let L = 0; L < 64; L++) set.add(burn[L]);
  let dpx = 0;
  for (let y = 118; y <= 152; y++) for (let x = 228; x <= 252; x++) if (set.has(g.renderer.buf[y * W + x])) dpx++;
  assert.ok(dpx >= 16, 'decal pixels at the expected screen position: ' + dpx);
});

test('viewmodel renders over the buffer (non-zero weapon pixels at bottom center)', () => {
  const g = makeGame(ROOM);
  const y0 = H - 60, x0 = (W * 0.4) | 0, x1 = (W * 0.95) | 0;
  const snap = () => {
    const out = new Uint32Array(H * W);
    for (let y = y0; y < H; y++) for (let x = x0; x < x1; x++) out[(y - y0) * W + (x - x0)] = g.renderer.buf[y * W + x];
    return out;
  };
  let px = 0;
  g.player.swingT = 0.15; // fire frame
  g.render(null);
  for (let i = 0; i < W * H; i++) if (g.renderer.buf[i] !== 0) px++;
  assert.ok(px > 500, 'frame is not empty: ' + px);
  const a = snap();
  // switching weapons changes the drawn frame
  g.switchWeapon(4);
  g.player.swingT = 0.15;
  g.render(null);
  const b = snap();
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 100, 'different weapon renders a different viewmodel: ' + diff + ' px differ');
});

test('reticle drawn at the exact screen center (the aim point)', () => {
  const g = makeGame(ROOM);
  g.render(null);
  const buf = g.renderer.buf;
  const cx = W >> 1, cy = H >> 1;
  const C = ((0xff << 24) | (0x20 << 16) | (0xff << 8) | 0x50) >>> 0; // bright green, unsigned
  const at = (x, y) => (buf[y * W + x] >>> 0) === C;
  assert.ok(at(cx, cy), 'center pixel');
  assert.ok(at(cx + 1, cy) && at(cx - 1, cy), 'inner arms');
  assert.ok(at(cx + 3, cy) && at(cx - 3, cy) && at(cx, cy + 3) && at(cx, cy - 3), 'outer arms');
  assert.ok(!at(cx + 2, cy), 'gap between arms (crosshair look)');
  g.state = 'DEAD'; g.render(null);
  assert.ok(!at(cx, cy), 'reticle hidden when dead');
});

test('weapon switch looks neutral: no fire frame, no ammo, no shot', () => {
  const g = makeGame(ROOM);
  const p = g.player;
  const snap = () => {
    const out = new Uint32Array(200 * 90);
    for (let y = H - 90; y < H; y++) for (let x = 170; x < 370; x++) out[(y - (H - 90)) * 200 + (x - 170)] = g.renderer.buf[y * W + x];
    return out;
  };
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  };
  p.switchT = 0; p.swingT = 0;
  g.switchWeapon(3); p.switchT = 0; // shotgun at rest
  p.switchT = 0;
  g.render(null);
  const atRest = snap();
  const ammoPl0 = p.ammoPl;
  // switch to plasma: must not fire (no shot, no ammo, no fire frame)
  g.switchWeapon(4);
  assert.equal(p.swingT, 0, 'switch does not arm the fire swing');
  assert.equal(p.ammoPl, ammoPl0, 'switching consumes nothing');
  assert.ok(p.switchT > 0, 'switch anim armed');
  g.render(null);
  const midSwitch = snap(); // plasma, dropped 10px, IDLE frame
  g.tick(1 / 60);
  assert.equal(p.swingT, 0);
  g.render(null);
  const settled = snap();
  // the switch pose must NOT carry the muzzle-flash; a real fire frame does
  p.swingT = 0.18;
  g.render(null);
  const firePose = snap();
  p.swingT = 0;
  assert.ok(hasFlash(firePose) - hasFlash(midSwitch) > 60, 'fire pose carries the muzzle flash; switch pose does not (idle core only)');
  assert.ok(hasFlash(settled) - hasFlash(midSwitch) < 40, 'mid-switch and settled show the same idle core (drop anim only)');
  assert.ok(diff(midSwitch, settled) < 8000, 'mid-switch differs from settled only by the drop animation');
});

test('AIM is honored: a centered enemy on the aim ray is hit by plasma', () => {
  const g = makeGame(ROOM); // player (1.5,3.5) ang=0 -> aim ray is y=3.5
  let n0 = g.enemyCount;
  const e = g.enemies[n0++] = { type: 'imp', x: 6.5, y: 3.5, hp: 60, maxHp: 60, state: ST.CHASE }; // dead on the aim ray
  g.enemyCount = n0;
  g.switchWeapon(4);
  shot(g, 70); // bolt travels ~5u
  assert.ok(e.hp <= 0 || e.hp < 60, `centered bolt damaged the enemy on the aim ray (hp ${e.hp})`);
});

test('determinism: identical seed -> identical damage sequence', () => {
  const run = () => {
    const g = makeGame(ROOM);
    g.rng = 777;
    const seq = [];
    const e = g.enemies[0];
    for (let s = 0; s < 4; s++) {
      shot(g, 40);
      seq.push(e.hp);
    }
    return seq.join(',');
  };
  assert.equal(run(), run());
});
