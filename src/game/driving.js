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

// Distance from `from` forward to `to` on a looping track.
export function forwardGap(from, to, trackLength) {
  let d = (to - from) % trackLength;
  if (d < 0) d += trackLength;
  return d > trackLength / 2 ? d - trackLength : d;
}

// Nearest car ahead of `car` that is close enough, and lined up closely enough,
// to be in the way. Shared by the rival AI and the model driver — anyone
// competent enough to be racing avoids traffic rather than driving into it.
export function findObstacle(car, field, track) {
  const range = TUNE.RIVAL_AVOID_RANGE * TUNE.SEGMENT_LEN;
  let best = null;
  for (const other of field) {
    if (other === car) continue;
    const gap = forwardGap(car.trackPos, other.trackPos, track.trackLength);
    if (gap <= 0 || gap > range) continue;
    if (Math.abs(car.x - other.x) > TUNE.RIVAL_AVOID_WIDTH) continue;
    if (!best || gap < best.gap) {
      best = { other, gap, dx: car.x - other.x, gapSegments: gap / TUNE.SEGMENT_LEN };
    }
  }
  return best;
}

// Nearest car close behind, for blocking (and for knowing you're under attack).
export function findChaser(car, field, track, rangeSegments = 14) {
  const range = rangeSegments * TUNE.SEGMENT_LEN;
  let best = null;
  for (const other of field) {
    if (other === car) continue;
    const gap = forwardGap(other.trackPos, car.trackPos, track.trackLength);
    if (gap <= 0 || gap > range) continue;
    if (!best || gap < best.gap) best = { other, gap };
  }
  return best ? best.other : null;
}

// Choose a line across the road: the widest gap through the traffic ahead that
// isn't too far off the line you actually want.
//
// Picking "the far side of the nearest car" is not enough. In a queue it dodges
// car A straight into car B, and cars end up grinding down the road together —
// which is how a competent driver was picking up 24 contacts and an 82%-wrecked
// car in a three-lap race.
//
// Returns { target, blocked }: blocked means there is no gap to take, so lift.
export function pickLine(car, field, track, preferred) {
  const range = TUNE.RIVAL_AVOID_RANGE * TUNE.SEGMENT_LEN;
  const nearby = [];
  for (const other of field) {
    if (other === car) continue;
    const gap = forwardGap(car.trackPos, other.trackPos, track.trackLength);
    if (gap > 0 && gap < range) nearby.push({ x: other.x, gap });
  }
  if (!nearby.length) return { target: preferred, blocked: false };

  const need = TUNE.CAR_WIDTH * 1.25;   // clearance that counts as a clean gap
  let best = null;
  for (let cand = -0.92; cand <= 0.92; cand += 0.08) {
    let clearance = Infinity;
    for (const n of nearby) {
      // Cars further ahead matter less — there's time to move again.
      const urgency = 1 - Math.min(n.gap / range, 1) * 0.55;
      clearance = Math.min(clearance, Math.abs(cand - n.x) / urgency);
    }
    const score = Math.min(clearance, need) - Math.abs(cand - preferred) * TUNE.LINE_PREFERENCE_WEIGHT;
    if (!best || score > best.score) best = { cand, score, clearance };
  }

  return { target: clamp(best.cand, -0.95, 0.95), blocked: best.clearance < need * 0.62 };
}

// Lining up for the pit entry: get across to the lane and slow to the limit.
// Returns null when the pits aren't in reach yet, so the caller keeps racing.
//
// Shared by the rival AI and the model driver — "stop before the tank is empty"
// is driving knowledge like any other, and a driver that ignores it just parks
// on the circuit.
export function pitApproachInput(car, track, base) {
  const toLine = forwardGap(car.trackPos, track.pit.entryZ, track.trackLength);
  const approaching = toLine >= 0 && toLine < TUNE.PIT_APPROACH_SEGMENTS * TUNE.SEGMENT_LEN;
  if (!approaching && !track.inPitWindow(car.trackPos)) return null;

  const targetX = (track.pit.xInner + track.pit.xOuter) / 2;
  const overLimit = car.speed > car.maxSpeed * TUNE.PIT_SPEED_LIMIT * 1.25;
  return {
    ...base,
    steer: clamp((targetX - car.x) * TUNE.RIVAL_STEER_GAIN, -1, 1),
    throttle: Math.min(base.throttle, 0.25),
    brake: overLimit ? 0.7 : 0,
    nitro: false,
  };
}

// A competent driver: brakes for what's coming, feeds throttle back in, and
// steers toward the racing line while fighting the push. Deliberately not
// superhuman — it's here to prove a corner is learnable, not to set records.
export class ModelDriver {
  constructor(track, { margin = 0.92, lookahead = 34, aggression = 1,
    pitAt = TUNE.MODEL_PIT_FUEL, managesFuel = true } = {}) {
    this.track = track;
    this.margin = margin;         // fraction of the holdable speed it aims for
    this.lookahead = lookahead;   // segments
    this.aggression = aggression;
    this.pitAt = pitAt;           // fuel fraction at which it commits to a stop
    this.managesFuel = managesFuel;
    this.wantsPit = false;
  }

  // Returns an input object shaped like core/input.js produces.
  // `field` is optional; pass every car in the race and the driver will avoid
  // traffic instead of driving through it.
  drive(car, field = null) {
    const ahead = lookaheadCurve(this.track, car.trackPos, this.lookahead);
    const limit = holdableSpeedPct(ahead, car.grip, car.centrifugalScale)
      * this.margin * this.aggression;
    const pct = car.speed / car.maxSpeed;

    let throttle = 0, brake = 0;
    if (pct < limit - 0.02) throttle = 1;
    else if (pct > limit + 0.03) brake = Math.min(1, (pct - limit) * 6);

    // Steer toward the line, then add whatever's needed to resist the push.
    const curveNow = this.track.curveAt(car.trackPos);
    let target = racingLine(curveNow);

    if (field) {
      const line = pickLine(car, field, this.track, target);
      target = line.target;
      // No gap to take: back off rather than shunt them. A competent driver
      // doesn't use the car in front as a brake.
      const obstacle = findObstacle(car, field, this.track);
      if (line.blocked && obstacle && obstacle.gapSegments < 10) {
        throttle = Math.min(throttle, 0.25);
        brake = Math.max(brake, 0.35);
      }
    }

    let steer = clamp((target - car.x) * TUNE.RIVAL_STEER_GAIN, -1, 1);
    if (Math.abs(curveNow) > 0.2) {
      steer = clamp(steer + Math.sign(curveNow) * Math.min(1, Math.abs(curveNow) / 4), -1, 1);
    }

    const base = { steer, throttle, brake, nitro: false, shiftUp: false, shiftDown: false };

    // Fuel strategy last, so it overrides the racing line when the tank is low.
    if (this.managesFuel && car.fuelBurnPerUnit > 0) {
      if (car.fuelFraction > 0.9) this.wantsPit = false;      // just been filled
      else if (car.fuelFraction < this.pitAt) this.wantsPit = true;
      if (this.wantsPit) {
        const pit = pitApproachInput(car, this.track, base);
        if (pit) return pit;
      }
    }

    return base;
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
