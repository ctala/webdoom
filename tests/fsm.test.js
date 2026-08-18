import test from 'node:test';
import assert from 'node:assert/strict';
import { ST, enemyNextState } from '../src/engine/fsm.js';

const base = () => ({
  sees: false, hears: false, inRange: false, hurt: false,
  dead: false, painDone: false, targetLost: false,
});
const ev = (o = {}) => ({ ...base(), ...o });

test('SLEEP: stays asleep unless seen/heard/killed', () => {
  assert.equal(enemyNextState(ST.SLEEP, ev()), ST.SLEEP);
  assert.equal(enemyNextState(ST.SLEEP, ev({ sees: true })), ST.ALERT);
  assert.equal(enemyNextState(ST.SLEEP, ev({ hears: true })), ST.ALERT);
  assert.equal(enemyNextState(ST.SLEEP, ev({ dead: true })), ST.DEATH);
});

test('ALERT: attacks in range with sight, chases otherwise, pain on hurt', () => {
  assert.equal(enemyNextState(ST.ALERT, ev({ sees: true, inRange: true })), ST.ATTACK);
  assert.equal(enemyNextState(ST.ALERT, ev({ sees: true })), ST.CHASE);
  assert.equal(enemyNextState(ST.ALERT, ev()), ST.CHASE);
  assert.equal(enemyNextState(ST.ALERT, ev({ hurt: true })), ST.PAIN);
  assert.equal(enemyNextState(ST.ALERT, ev({ dead: true })), ST.DEATH);
});

test('CHASE: attacks when sight+range, chases on sight only, sleeps if path lost', () => {
  assert.equal(enemyNextState(ST.CHASE, ev({ sees: true, inRange: true })), ST.ATTACK);
  assert.equal(enemyNextState(ST.CHASE, ev({ sees: true })), ST.CHASE);
  assert.equal(enemyNextState(ST.CHASE, ev()), ST.CHASE);
  assert.equal(enemyNextState(ST.CHASE, ev({ hurts: true, hurt: true })), ST.PAIN);
  assert.equal(enemyNextState(ST.CHASE, ev({ targetLost: true })), ST.SLEEP);
});

test('ATTACK: drops to CHASE without sight/range, PAIN on hurt', () => {
  assert.equal(enemyNextState(ST.ATTACK, ev({ sees: true, inRange: true })), ST.ATTACK);
  assert.equal(enemyNextState(ST.ATTACK, ev({ sees: true })), ST.CHASE);
  assert.equal(enemyNextState(ST.ATTACK, ev({ inRange: true })), ST.CHASE);
  assert.equal(enemyNextState(ST.ATTACK, ev({ hurt: true, sees: true, inRange: true })), ST.PAIN);
});

test('PAIN: transitions only when done (or re-hit), then ATTACK/CHASE', () => {
  assert.equal(enemyNextState(ST.PAIN, ev()), ST.PAIN);
  assert.equal(enemyNextState(ST.PAIN, ev({ hurt: true })), ST.PAIN);
  assert.equal(enemyNextState(ST.PAIN, ev({ painDone: true, sees: true, inRange: true })), ST.ATTACK);
  assert.equal(enemyNextState(ST.PAIN, ev({ painDone: true })), ST.CHASE);
  assert.equal(enemyNextState(ST.PAIN, ev({ painDone: true, dead: true })), ST.DEATH);
});

test('DEATH and CORPSE are terminal', () => {
  assert.equal(enemyNextState(ST.DEATH, ev({ sees: true, hears: true, dead: false })), ST.DEATH);
  assert.equal(enemyNextState(ST.DEATH, ev({ sees: true, dead: true })), ST.DEATH);
  assert.equal(enemyNextState(ST.CORPSE, ev({ sees: true })), ST.CORPSE);
});

test('full state space is closed (every state+event combo terminates)', () => {
  for (let s = 0; s <= 6; s++) {
    for (const o of [{}, { sees: true }, { inRange: true }, { hurt: true }, { dead: true }, { painDone: true }, { targetLost: true }, { sees: true, inRange: true, hurt: true, painDone: true }]) {
      const next = enemyNextState(s, ev(o));
      assert.ok(next >= ST.SLEEP && next <= ST.CORPSE, `s=${s} out=${JSON.stringify(o)}`);
    }
  }
});
