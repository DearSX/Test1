// Race state machine. Section 4 + the M2 milestone: grid, laps, positions, lap
// timing, finish, swept collisions, slipstream.
//
// Race progress is distance travelled, not trackPos. Everyone starts on a
// different part of the grid, so ranking by trackPos would hand pole a free
// half-second; ranking by distance covered from your own grid slot is what
// makes the classification honest.

import { TUNE } from '../tune.js';
import { PlayerCar } from './physics.js';
import { Rival } from './rivals.js';
import { forwardGap } from './driving.js';
import { sweptContact, wrapDelta } from './collide.js';
import { buildRoster } from '../data/rivals.js';
import { makeRng } from '../core/rng.js';

export const PHASE = { COUNTDOWN: 'countdown', RACING: 'racing', FINISHED: 'finished' };

export class Race {
  constructor(track, {
    laps = TUNE.LAPS_DEFAULT,
    fieldSize = TUNE.FIELD_SIZE,
    playerStart = null,          // grid slot, 0 = pole; default = last
    seed = 1,
    paceScale = 1,           // division (section 5.1)
    rivalPaceScale = 1,      // difficulty (section 7)
    nemesisId = null,        // gets a small pace boost (section 4)
    playerStats = null,
    centrifugalScale = 1,
  } = {}) {
    this.track = track;
    this.laps = laps;
    this.fieldSize = fieldSize;
    this.rng = makeRng(seed);
    this.phase = PHASE.COUNTDOWN;
    this.countdown = TUNE.COUNTDOWN;
    this.clock = 0;

    this.player = new PlayerCar(track, playerStats ?? undefined);
    this.player.centrifugalScale = centrifugalScale;
    this.player.isPlayer = true;

    const roster = buildRoster(fieldSize, paceScale * rivalPaceScale, this.rng);
    this.nemesisId = nemesisId;
    this.rivals = roster.map(id => {
      // The nemesis is a real threat, not a label on the pre-race screen.
      const boosted = nemesisId && id.id === nemesisId
        ? { ...id, pace: id.pace * TUNE.NEMESIS_PACE_BOOST, isNemesis: true }
        : id;
      const r = new Rival(track, boosted, this.rng);
      r.car.centrifugalScale = centrifugalScale;
      return r;
    });

    // Entries wrap each car with its race bookkeeping.
    const playerSlot = playerStart === null ? fieldSize - 1 : playerStart;
    this.entries = [];
    this.entries.push(makeEntry(this.player, {
      name: 'YOU', paint: '#d8342c', number: 1, isPlayer: true,
    }));
    for (const r of this.rivals) this.entries.push(makeEntry(r.car, r.identity, r));

    this.gridUp(playerSlot);
    this.order = this.entries.slice();
    this.contactsThisRace = 0;
    // Per-pair cooldown. Cars running nose to tail trigger the swept test every
    // single step; without this, sustained rubbing charged full damage 60 times
    // a second and wrecked every car in the field inside one lap.
    this.contactCooldown = new Map();
  }

  // Slot 0 is pole, furthest up the road. Staggered left/right like a real grid.
  gridUp(playerSlot) {
    const slots = shuffleSlots(this.entries, playerSlot);
    for (let slot = 0; slot < slots.length; slot++) {
      const e = slots[slot];
      const back = slot * TUNE.GRID_SPACING;
      e.startZ = wrap(this.track.trackLength - back, this.track.trackLength);
      e.car.trackPos = e.startZ;
      e.car.x = (slot % 2 === 0 ? -1 : 1) * TUNE.GRID_STAGGER;
      e.car.speed = 0;
      e.car.gear = 0;
      e.gridSlot = slot + 1;
      e.distance = 0;
      e.lap = 1;
      e.lapStartDistance = 0;
      e.lapTime = 0;
      e.bestLap = null;
      e.lastLapDelta = null;
      e.finished = false;
      e.finishTime = null;
      e.position = slot + 1;
    }
  }

  get playerEntry() { return this.entries[0]; }
  get raceDistance() { return this.laps * this.track.trackLength; }

  update(dt, playerInput) {
    this.clock += dt;

    if (this.phase === PHASE.COUNTDOWN) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = PHASE.RACING;
      // Nobody moves before the lights, but the engines are running.
      for (const e of this.entries) e.car.rpm = TUNE.RPM_IDLE + (this.countdown < 1 ? 2200 : 600);
      return;
    }

    const cars = this.entries.map(e => e.car);

    // Remember where everyone was, for the swept collision test.
    for (const e of this.entries) {
      e.prevZ = e.car.trackPos;
      e.prevX = e.car.x;
    }

    this.applySlipstream();

    // --- step every car ---
    for (const e of this.entries) {
      if (e.finished) { e.car.update(dt, coastInput()); continue; }
      const cmd = e.isPlayer ? playerInput : e.rival.drive(dt, cars);
      const before = e.car.distance;
      e.car.update(dt, cmd);
      e.distance += e.car.distance - before;
    }

    this.resolveCollisions(dt);
    this.updateLaps(dt);
    this.updateOrder();

    if (this.entries.every(e => e.finished)) this.phase = PHASE.FINISHED;
    // The race is over for the player once they cross the line; the rest is
    // classification, so stop there rather than making them watch.
    if (this.playerEntry.finished && this.phase !== PHASE.FINISHED) {
      const remaining = this.entries.filter(e => !e.finished);
      if (remaining.length && this.clock - this.playerEntry.finishTime > TUNE.POST_FINISH_GRACE) {
        this.settleRemaining();
      }
    }
  }

  // Section 4: within SLIPSTREAM_RANGE segments behind another car, +8% speed.
  // Applies to the player too — that is what makes straights tactical.
  applySlipstream() {
    const range = TUNE.SLIPSTREAM_RANGE * TUNE.SEGMENT_LEN;
    for (const e of this.entries) {
      let tow = 1;
      for (const other of this.entries) {
        if (other === e) continue;
        const gap = forwardGap(e.car.trackPos, other.car.trackPos, this.track.trackLength);
        if (gap > 0 && gap < range && Math.abs(other.car.x - e.car.x) < TUNE.SLIPSTREAM_WIDTH) {
          tow = TUNE.SLIPSTREAM;
          break;
        }
      }
      e.car.slipstream = tow;
      e.slipstreaming = tow > 1;
    }
  }

  // Swept AABB in (trackPos, x). No pass-through, ever.
  //
  // Two distinct jobs, deliberately kept apart:
  //   1. DETECTION is swept, so a car that crossed another inside a single step
  //      is caught even though it never landed on top of it.
  //   2. SEPARATION is iterative, because a single pass cannot untangle a
  //      pile-up: pushing car A off B can push A straight into C. Sequential
  //      pairwise fixing left cars 250 of 260 units interpenetrated in traffic.
  resolveCollisions(dt) {
    const L = this.track.trackLength;
    const opts = { carLen: TUNE.CAR_LEN, carWidth: TUNE.CAR_WIDTH, trackLength: L };

    for (const [key, t] of this.contactCooldown) {
      const left = t - dt;
      if (left <= 0) this.contactCooldown.delete(key); else this.contactCooldown.set(key, left);
    }

    for (let i = 0; i < this.entries.length; i++) {
      for (let j = i + 1; j < this.entries.length; j++) {
        const a = this.entries[i], b = this.entries[j];

        // Cheap reject before the exact test.
        if (Math.abs(wrapDelta(a.car.trackPos - b.car.trackPos, L)) > TUNE.CAR_LEN * 4
          && Math.abs(wrapDelta(a.prevZ - b.prevZ, L)) > TUNE.CAR_LEN * 4) continue;

        const hit = sweptContact(
          { z0: a.prevZ, z1: a.car.trackPos, x0: a.prevX, x1: a.car.x },
          { z0: b.prevZ, z1: b.car.trackPos, x0: b.prevX, x1: b.car.x },
          opts);
        if (!hit) continue;

        const key = `${i}-${j}`;
        if (this.contactCooldown.has(key)) continue;
        this.contactCooldown.set(key, TUNE.CONTACT_COOLDOWN);

        this.applyContact(a, b, hit);
        this.contactsThisRace++;
      }
    }

    this.separate();
  }

  // Contact response: speed, damage, shove. Position is left to separate().
  applyContact(a, b, hit) {
    const ahead = hit.dz > 0 ? a : b;      // a is in front if dz > 0
    const behind = hit.dz > 0 ? b : a;

    // Mutual speed loss — the car behind loses more, as it ran into the back.
    ahead.car.speed *= TUNE.COLLIDE_SPEED_LOSS;
    behind.car.speed *= TUNE.COLLIDE_SPEED_LOSS * 0.94;

    // Lateral shove apart.
    const dir = hit.dx === 0 ? (a.gridSlot % 2 ? 1 : -1) : Math.sign(hit.dx);
    a.car.x = clampX(a.car.x + dir * TUNE.COLLIDE_SHOVE);
    b.car.x = clampX(b.car.x - dir * TUNE.COLLIDE_SHOVE);

    for (const e of [a, b]) {
      e.car.damage = Math.min(1, e.car.damage + TUNE.COLLIDE_DAMAGE * e.car.stats.damageTakenMul);
      e.car.shake = Math.max(e.car.shake, 0.7);
      e.contacts = (e.contacts || 0) + 1;
    }
  }

  // Push overlapping cars apart along whichever axis needs the least movement,
  // repeating until the field is untangled. Lateral distance is converted to
  // world units so the two axes are actually comparable.
  separate() {
    const L = this.track.trackLength;
    for (let iter = 0; iter < TUNE.SEPARATION_ITERATIONS; iter++) {
      let dirty = false;

      for (let i = 0; i < this.entries.length; i++) {
        for (let j = i + 1; j < this.entries.length; j++) {
          const a = this.entries[i].car, b = this.entries[j].car;
          const dz = wrapDelta(a.trackPos - b.trackPos, L);
          if (Math.abs(dz) >= TUNE.CAR_LEN) continue;
          const dx = a.x - b.x;
          if (Math.abs(dx) >= TUNE.CAR_WIDTH) continue;

          dirty = true;
          const zEscape = TUNE.CAR_LEN - Math.abs(dz);
          const xEscape = (TUNE.CAR_WIDTH - Math.abs(dx)) * TUNE.ROAD_WIDTH;

          if (xEscape <= zEscape) {
            // Side by side already — nudge them apart across the road.
            const push = (TUNE.CAR_WIDTH - Math.abs(dx)) * 0.5 + 1e-4;
            const dir = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
            a.x = clampX(a.x + dir * push);
            b.x = clampX(b.x - dir * push);
          } else {
            const push = zEscape * 0.5 + 1e-4;
            const dir = dz === 0 ? (i % 2 ? 1 : -1) : Math.sign(dz);
            a.trackPos = wrapPos(a.trackPos + dir * push, L);
            b.trackPos = wrapPos(b.trackPos - dir * push, L);
          }
        }
      }

      if (!dirty) break;
    }
  }

  updateLaps(dt) {
    for (const e of this.entries) {
      if (e.finished) continue;
      e.lapTime += dt * 1000;

      const lapsDone = Math.floor(e.distance / this.track.trackLength);
      if (lapsDone >= e.lap) {
        // Crossed the line.
        if (e.bestLap === null || e.lapTime < e.bestLap) {
          e.lastLapDelta = e.bestLap === null ? null : e.lapTime - e.bestLap;
          e.bestLap = e.lapTime;
        } else {
          e.lastLapDelta = e.lapTime - e.bestLap;
        }
        e.lap = lapsDone + 1;
        e.lapTime = 0;
        if (e.rival) e.rival.rollLapPace();
      }

      if (e.distance >= this.raceDistance) {
        e.finished = true;
        e.finishTime = this.clock;
        e.lap = this.laps;
      }
    }
  }

  // Rank by distance covered; finishers keep their finishing order.
  updateOrder() {
    this.order = this.entries.slice().sort((p, q) => {
      if (p.finished && q.finished) return p.finishTime - q.finishTime;
      if (p.finished) return -1;
      if (q.finished) return 1;
      return q.distance - p.distance;
    });
    for (let i = 0; i < this.order.length; i++) this.order[i].position = i + 1;
  }

  // Once the player is home, extrapolate the rest of the field's finishing times
  // from their pace rather than simulating minutes of empty track.
  settleRemaining() {
    for (const e of this.entries) {
      if (e.finished) continue;
      const left = this.raceDistance - e.distance;
      const pace = Math.max(e.car.speed, e.car.maxSpeed * 0.55);
      e.finished = true;
      e.finishTime = this.clock + left / pace;
      e.extrapolated = true;
      e.lap = this.laps;
    }
    this.updateOrder();
    this.phase = PHASE.FINISHED;
  }

  // Classification, for the results screen and (M3) championship points.
  results() {
    return this.order.map((e, i) => ({
      position: i + 1,
      name: e.identity.name,
      paint: e.identity.paint,
      number: e.identity.number,
      isPlayer: !!e.isPlayer,
      gridSlot: e.gridSlot,
      bestLap: e.bestLap,
      finishTime: e.finishTime,
      damage: e.car.damage,
      contacts: e.contacts || 0,
      extrapolated: !!e.extrapolated,
    }));
  }

  // What the HUD needs.
  hudState() {
    const e = this.playerEntry;
    return {
      phase: this.phase,
      countdown: Math.max(0, this.countdown),
      lap: e.lap,
      totalLaps: this.laps,
      position: e.position,
      fieldSize: this.fieldSize,
      lapTime: e.lapTime,
      bestLap: e.bestLap,
      lastLapDelta: e.lastLapDelta,
      slipstreaming: e.slipstreaming,
      finished: e.finished,
    };
  }
}

function makeEntry(car, identity, rival = null) {
  return {
    car, identity, rival,
    isPlayer: !rival,
    startZ: 0, distance: 0, prevZ: 0, prevX: 0,
    lap: 1, lapTime: 0, bestLap: null, lastLapDelta: null,
    position: 0, gridSlot: 0, finished: false, finishTime: null,
    contacts: 0, slipstreaming: false,
  };
}

// Grid order: fastest cars at the front, with the player dropped into their slot.
function shuffleSlots(entries, playerSlot) {
  const rivals = entries.filter(e => !e.isPlayer)
    .sort((a, b) => b.identity.pace - a.identity.pace);
  const slots = [];
  let ri = 0;
  for (let s = 0; s < entries.length; s++) {
    slots.push(s === playerSlot ? entries[0] : rivals[ri++]);
  }
  return slots;
}

function coastInput() {
  return { steer: 0, throttle: 0, brake: 0.35, nitro: false, shiftUp: false, shiftDown: false };
}

function wrap(z, L) { return ((z % L) + L) % L; }
function wrapPos(z, L) { return ((z % L) + L) % L; }
function clampX(x) { return x < -TUNE.CRASH_X ? -TUNE.CRASH_X : x > TUNE.CRASH_X ? TUNE.CRASH_X : x; }
