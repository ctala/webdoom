// Player state + input-driven movement (pure; DOM-free).
// Movement: forward/strafe rotated by player angle; circle-vs-grid sliding.

import { moveCircle } from '../engine/collision.js';

const R = 0.3;
const WALK = 2.7;
const RUN = 4.9;
const _mv = new Float64Array(2);

export function createPlayer(x, y, ang = 0) {
  return {
    x, y, ang,
    hp: 100, armor: 0,
    ammoP: 50, ammoS: 8, ammoPl: 20,
    weapon: 2, // 1 fists, 2 pistol, 3 shotgun, 4 plasma
    keyR: false, keyB: false,
    bob: 0, moved: false, running: false,
    faceHurt: 0, faceDir: 0, // HUD face: hurt level 0..3, dir -1..1
    flash: 0, // muzzle flash light 0..1 (decays in game tick)
  };
}

/**
 * @param {object} p player
 * @param {object} input { up, down, left, right, run }
 * @param {Uint8Array} view merged solid grid
 * @param {object} map {gw, gh}
 * @returns {boolean} true if the player was blocked on either axis
 */
export function updatePlayer(p, input, dt, view, map) {
  const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.moved = f !== 0 || s !== 0;
  p.running = p.moved && input.run;
  if (!p.moved) return false;
  const ca = Math.cos(p.ang);
  const sa = Math.sin(p.ang);
  const sp = (input.run ? RUN : WALK) * dt;
  // forward = (ca, sa); strafe right = right vector (sa, -ca)
  const dx = (f * ca + s * sa) * sp;
  const dy = (f * sa - s * ca) * sp;
  const blocked = moveCircle(p.x, p.y, R, dx, dy, view, map.gw, map.gh, _mv);
  p.x = _mv[0];
  p.y = _mv[1];
  p.bob += dt * (input.run ? 11 : 7);
  return blocked;
}
