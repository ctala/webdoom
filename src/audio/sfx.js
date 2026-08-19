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

export const SFX_BANK = {
  pistol: () => { noise(0.10, 0.5, 2600); tone('square', 160, 50, T, 0.10, 0.25); },
  shotgun: () => { noise(0.22, 0.7, 1400); tone('square', 110, 35, T, 0.22, 0.4); },
  plasma: () => { tone('sawtooth', 980, 240, T, 0.16, 0.22); tone('sine', 1400, 500, T, 0.09, 0.12); },
  punch: () => { noise(0.07, 0.4, 500); tone('sine', 90, 45, T, 0.08, 0.3); },
  hit: () => { tone('sawtooth', 300, 140, T, 0.12, 0.2); noise(0.06, 0.3, 900); },
  hurt: () => { tone('square', 130, 60, T, 0.18, 0.35); },
  edead: () => { tone('sawtooth', 220, 40, T, 0.5, 0.3); noise(0.3, 0.25, 700); },
  eshoot: () => { tone('sawtooth', 500, 180, T, 0.25, 0.12); },
  switch: () => { tone('square', 700, 500, T, 0.05, 0.15); tone('square', 900, 700, T + 0.07, 0.05, 0.15); },
  door: () => { noise(0.5, 0.4, 300); },
  pickup: () => { tone('sine', 660, 990, T, 0.12, 0.2); },
};

/** Play one sfx by name; silent when no running context exists. */
export function playSfx(name) {
  const f = SFX_BANK[name];
  if (f && actx && actx.state === 'running') f();
}
