// Enemy AI finite state machine (pure — testable without a browser).
//
// ev = { sees, hears, inRange, hurt, dead, painDone, targetLost }
//   sees      : has line of sight to the player (within sight range)
//   hears     : heard a sound event this tick
//   inRange   : within this enemy's attack range
//   hurt      : took damage this tick
//   dead      : hp <= 0
//   painDone  : pain animation finished
//   targetLost: A* failed and no path remains
export const ST = {
  SLEEP: 0,
  ALERT: 1,
  CHASE: 2,
  ATTACK: 3,
  PAIN: 4,
  DEATH: 5,
  CORPSE: 6,
};

export function enemyNextState(cur, ev) {
  if (ev.dead) return ST.DEATH;
  switch (cur) {
    case ST.SLEEP:
      return ev.sees || ev.hears ? ST.ALERT : ST.SLEEP;
    case ST.ALERT:
      if (ev.hurt) return ST.PAIN;
      return ev.sees && ev.inRange ? ST.ATTACK : ST.CHASE;
    case ST.CHASE:
      if (ev.hurt) return ST.PAIN;
      if (ev.targetLost) return ST.SLEEP;
      if (ev.sees && ev.inRange) return ST.ATTACK;
      return ST.CHASE;
    case ST.ATTACK:
      if (ev.hurt) return ST.PAIN;
      if (!ev.sees || !ev.inRange) return ST.CHASE;
      return ST.ATTACK;
    case ST.PAIN:
      if (ev.hurt) return ST.PAIN;
      if (ev.painDone) return ev.sees && ev.inRange ? ST.ATTACK : ST.CHASE;
      return ST.PAIN;
    case ST.DEATH:
      return ST.DEATH;
    case ST.CORPSE:
      return ST.CORPSE;
    default:
      return ST.SLEEP;
  }
}

export const STATE_NAMES = ['SLEEP', 'ALERT', 'CHASE', 'ATTACK', 'PAIN', 'DEATH', 'CORPSE'];
