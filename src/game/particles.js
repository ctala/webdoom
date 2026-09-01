// Blood particles: pooled, world-space (x,y plane + z relative to the eye,
// floor at z=-1), gravity, projected to screen and depth-tested per pixel
// against the wall buffer. Draws after world sprites (never occludes walls).

import { Pool } from '../engine/pool.js';

export const BLOOD_MAX = 128;
const GRAV = 7.5;
export const BLOOD_COLORS = [
  (0xff << 24) | (0x0a << 16) | (0x12 << 8) | 0x8c, // dark red
  (0xff << 24) | (0x14 << 16) | (0x18 << 8) | 0xa0, // bright clots
];

/** Deterministic LCG (game.rng is re-seeded per level load). */
export function nextRand(game) {
  game.rng = (Math.imul(game.rng | 0, 1103515245) + 12345) | 0;
  return ((game.rng >>> 8) & 0xffffff) / 16777216;
}

export function makeBlood(game) {
  game.particles = new Pool(
    BLOOD_MAX,
    () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 })
  );
}

/** Burst of n clots from (x,y) spreading around dirAng, thrown up. */
export function spawnBlood(game, x, y, n, dirAng, power = 3.5) {
  for (let i = 0; i < n; i++) {
    const q = game.particles.acquire();
    if (!q) return;
    const a = dirAng + (nextRand(game) - 0.5) * 1.9;
    const sp = power * (0.35 + nextRand(game) * 0.9);
    q.x = x; q.y = y; q.z = -0.18 + nextRand(game) * 0.34;
    q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp;
    q.vz = 0.6 + nextRand(game) * 1.6;
    q.life = 0.35 + nextRand(game) * 0.55;
    q.active = true;
  }
}

export function updateParticles(game, dt) {
  const pool = game.particles;
  pool.each((q) => {
    if (!q.active) return;
    const dead = () => { q.active = false; pool.release(q); };
    q.life -= dt;
    if (q.life <= 0) { dead(); return; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vz -= GRAV * dt;
    q.z += q.vz * dt;
    if (q.z <= -1.02) dead();
  });
}

export function renderParticles(game) {
  const { W, H } = game;
  const buf = game.renderer.buf;
  const depth = game.renderer.depth;
  const p = game.player;
  const vAng = game.vAng !== undefined ? game.vAng : p.ang;
  const cosA = Math.cos(vAng);
  const sinA = Math.sin(vAng);
  const jy = game.vJy || 0;
  const M = game.assets.M;
  game.particles.each((q) => {
    if (!q.active) return;
    const rx = q.x - p.x, ry = q.y - p.y;
    const d = rx * cosA + ry * sinA;
    if (d < 0.15) return;
    const L = rx * sinA - ry * cosA;
    const sx = (W * 0.5 + (L / (M * d)) * W * 0.5) | 0;
    if (sx < 0 || sx >= W) return;
    const sy = (H * 0.5 + jy - q.z * (H / (2 * d))) | 0;
    if (sy < 0 || sy >= H) return;
    if (depth[sx] <= d + 1e-4) return; // behind a wall
    const c = BLOOD_COLORS[q._poolIdx & 1];
    buf[sy * W + sx] = c;
    if (d < 3 && sy + 1 < H) buf[(sy + 1) * W + sx] = c;
  });
}
