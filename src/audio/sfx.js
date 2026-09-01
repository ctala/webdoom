// WebAudio synth sfx (no binary assets). Guarded: every entry point no-ops
// without an AudioContext (node tests, headless shells). The context is
// created/resumed by main.js on the first user gesture (initAudio).

let actx = null;

export function getCtx() {
  return actx;
}

/** Create/resume the shared context on a user gesture. */
export function initAudio() {
  try {
    if (!actx && typeof window !== 'undefined') {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch (e) {
    actx = null;
  }
  return !!actx;
}

function tone(type, f0, f1, t0, dur, vol, out) {
  if (!actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f0), t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(Math.max(0.001, vol), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out || actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, vol, freq, t0 = 0, q = 1, out) {
  if (!actx) return;
  const n = Math.max(1, (actx.sampleRate * dur) | 0);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(Math.max(0.001, vol), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out || actx.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

const T = 0.001;

/**
 * Positional routing: distance attenuation + stereo pan from the player's
 * frame (left = -1, right = +1; -sin(rel) because +y is the player's left).
 * Pure — testable without an AudioContext.
 */
export function panInfo(p, x, y) {
  if (!p) return { v: 1, pan: 0 };
  const dx = x - p.x, dy = y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return { v: 1, pan: 0 };
  let rel = Math.atan2(dy, dx) - p.ang;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return {
    v: Math.max(0.15, 1 / (1 + dist * 0.12)),
    pan: Math.max(-1, Math.min(1, -Math.sin(rel) * Math.min(1, dist * 0.5) * 0.9)),
  };
}

// Every entry receives t0 = actx.currentTime (+epsilon) so nodes are
// scheduled relative to the clock that is actually running. Scheduling on a
// fixed absolute time (0.001) lands in the past once the context has been
// running for a while, and WebAudio drops those nodes silently.
// The bank receives (t0, out): out is destination or a gain->panner chain.
export const SFX_BANK = {
  pistol: (t0, out) => { noise(0.10, 0.5, 2600, t0, 1, out); tone('square', 160, 50, t0, 0.10, 0.25, out); },
  shotgun: (t0, out) => { noise(0.22, 0.7, 1400, t0, 1, out); tone('square', 110, 35, t0, 0.22, 0.4, out); },
  plasma: (t0, out) => { tone('sawtooth', 980, 240, t0, 0.16, 0.22, out); tone('sine', 1400, 500, t0, 0.09, 0.12, out); },
  chaingun: (t0, out) => { noise(0.05, 0.45, 2200, t0, 1, out); tone('square', 200, 60, t0, 0.05, 0.2, out); },
  rocket: (t0, out) => { noise(0.35, 0.5, 900, t0, 1, out); tone('sawtooth', 220, 80, t0, 0.35, 0.3, out); },
  spawn: (t0, out) => { noise(0.18, 0.4, 700, t0, 1, out); tone('sine', 180, 90, t0, 0.18, 0.25, out); },
  boom: (t0, out) => { noise(0.6, 0.8, 500, t0, 1, out); tone('sawtooth', 120, 30, t0, 0.55, 0.5, out); tone('square', 60, 25, t0 + 0.03, 0.3, 0.4, out); },
  punch: (t0, out) => { noise(0.07, 0.4, 500, t0, 1, out); tone('sine', 90, 45, t0, 0.08, 0.3, out); },
  hit: (t0, out) => { tone('sawtooth', 300, 140, t0, 0.12, 0.2, out); noise(0.06, 0.3, 900, t0, 1, out); },
  hurt: (t0, out) => { tone('square', 130, 60, t0, 0.18, 0.35, out); },
  edead: (t0, out) => { tone('sawtooth', 220, 40, t0, 0.5, 0.3, out); noise(0.3, 0.25, 700, t0, 1, out); },
  eshoot: (t0, out) => { tone('sawtooth', 500, 180, t0, 0.25, 0.12, out); },
  switch: (t0, out) => { tone('square', 700, 500, t0, 0.05, 0.15, out); tone('square', 900, 700, t0 + 0.07, 0.05, 0.15, out); },
  door: (t0, out) => { noise(0.5, 0.4, 300, t0, 1, out); },
  pickup: (t0, out) => { tone('sine', 660, 990, t0, 0.12, 0.2, out); },
  denied: (t0, out) => { tone('square', 110, 70, t0, 0.16, 0.3, out); },
  complete: (t0, out) => { tone('sine', 520, 780, t0, 0.12, 0.25, out); tone('sine', 780, 1170, t0 + 0.13, 0.18, 0.25, out); },
  enrage: (t0, out) => { tone('sawtooth', 90, 230, t0, 0.5, 0.3, out); noise(0.4, 0.2, 500, t0, 1, out); },
  bossdie: (t0, out) => { tone('sawtooth', 300, 38, t0, 1.1, 0.4, out); noise(0.9, 0.3, 700, t0, 1, out); },
};

/** Play one sfx by name; silent when no running context exists. */
export function playSfx(name, x, y, listener) {
  const f = SFX_BANK[name];
  if (!f || !actx || actx.state !== 'running') return;
  const t0 = actx.currentTime + 0.01;
  if (listener && x !== undefined) {
    const { v, pan } = panInfo(listener, x, y);
    const g = actx.createGain();
    g.gain.value = v;
    g.connect(actx.destination);
    if (pan !== 0 && actx.createStereoPanner) {
      const p2 = actx.createStereoPanner();
      p2.pan.value = pan;
      p2.connect(g);
      f(t0, p2);
    } else {
      f(t0, g);
    }
    return;
  }
  f(t0, actx.destination);
}
