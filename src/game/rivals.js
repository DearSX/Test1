// Rival AI. Section 4.
//
// Rivals are not sprites moving relative to the player — each one is a full
// PlayerCar running the same physics on the same track, driven by an input
// stream instead of a keyboard. That is what makes positions real: a rival that
// overcooks the hairpin runs wide and loses places for exactly the reason you
// would.

import { TUNE } from '../tune.js';
import { PlayerCar, defaultStats } from './physics.js';
import {
  lookaheadCurve, holdableSpeedPct, racingLine,
  findObstacle, findChaser, pickLine,
} from './driving.js';

export class Rival {
  constructor(track, identity, rng) {
    this.identity = identity;
    this.rng = rng;

    const stats = defaultStats();
    // Pace is a real car difference, not a fudge applied to the result.
    stats.topSpeedMul = identity.pace;
    stats.accelMul = 0.9 + identity.pace * 0.15;

    this.car = new PlayerCar(track, stats);
    this.track = track;

    this.lapPace = 1;            // wobbles per lap by `consistency`
    this.mistakeTimer = 0;
    this.lastCornerId = -1;
    this.blocking = 0;           // aggressive rivals defending a line
    this.finished = false;
    this.finishTime = null;
    this.rollLapPace();
  }

  get name() { return this.identity.name; }
  get paint() { return this.identity.paint; }

  rollLapPace() {
    const wobble = 1 - this.identity.consistency;
    this.lapPace = 1 + this.rng.range(-wobble, wobble * 0.6);
  }

  // `field` gives access to every car for avoidance and blocking.
  drive(dt, field) {
    const car = this.car;
    if (this.mistakeTimer > 0) this.mistakeTimer -= dt;
    if (this.blocking > 0) this.blocking -= dt;

    const aheadCurve = lookaheadCurve(this.track, car.trackPos, TUNE.RIVAL_LOOKAHEAD);

    // Once per corner, roll for a mistake. A mistake is not a scripted spin: the
    // rival simply carries too much speed in, and centrifugal force does the
    // rest — same as it would to you.
    const cornerId = Math.abs(aheadCurve) > 3 ? this.track.findIndex(car.trackPos) >> 6 : -1;
    if (cornerId >= 0 && cornerId !== this.lastCornerId) {
      this.lastCornerId = cornerId;
      const proneness = this.identity.personality === 'erratic' ? 2.5 : 1;
      if (this.rng.chance(TUNE.RIVAL_MISTAKE_CHANCE * proneness)) {
        this.mistakeTimer = 1.4;
      }
    }

    // --- how fast to go ---
    let margin = TUNE.RIVAL_CORNER_MARGIN * this.lapPace;
    if (this.mistakeTimer > 0) margin *= TUNE.RIVAL_MISTAKE_OVERSPEED;
    const limit = holdableSpeedPct(aheadCurve, car.grip, car.centrifugalScale) * margin;
    const pct = car.speed / car.maxSpeed;

    let throttle = 0, brake = 0;
    if (pct < limit - 0.02) throttle = 1;
    else if (pct > limit + 0.03) brake = Math.min(1, (pct - limit) * 6);
    else throttle = 0.55;

    // --- where to be on the road ---
    const curveNow = this.track.curveAt(car.trackPos);
    let targetX = racingLine(curveNow);

    const line = pickLine(car, field, this.track, targetX);
    const avoid = findObstacle(car, field, this.track);
    if (avoid) {
      targetX = line.target;
      // No gap: lift rather than shunt them. Aggressive drivers hold on longer.
      if (line.blocked && avoid.gapSegments < 10) {
        const patience = this.identity.personality === 'aggressive' ? 0.55 : 0.25;
        throttle = Math.min(throttle, patience);
        brake = Math.max(brake, this.identity.personality === 'aggressive' ? 0.15 : 0.35);
      }
    } else if (this.blocking > 0) {
      const chaser = findChaser(car, field, this.track);
      if (chaser) targetX = clamp(chaser.x, -0.9, 0.9);   // sit in front of them
    } else if (this.identity.personality === 'aggressive') {
      const chaser = findChaser(car, field, this.track);
      if (chaser && Math.abs(chaser.x - car.x) < 0.5) this.blocking = 0.9;
    }

    let steer = clamp((targetX - car.x) * TUNE.RIVAL_STEER_GAIN, -1, 1);
    // Add the lock needed to resist the corner's push, or they all understeer
    // off the outside of every bend.
    if (Math.abs(curveNow) > 0.2) {
      steer = clamp(steer + Math.sign(curveNow) * Math.min(1, Math.abs(curveNow) / 4), -1, 1);
    }

    return { steer, throttle, brake, nitro: false, shiftUp: false, shiftDown: false };
  }

}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
