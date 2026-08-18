// Circle-vs-grid collision: per-axis sliding with fixed 0.2 substeps.
// Each substep is < the radius, so a circle can never skip over a wall face
// (no tunneling at any speed) — the classic Doom stepping approach.

const STEP = 0.2;
const MAX_SUBSTEPS = 24;

// 1e-9 guards against float wobble at exact boundaries (2.3-0.3 = 1.9999...)
const EPS = 1e-9;

function blockedAt(x, y, r, solid, gw, gh) {
  const x0 = Math.floor(x - r + EPS);
  const x1 = Math.floor(x + r - EPS);
  const y0 = Math.floor(y - r + EPS);
  const y1 = Math.floor(y + r - EPS);
  if (x0 < 0 || y0 < 0 || x1 >= gw || y1 >= gh) return true;
  for (let cy = y0; cy <= y1; cy++) {
    const row = cy * gw;
    for (let cx = x0; cx <= x1; cx++) {
      if (!solid[row + cx]) continue;
      const nx = x < cx ? cx : (x > cx + 1 ? cx + 1 : x);
      const ny = y < cy ? cy : (y > cy + 1 ? cy + 1 : y);
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

/**
 * Move a circle from (x, y) by (dx, dy), sliding along walls.
 * X axis resolves first (using the original y), then Y (using the new x).
 * Writes the result to out[0], out[1].
 * @returns {boolean} true if either axis was blocked
 */
export function moveCircle(x, y, r, dx, dy, solid, gw, gh, out) {
  let blocked = false;
  if (dx !== 0) {
    const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.abs(dx) / STEP)));
    const t = dx / n;
    let px = x;
    for (let i = 0; i < n; i++) {
      if (!blockedAt(px + t, y, r, solid, gw, gh)) px += t;
      else { blocked = true; break; }
    }
    out[0] = px;
  } else {
    out[0] = x;
  }
  if (dy !== 0) {
    const cx = out[0];
    const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.abs(dy) / STEP)));
    const t = dy / n;
    let py = y;
    for (let i = 0; i < n; i++) {
      if (!blockedAt(cx, py + t, r, solid, gw, gh)) py += t;
      else { blocked = true; break; }
    }
    out[1] = py;
  } else {
    out[1] = y;
  }
  return blocked;
}

/** Can a circle be placed at (x,y)? */
export function pointBlocked(x, y, r, solid, gw, gh) {
  return blockedAt(x, y, r, solid, gw, gh);
}
