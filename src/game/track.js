// Track model. Spec section 2.2.
// A track is an array of segments: { index, curve, y, surface, sprites, hazards }
// Built from a readable piece list: addStraight / addCurve / addHairpin / addSCurve.

import { TUNE } from '../tune.js';

export const LEN = { SHORT: 25, MEDIUM: 50, LONG: 100 };

export const CURVE = {
  NONE: 0,
  EASY_LEFT: -2, EASY_RIGHT: 2,
  MEDIUM_LEFT: -4, MEDIUM_RIGHT: 4,
  HARD_LEFT: -5, HARD_RIGHT: 5,
  LEFT: -6, RIGHT: 6,            // hairpin strength
};

export const HILL = { NONE: 0, LOW: 20, UP: 40, HIGH: 60 };

// Smooth ease for curve entry/exit and elevation so nothing kinks.
const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
const easeOut = (a, b, p) => a + (b - a) * (1 - Math.pow(1 - p, 2));
const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

export class TrackBuilder {
  constructor() {
    this.segments = [];
  }

  get length() { return this.segments.length; }

  lastY() {
    return this.segments.length
      ? this.segments[this.segments.length - 1].y
      : 0;
  }

  _push(curve, y, surface = 'asphalt') {
    this.segments.push({
      index: this.segments.length,
      curve,
      y,
      surface,
      sprites: [],
      hazards: [],
    });
  }

  // enter/hold/exit shaping: curve ramps in, holds, ramps out.
  addRoad(enter, hold, exit, curve, endYDelta = 0, surface = 'asphalt') {
    const startY = this.lastY();
    const endY = startY + endYDelta * TUNE.SEGMENT_LEN;
    const total = enter + hold + exit;
    // Elevation is interpolated over total-1 so the final segment lands exactly
    // on endY. Using n/total leaves every piece a fraction short of its target,
    // and across a lap that error accumulates until the start line no longer
    // meets the finish.
    const denom = Math.max(total - 1, 1);
    const yAt = (n) => easeInOut(startY, endY, n / denom);

    for (let n = 0; n < enter; n++) {
      this._push(easeIn(0, curve, n / enter), yAt(n), surface);
    }
    for (let n = 0; n < hold; n++) {
      this._push(curve, yAt(enter + n), surface);
    }
    for (let n = 0; n < exit; n++) {
      this._push(easeInOut(curve, 0, n / exit), yAt(enter + hold + n), surface);
    }
  }

  addStraight(len = LEN.MEDIUM, surface = 'asphalt') {
    this.addRoad(len, len, len, 0, 0, surface);
  }

  addCurve(len = LEN.MEDIUM, curve = CURVE.MEDIUM_RIGHT, hill = HILL.NONE, surface = 'asphalt') {
    this.addRoad(len, len, len, curve, hill, surface);
  }

  addHill(len = LEN.MEDIUM, height = HILL.UP, surface = 'asphalt') {
    this.addRoad(len, len, len, 0, height, surface);
  }

  addHairpin(curve = CURVE.LEFT, surface = 'asphalt') {
    this.addRoad(LEN.SHORT, LEN.MEDIUM, LEN.SHORT, curve, 0, surface);
  }

  addSCurve(len = LEN.SHORT, surface = 'asphalt') {
    this.addRoad(len, len, len, CURVE.EASY_LEFT, 0, surface);
    this.addRoad(len, len, len, CURVE.MEDIUM_RIGHT, HILL.LOW, surface);
    this.addRoad(len, len, len, CURVE.EASY_RIGHT, -HILL.LOW, surface);
    this.addRoad(len, len, len, CURVE.EASY_LEFT, 0, surface);
  }

  addDownhill(len = LEN.MEDIUM, drop = HILL.UP, surface = 'asphalt') {
    this.addRoad(len, len, len, 0, -drop, surface);
  }

  build() {
    return new Track(this.segments);
  }
}

export class Track {
  constructor(segments) {
    this.segments = segments;
    this.segmentLength = TUNE.SEGMENT_LEN;
    this.trackLength = segments.length * TUNE.SEGMENT_LEN;

    // Give every segment its two world-space edges plus scratch space for the
    // renderer. The renderer writes camera/screen into these each frame, and
    // M2's cars and M6's sprites read them back to place themselves.
    const n = segments.length;
    for (let i = 0; i < n; i++) {
      const seg = segments[i];
      const next = segments[(i + 1) % n];
      seg.p1 = point(0, seg.y, i * this.segmentLength);
      seg.p2 = point(0, next.y, (i + 1) * this.segmentLength);
      seg.looped = false;
      seg.clip = 0;
    }
  }

  // Segment containing world-position z (wraps around the lap).
  findSegment(z) {
    return this.segments[this.findIndex(z)];
  }

  findIndex(z) {
    const n = this.segments.length;
    const i = Math.floor(z / this.segmentLength) % n;
    return (i + n) % n;
  }

  // Road elevation at an arbitrary z, interpolated between segment edges so
  // hills read as slopes and not stairs.
  elevationAt(z) {
    const wrapped = ((z % this.trackLength) + this.trackLength) % this.trackLength;
    const i = this.findIndex(wrapped);
    const next = (i + 1) % this.segments.length;
    const p = (wrapped % this.segmentLength) / this.segmentLength;
    const y0 = this.segments[i].y;
    const y1 = this.segments[next].y;
    return y0 + (y1 - y0) * p;
  }

  // Curve at an arbitrary z, interpolated the same way. Physics reads this so
  // centrifugal force ramps smoothly instead of stepping once per segment.
  curveAt(z) {
    const wrapped = ((z % this.trackLength) + this.trackLength) % this.trackLength;
    const i = this.findIndex(wrapped);
    const next = (i + 1) % this.segments.length;
    const p = (wrapped % this.segmentLength) / this.segmentLength;
    const c0 = this.segments[i].curve;
    const c1 = this.segments[next].curve;
    return c0 + (c1 - c0) * p;
  }
}

function point(x, y, z) {
  return { world: { x, y, z }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } };
}
