// Camera projection helpers (pure).
//
// Convention: forward f = (cosA, sinA); the camera's right vector is
// r = f rotated -90deg = (sinA, -cosA). Screen center is W/2; a point with
// lateral L and perpendicular depth t projects to
//   screenX = W/2 + (L / (M * t)) * (W/2),   M = tan(fov/2)
// which matches the DDA raycaster columns exactly (see raycaster.js).

/** Perpendicular depth of world point (wx,wy) from camera (px,py,cosA,sinA). Negative if behind. */
export function camDepth(px, py, cosA, sinA, wx, wy) {
  return (wx - px) * cosA + (wy - py) * sinA;
}

/**
 * Project a world point to screen.
 * out[0] = screenX (float, may be off-screen), out[1] = perpendicular depth.
 * @returns depth (negative -> behind camera, caller must cull)
 */
export function projectPoint(px, py, cosA, sinA, M, W, wx, wy, out) {
  const rx = wx - px;
  const ry = wy - py;
  const t = rx * cosA + ry * sinA;
  const L = rx * sinA - ry * cosA;
  out[1] = t;
  if (t <= 0.0001) { out[0] = -1e9; return t; }
  out[0] = W * 0.5 + (L / (M * t)) * W * 0.5;
  return t;
}

/**
 * Screen-space scale for a sprite of world height wh at depth t.
 * one world unit vertically == (H/2)/t pixels (see renderer wall math).
 */
export function spriteScale(H, t, wh) {
  return (H / (2 * t)) * wh;
}
