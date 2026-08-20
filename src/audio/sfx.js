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

function tone(type, f0, f1, t0, dur, vol) {
  if (!actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f0), t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(Math.max(0.001, vol), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, vol, freq, t0 = 0, q = 1) {
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
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

const T = 0.001;

// Every entry receives t0 = actx.currentTime (+epsilon) so nodes are
// scheduled relative to the clock that is actually running. Scheduling on a
// fixed absolute time (0.001) lands in the past once the context has been
// running for a while, and WebAudio drops those nodes silently.
export const SFX_BANK = {
  pistol: (t0) => { noise(0.10, 0.5, 2600, t0); tone('square', 160, 50, t0, 0.10, 0.25); },
  shotgun: (t0) => { noise(0.22, 0.7, 1400, t0); tone('square', 110, 35, t0, 0.22, 0.4); },
  plasma: (t0) => { tone('sawtooth', 980, 240, t0, 0.16, 0.22); tone('sine', 1400, 500, t0, 0.09, 0.12); },
  punch: (t0) => { noise(0.07, 0.4, 500, t0); tone('sine', 90, 45, t0, 0.08, 0.3); },
  hit: (t0) => { tone('sawtooth', 300, 140, t0, 0.12, 0.2); noise(0.06, 0.3, 900, t0); },
  hurt: (t0) => { tone('square', 130, 60, t0, 0.18, 0.35); },
  edead: (t0) => { tone('sawtooth', 220, 40, t0, 0.5, 0.3); noise(0.3, 0.25, 700, t0); },
  eshoot: (t0) => { tone('sawtooth', 500, 180, t0, 0.25, 0.12); },
  switch: (t0) => { tone('square', 700, 500, t0, 0.05, 0.15); tone('square', 900, 700, t0 + 0.07, 0.05, 0.15); },
  door: (t0) => { noise(0.5, 0.4, 300, t0); },
  pickup: (t0) => { tone('sine', 660, 990, t0, 0.12, 0.2); },
  denied: (t0) => { tone('square', 110, 70, t0, 0.16, 0.3); },
  complete: (t0) => { tone('sine', 520, 780, t0, 0.12, 0.25); tone('sine', 780, 1170, t0 + 0.13, 0.18, 0.25); },
  enrage: (t0) => { tone('sawtooth', 90, 230, t0, 0.5, 0.3); noise(0.4, 0.2, 500, t0); },
  bossdie: (t0) => { tone('sawtooth', 300, 38, t0, 1.1, 0.4); noise(0.9, 0.3, 700, t0); },
};

/** Play one sfx by name; silent when no running context exists. */
export function playSfx(name) {
  const f = SFX_BANK[name];
  if (!f || !actx || actx.state !== 'running') return;
  f(actx.currentTime + 0.01);
}
