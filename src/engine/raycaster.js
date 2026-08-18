// DDA raycaster over a solid-cell grid.
//
// Fisheye correction: every screen column casts from the SAME origin with a
// direction d = forward + c * right (camera-plane model, c in [-1,1]).
// Because dot(d, forward) == 1, the DDA ray parameter IS the perpendicular
// depth, so perspective is exact with no lateral stretching on edge columns.

const RAY_MAX_STEPS = 64;

/**
 * Cast one ray.
 * @param {number} px,py world origin
 * @param {number} rdx,rdy direction (any magnitude, see module note)
 * @param {Uint8Array} solid grid, gw*gh, 0 = open
 * @param {number} gw,gh grid size
 * @param {object} out receives {perp, side, cellX, cellY, hitId, texX}
 * @param {Uint8Array|null} [reveal] optional persistent mask OR-ed per visited cell
 * @returns {boolean} hit
 */
export function castRay(px, py, rdx, rdy, solid, gw, gh, out, reveal = null) {
  const EPS = 1e-9;
  let mapX = Math.floor(px + EPS);
  let mapY = Math.floor(py + EPS);
  const stepX = rdx < 0 ? -1 : 1;
  const stepY = rdy < 0 ? -1 : 1;
  let deltaDistX;
  let deltaDistY;
  let sideDistX;
  let sideDistY;
  if (rdx === 0) {
    deltaDistX = Infinity; sideDistX = Infinity;
  } else {
    deltaDistX = Math.abs(1 / rdx);
    sideDistX = (rdx < 0 ? px - mapX : mapX + 1 - px) * deltaDistX;
  }
  if (rdy === 0) {
    deltaDistY = Infinity; sideDistY = Infinity;
  } else {
    deltaDistY = Math.abs(1 / rdy);
    sideDistY = (rdy < 0 ? py - mapY : mapY + 1 - py) * deltaDistY;
  }
  let side = 0;
  const originIdx = mapY * gw + mapX;
  if (reveal) reveal[originIdx] = 1;
  if (solid[originIdx]) { // fired from inside a solid cell: instant hit
    out.perp = 0.02;
    out.side = 0;
    out.cellX = mapX;
    out.cellY = mapY;
    out.hitId = solid[originIdx];
    out.texX = 0;
    return true;
  }
  for (let i = 0; i < RAY_MAX_STEPS; i++) {
    if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
    else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
    const idx = mapY * gw + mapX;
    if (reveal) reveal[idx] = 1;
    if (!solid[idx]) continue;
    out.perp = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
    out.side = side;
    out.cellX = mapX;
    out.cellY = mapY;
    out.hitId = solid[idx];
    const wallX = side === 0 ? py + out.perp * rdy : px + out.perp * rdx;
    out.texX = wallX - Math.floor(wallX);
    return true;
  }
  out.perp = Infinity;
  out.hitId = 0;
  return false;
}

/**
 * Line-of-sight test between two world points.
 * The target cell is always open, so a wall hit closer than the target means
 * LOS is blocked; a hit exactly at / beyond the target means it is clear.
 */
export function hasLOS(px, py, tx, ty, solid, gw, gh, out) {
  const dx = tx - px;
  const dy = ty - py;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-10) return true;
  const d = Math.sqrt(d2);
  if (!castRay(px, py, dx / d, dy / d, solid, gw, gh, out)) return true;
  return out.perp > d - 0.08;
}

/** Distance to next solid cell along a direction (Infinity if none). */
export function rayDistance(px, py, rdx, rdy, solid, gw, gh, out) {
  if (!castRay(px, py, rdx, rdy, solid, gw, gh, out)) return Infinity;
  return out.perp;
}
