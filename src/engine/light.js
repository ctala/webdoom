// Distance-fogged lighting (Doom style): brightness 0..31 for shade tables.
// Side-lit (E/W) walls additionally use the second half of the 64-level
// table built by the asset code (levels 32..63 = dimmer).

export const FOG_DIST = 13.0;
export const MIN_LIGHT = 0.055;
export const SHADES = 32;

/**
 * @param {number} d perpendicular distance
 * @param {number} flash muzzle-flash boost 0..1
 * @param {boolean} sideDim true for E/W walls (extra 28% darkening)
 * @returns 0..31 brightness level
 */
export function lightLevel(d, flash = 0, sideDim = false) {
  let v = 1 - d / FOG_DIST;
  if (v < MIN_LIGHT) v = MIN_LIGHT;
  if (v > 1) v = 1;
  let l = Math.pow(v, 1.25) * (SHADES - 1);
  if (sideDim) l *= 0.72;
  l += flash * 26;
  l |= 0;
  if (l < 0) l = 0;
  if (l > SHADES - 1) l = SHADES - 1;
  return l;
}

/** Damage falloff over distance (1 at 0, 0.3 at maxRange). */
export function damageFalloff(dist, maxRange) {
  if (dist <= 0.4) return 1;
  if (dist >= maxRange) return 0.3;
  const t = (dist - 0.4) / (maxRange - 0.4);
  return 1 - 0.7 * t;
}
