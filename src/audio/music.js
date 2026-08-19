// Generative background loop: doom bass line + off-beat arp, scheduled with
// the AudioContext clock (lookahead timer). No assets, no node usage.
// Starts after the first user gesture (sfx.initAudio must have run).

import { getCtx } from './sfx.js';

const STEP = 0.21; // eighth note @ ~142 bpm
const E1 = 41.2, Eb2 = 61.7, F1 = 43.7, G1 = 49.0, A1 = 55.0, Bb1 = 58.3;
const BASS = [E1, E1, Bb1, G1, F1, F1, A1, G1];
const ARP = [
  164.8, 196.0, 246.9, 196.0, // E minor
  164.8, 196.0, 246.9, 220.0,
  174.6, 220.0, 261.6, 220.0, // F
  155.6, 196.0, 233.1, 196.0, // E
];

let timer = null;
let step = 0;
let nextT = 0;

function schedule(t0, stepIdx, dur) {
  const actx = getCtx();
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'triangle';
  o.frequency.value = BASS[stepIdx];
  g.gain.setValueAtTime(0.16, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
  // sparse off-beat arp
  if (stepIdx % 2 === 1) {
    const o2 = actx.createOscillator();
    const g2 = actx.createGain();
    o2.type = 'square';
    o2.frequency.value = ARP[stepIdx];
    g2.gain.setValueAtTime(0.035, t0);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + STEP * 0.8);
    o2.connect(g2).connect(actx.destination);
    o2.start(t0);
    o2.stop(t0 + STEP);
  }
}

/** Start the loop (idempotent; no-op without a running context). */
export function startMusic() {
  const actx = getCtx();
  if (timer || !actx || actx.state !== 'running') return;
  step = 0;
  nextT = actx.currentTime + 0.1;
  timer = setInterval(() => {
    const a = getCtx();
    if (!a || a.state !== 'running') return;
    while (nextT < a.currentTime + 0.35) {
      schedule(nextT, step, STEP * 0.9);
      nextT += STEP;
      step = (step + 1) & 7;
    }
  }, 120);
}

export function stopMusic() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
