// Shared driving knowledge: how fast a corner can be taken, and where the
// racing line is. Used by the rival AI (M2) and by the headless driver that
// verifies the CENTRIFUGAL tuning (M1).

import { TUNE } from '../tune.js';

// Peak |curve| in the next `lookahead` segments, signed by the dominant
// direction. This is what a driver "sees" coming.
export function lookaheadCurve(track, z, lookahead = 30) {
  const segs = track.segments;
  const N = segs.length;
  const start = track.findIndex(z);
  let worst = 0;
  for (let n = 0; n < lookahead; n++) {
    const c = segs[(start + n) % N].curve;
    if (Math.abs(c) > Math.abs(worst)) worst = c;
  }
  return worst;
}

// The fastest speed (as a fraction of maxSpeed) at which centrifugal push can
// still be met by opposite lock. Above this, the corner throws you out no
// matter how well you steer — which is the whole point of the corner.
//
// Solved by bisection because the steering-authority term is itself a function
// of speed; there's no tidy closed form and this runs once per rival per corner.
export function holdableSpeedPct(curve, grip, centrifugalScale = 1) {
  const c = Math.abs(curve);
  if (c < 1e-6) return 1;

  const push = pct => TUNE.CENTRIFUGAL * centrifugalScale * pct * pct * c / grip;
  const counter = pct => TUNE.STEER_RATE
    * Math.max(1 - pct * TUNE.STEER_SPEED_FALLOFF, 0.15)
    * (TUNE.STEER_GRIP_FLOOR + (1 - TUNE.STEER_GRIP_FLOOR) * grip);

  if (push(1) <= counter(1)) return 1;   // flat out is fine here

  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (push(mid) <= counter(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// Where a car should be placed across the road for a given curve: outside on
// entry, apexing in. Section 4.
export function racingLine(curve) {
  return clamp(-curve * 0.35, -0.9, 0.9);
}

// A competent driver: brakes for what's coming, feeds throttle back in, and
// steers toward the racing line while fighting the push. Deliberately not
// superhuman — it's here to prove a corner is learnable, not to set records.
export class ModelDriver {
  constructor(track, { margin = 0.92, lookahead = 34, aggression = 1 } = {}) {
    this.track = track;
    this.margin = margin;         // fraction of the holdable speed it aims for
    this.lookahead = lookahead;   // segments
    this.aggression = aggression;
  }

  // Returns an input object shaped like core/input.js produces.
  drive(car) {
    const ahead = lookaheadCurve(this.track, car.trackPos, this.lookahead);
    const limit = holdableSpeedPct(ahead, car.grip, car.centrifugalScale)
      * this.margin * this.aggression;
    const pct = car.speed / car.maxSpeed;

    let throttle = 0, brake = 0;
    if (pct < limit - 0.02) throttle = 1;
    else if (pct > limit + 0.03) brake = Math.min(1, (pct - limit) * 6);

    // Steer toward the line, then add whatever's needed to resist the push.
    const curveNow = this.track.curveAt(car.trackPos);
    const target = racingLine(curveNow);
    let steer = clamp((target - car.x) * 2.4, -1, 1);
    if (Math.abs(curveNow) > 0.2) {
      steer = clamp(steer + Math.sign(curveNow) * Math.min(1, Math.abs(curveNow) / 4), -1, 1);
    }

    return { steer, throttle, brake, nitro: false, shiftUp: false, shiftDown: false };
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
