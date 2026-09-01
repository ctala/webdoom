import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTables } from '../src/gfx/textures.js';
import { Game } from '../src/game/game.js';
import { parseLevel, DOOR_ID_BASE } from '../src/engine/map.js';
import { ENEMY_DEF, fireEnemyProjectile, damageEnemy, updateEnemies, isEnraged } from '../src/game/enemy.js';
import { useAction } from '../src/game/interact.js';
import { currentObjective, compassInfo, bossAlive, OBJ_COLORS } from '../src/game/objective.js';
import { renderHud } from '../src/gfx/hud.js';
import { renderAutomap } from '../src/game/automap.js';
import { buildItemSprites } from '../src/gfx/itemSprites.js';
import { ST } from '../src/engine/fsm.js';
import { E3M1 } from '../levels/e3m1.js';

const W = 480, H = 270;
function makeGame() {
  return new Game(makeTables(null), W, H, new Uint32Array(W * H));
}
const cnt = (buf, col) => { const m = col >>> 0; let n = 0; for (let i = 0; i < buf.length; i++) if (buf[i] >>> 0 === m) n++; return n; };

/** Flood fill with all doors passable (playable reachability). */
function flood(map) {
  const { gw, gh, solid, player } = map;
  const seen = new Uint8Array(gw * gh);
  const st = [Math.floor(player.y) * gw + Math.floor(player.x)];
  seen[st[0]] = 1;
  const pass = (i) => { const s = solid[i]; return s === 0 || (s >= DOOR_ID_BASE && s <= DOOR_ID_BASE + 3); };
  while (st.length) {
    const i = st.pop();
    const x = i % gw, y = (i / gw) | 0;
    for (const [j, nx, ny] of [[i - 1, x - 1, y], [i + 1, x + 1, y], [i - gw, x, y - 1], [i + gw, x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      if (seen[j] || !pass(j)) continue;
      seen[j] = 1; st.push(j);
    }
  }
  return seen;
}

test('E3M1: valid map; exit/boss/items all reachable through the D door', () => {
  const m = parseLevel(E3M1.map, E3M1.name);
  assert.equal(m.gw, 32); assert.equal(m.gh, 24);
  assert.ok(m.exit, 'exit exists');
  const seen = flood(m);
  assert.ok(seen[Math.floor(m.exit.y) * m.gw + Math.floor(m.exit.x)], 'exit reachable');
  const count = (t) => m.ents.filter((e) => e.type === t).length;
  assert.equal(count('boss'), 1, 'exactly one Warden');
  assert.equal(count('demon') + count('imp'), 3, 'three escorters');
  const items = 3 + 3 + 2 + 2 + 1; // h m s p g
  assert.equal(count('health') + count('ammoP') + count('ammoS') + count('ammoPl') + count('armor'), items);
  assert.ok(m.ents.some((e) => e.type === 'boss' && seen[Math.floor(e.y) * m.gw + Math.floor(e.x)] === 1), 'boss cell reachable');
});

test('boss is spawned by loadLevel with the big HP pool', () => {
  const g = makeGame();
  g.loadLevel(2);
  const e = g.enemies.find((x) => x.type === 'boss');
  assert.ok(e, 'boss in the pool');
  assert.equal(e.hp, 550);
  assert.ok(e.maxHp === 550);
  g.loadLevel(0);
  assert.equal(g.enemies.some((x) => x.type === 'boss'), false, 'no boss in E1M1');
});

test('THE WARDEN closes the distance (press) instead of kiting at max range', () => {
  const g = makeGame();
  g.loadLevel(2);
  const e = g.enemies.find((x) => x.type === 'boss');
  e.x = 17.5; e.y = 12.5; // arena open ground
  g.player.x = 11.0; g.player.y = 12.5; // dist 6.5 > press 5
  e.state = ST.ATTACK; e.cd = 99; // force attack state, skip firing
  const x0 = e.x;
  for (let i = 0; i < 60; i++) updateEnemies(g, 1 / 60);
  assert.ok(e.x < x0 - 0.5, `warden advanced toward the player (${x0} -> ${e.x})`);
});

test('THE WARDEN fires a 3-bolt spread', () => {
  const g = makeGame();
  g.loadLevel(2);
  const e = g.enemies.find((x) => x.type === 'boss');
  g.projectiles.each((p) => { p.active = false; });
  fireEnemyProjectile(g, e);
  let n = 0;
  g.projectiles.each((p) => { if (p.active && p.owner === 0) n++; });
  assert.equal(n, 3, 'three bolts per attack');
});

test('enrage: below 45% hp the flag, message, and bolt damage kick in', () => {
  const g = makeGame();
  g.loadLevel(2);
  const e = g.enemies.find((x) => x.type === 'boss');
  g.projectiles.each((p) => { p.active = false; });
  g.player.hp = 1e5;
  fireEnemyProjectile(g, e); // normal: 24
  let dmg1 = 0;
  g.projectiles.each((p) => { if (p.active && p.owner === 0) dmg1 = Math.max(dmg1, p.dmg); });
  assert.equal(dmg1, 24);
  assert.equal(isEnraged(e), false);
  e.hp = 400;
  damageEnemy(g, e, 199); // 201 -> below 45% (202.5)
  assert.equal(e.enraged, true);
  assert.equal(g.message.text, 'THE WARDEN IS ENRAGED');
  assert.equal(isEnraged(e), true);
  g.projectiles.each((p) => { p.active = false; });
  fireEnemyProjectile(g, e);
  let dmg2 = 0;
  g.projectiles.each((p) => { if (p.active && p.owner === 0) dmg2 = Math.max(dmg2, p.dmg); });
  assert.equal(dmg2, 36, 'enraged bolts +50%');
});

test('boss death: kill counted, message, exit unsealed -> progression (E3 no longer last)', () => {
  const g = makeGame();
  g.loadLevel(2);
  g.state = 'PLAY';
  const e = g.enemies.find((x) => x.type === 'boss');
  // before the kill: the exit is gated
  g.player.x = 15.5; g.player.y = 2.5; g.player.ang = -Math.PI / 2;
  useAction(g);
  assert.equal(g.state, 'PLAY', 'exit locked while the Warden lives');
  assert.equal(g.message.text, 'THE WARDEN GUARDS THE EXIT');
  assert.ok(bossAlive(g), 'boss still counts as alive');
  const kills = g.stats.kills;
  e.hp = 1;
  damageEnemy(g, e, 10);
  updateEnemies(g, 1 / 60);
  assert.equal(e.state, ST.DEATH);
  assert.equal(g.stats.kills, kills + 1);
  assert.match(g.message.text, /THE WARDEN FALLS/);
  assert.equal(bossAlive(g), null);
  g.player.hp = 100;
  useAction(g);
  assert.equal(g.state, 'INTERM', 'exit now advances to E4M1 (WON lives at E5M1 now)');
});

test('E4M1 exit needs BOTH keycards', () => {
  const g = makeGame();
  g.loadLevel(3);
  g.state = 'PLAY';
  g.player.x = g.map.exit.x; g.player.y = g.map.exit.y + 1; g.player.ang = -Math.PI / 2;
  useAction(g);
  assert.equal(g.state, 'PLAY', 'locked without keys');
  g.player.keyR = true;
  useAction(g);
  assert.equal(g.state, 'PLAY', 'one card is not enough');
  g.player.keyB = true;
  useAction(g);
  assert.equal(g.state, 'INTERM', 'both cards open the way out');
});

test('objective: key -> exit -> (E3M1) boss -> exit, with the right labels', () => {
  const g = makeGame();
  g.loadLevel(0);
  let o = currentObjective(g);
  assert.equal(o.kind, 'keyR');
  assert.equal(o.label, 'FIND THE RED KEYCARD');
  assert.equal(o.x, 2.5); assert.equal(o.y, 5.5);
  g.player.keyR = true;
  o = currentObjective(g);
  assert.equal(o.kind, 'exit');
  assert.equal(o.label, 'REACH THE EXIT');
  g.loadLevel(1);
  o = currentObjective(g);
  assert.equal(o.kind, 'keyB');
  g.player.keyB = true;
  o = currentObjective(g);
  assert.equal(o.kind, 'exit');
  g.loadLevel(2);
  o = currentObjective(g);
  assert.equal(o.kind, 'boss');
  assert.equal(o.label, 'DEFEAT THE WARDEN');
  const b = g.enemies.find((x) => x.type === 'boss');
  assert.equal(o.x, b.x); assert.equal(o.y, b.y);
  b.hp = 0;
  updateEnemies(g, 1 / 60);
  assert.equal(currentObjective(g).kind, 'exit', 'after the kill: the exit');
});

test('objective: no exit/key/boss level -> null (nothing to chase)', () => {
  const g = makeGame();
  g.levels = [{ name: 'R', startAng: 0, theme: 0, map: ['########', '#P.....#', '#.....X#', '########'] }];
  g.loadLevel(0);
  assert.equal(currentObjective(g).kind, 'exit');
  g.levels = [{ name: 'R', startAng: 0, theme: 0, map: ['########', '#P.....#', '########'] }];
  g.loadLevel(0);
  assert.equal(currentObjective(g), null);
});

test('compassInfo: facing the target => rel 0; dist exact', () => {
  const g = makeGame();
  g.loadLevel(0);
  const o = currentObjective(g);
  const p = g.player;
  p.ang = Math.atan2(o.y - p.y, o.x - p.x);
  const a = compassInfo(g, o);
  assert.ok(Math.abs(a.rel) < 1e-9, 'dead ahead');
  assert.ok(Math.abs(a.dist - Math.hypot(o.x - p.x, o.y - p.y)) < 1e-9);
  p.ang += Math.PI; // face away
  const b = compassInfo(g, o);
  assert.ok(Math.abs(Math.abs(b.rel) - Math.PI) < 1e-9, 'behind: rel ≈ PI');
});

test('HUD: objective compass triangle + banner render in the objective color', () => {
  const g = makeGame();
  g.loadLevel(2);
  g.state = 'PLAY';
  g.message.t = 0;
  renderHud(g);
  assert.ok(cnt(g.renderer.buf, OBJ_COLORS.boss) > 15, 'compass triangle + banner drawn');
  // a transient message hides the banner line (compass stays at the top)
  g.message.t = 3;
  g.message.text = 'X';
  const H0 = H - 38;
  g.renderer.buf.fill(0);
  renderHud(g);
  let bannerPx = 0;
  for (let y = H0; y < H0 + 8; y++) for (let x = 0; x < W; x++) if (g.renderer.buf[y * W + x] >>> 0 === (OBJ_COLORS.boss >>> 0)) bannerPx++;
  assert.equal(bannerPx, 0, 'banner gone while a message shows');
  let topPx = 0;
  for (let y = 5; y < 11; y++) for (let x = 0; x < W; x++) if (g.renderer.buf[y * W + x] >>> 0 === (OBJ_COLORS.boss >>> 0)) topPx++;
  assert.ok(topPx > 10, 'top compass survives the message');
});

test('HUD: red key card objective on E1M1 points the compass left-ish', () => {
  const g = makeGame();
  g.loadLevel(0);
  g.state = 'PLAY';
  g.message.t = 0;
  renderHud(g); // player faces east (ang 0), key is north-west
  assert.ok(cnt(g.renderer.buf, OBJ_COLORS.keyR) > 15);
  g.player.keyR = true;
  g.renderer.buf.fill(0);
  renderHud(g);
  assert.ok(cnt(g.renderer.buf, OBJ_COLORS.exit) > 15, 'now it chases the exit');
});

test('automap: objective diamond shows even with nothing explored', () => {
  const g = makeGame();
  g.loadLevel(2);
  g.state = 'PLAY';
  g.input.map = true;
  g.renderer.buf.fill(0);
  renderAutomap(g);
  assert.ok(cnt(g.renderer.buf, OBJ_COLORS.boss) >= 13, 'diamond drawn on the unexplored panel');
});

test('projectile pool recycles: 150 shots never exhaust the 32 slots', () => {
  const g = makeGame();
  g.loadLevel(2);
  g.state = 'PLAY';
  for (let volley = 0; volley < 30; volley++) {
    for (let i = 0; i < 5; i++) {
      const pr = g.projectiles.acquire();
      assert.ok(pr, 'slot available at volley ' + volley);
      const a = (i / 5) * Math.PI * 2;
      pr.x = g.player.x; pr.y = g.player.y;
      pr.vx = Math.cos(a) * 9; pr.vy = Math.sin(a) * 9;
      pr.kind = 'plasma'; pr.dmg = 0; pr.life = 1.0;
      pr.owner = 1; pr.splash = 0; pr.splashDmg = 0; pr.active = true;
    }
    let t = 0;
    while (g.projectiles.freeCount < 32 && t < 600) { g.player.hp = 1e5; g.tick(1 / 60); t++; }
    assert.equal(g.projectiles.freeCount, 32, 'all slots returned after volley ' + volley);
  }
});

test('exit marker reads as a door/arch, not a medkit cross', () => {
  const spr = buildItemSprites(null);
  const tab = spr.exit.tab;
  let nz = 0;
  for (const v of tab) if (v) nz++;
  assert.ok(nz > 200, `archy sprite has substance (n=${nz})`);
  const rim = ((0xff << 24) | (0x5a << 16) | (0xff << 8) | 0x3c) >>> 0; // #3cff5a
  const cross = ((0xff << 24) | (0x88 << 16) | (0xff << 8) | 0x7c) >>> 0; // #7cff88 (old medkit cross)
  assert.ok(cnt(tab, rim) > 40, 'bright green arch rim present');
  assert.ok(cnt(tab, cross) === 0, 'old bright cross is gone');
  // arch top: bright rim reaches into the top rows (the old ring never did)
  let top = 0;
  for (let y = 4; y < 12; y++) for (let x = 8; x < 24; x++) if (tab[y * 32 + x] >>> 0 === rim) top++;
  assert.ok(top > 12, `arch rim in the top rows (n=${top})`);
  // EXIT sign plate: dark plaque + bright text (E/X/I/T = 44 glyphs)
  const plate = ((0xff << 24) | (0x0e << 16) | (0x1c << 8) | 0x0c) >>> 0; // #0c1c0e
  const txt = ((0xff << 24) | (0x8e << 16) | (0xff << 8) | 0x7d) >>> 0; // #7dff8e
  assert.ok(cnt(tab, plate) > 40, 'sign plate present');
  assert.ok(cnt(tab, txt) >= 44, 'EXIT text rendered');
});
