// M1 "done when": you can lap the track, and flooring a hairpin reliably puts
// you in the grass.
//
// The soul-dial rule has two halves and both are asserted here:
//   A) full throttle through the hardest corner goes off EVERY time, even with
//      perfect opposite lock, from every entry line;
//   B) a driver who lifts and brakes still gets through cleanly — otherwise the
//      corner is impossible, which is just as wrong as it being holdable.
//
//   node tools/verify-m1.mjs
//   node tools/verify-m1.mjs --sweep     # scan CENTRIFUGAL for the valid window

import { buildIslandTrack } from '../src/data/tracks/island.js';
import { TrackBuilder } from '../src/game/track.js';
import { PlayerCar } from '../src/game/physics.js';
import { ModelDriver, holdableSpeedPct } from '../src/game/driving.js';
import { TUNE } from '../src/tune.js';
import { check, report } from './harness.mjs';

const track = buildIslandTrack();
const DT = TUNE.STEP;

// Drivetrain tests need a road with no corners in them — on the real track a
// full-throttle run just drives itself into the hairpin and the results measure
// centrifugal force instead of the gearbox.
function straightTrack() {
  const t = new TrackBuilder();
  for (let i = 0; i < 12; i++) t.addStraight(400);
  return t.build();
}
const STRAIGHT = straightTrack();

// --- locate the hardest corner ----------------------------------------------

function hardestCorner() {
  let best = track.segments[0];
  for (const s of track.segments) if (Math.abs(s.curve) > Math.abs(best.curve)) best = s;
  // Walk back to where the corner starts so we can enter it properly.
  let start = best.index;
  while (start > 0 && Math.abs(track.segments[start - 1].curve) > 0.05) start--;
  let end = best.index;
  while (end < track.segments.length - 1 && Math.abs(track.segments[end + 1].curve) > 0.05) end++;
  return { seg: best, start, end };
}

const corner = hardestCorner();

// --- the two soul-dial tests -------------------------------------------------

// Perfect opposite lock at full throttle: the best a human could possibly do
// while refusing to lift. If this survives, the dial is too low.
function floorIt(entryX, entrySpeedPct, centrifugal = TUNE.CENTRIFUGAL) {
  const car = new PlayerCar(track);
  car.centrifugalScale = centrifugal / TUNE.CENTRIFUGAL;
  car.trackPos = Math.max(0, corner.start - 60) * TUNE.SEGMENT_LEN;
  car.x = entryX;
  car.speed = car.maxSpeed * entrySpeedPct;
  car.gear = TUNE.GEAR_TOP.length - 1;

  let wentOff = false, worstX = 0, crashed = false;
  const stopAt = (corner.end + 40) * TUNE.SEGMENT_LEN;
  for (let t = 0; t < 30 / DT && car.trackPos < stopAt; t++) {
    const curve = track.curveAt(car.trackPos);
    // Full lock into the corner — i.e. directly against the push.
    const steer = curve === 0 ? 0 : Math.sign(curve);
    car.update(DT, { steer, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    if (Math.abs(car.x) > worstX) worstX = Math.abs(car.x);
    if (Math.abs(car.x) > TUNE.OFFROAD_X) wentOff = true;
    if (car.crashed) crashed = true;
  }
  return { wentOff, worstX, crashed };
}

// A driver who respects the corner.
function driveCorner(centrifugal = TUNE.CENTRIFUGAL, margin = 0.92) {
  const car = new PlayerCar(track);
  car.centrifugalScale = centrifugal / TUNE.CENTRIFUGAL;
  const driver = new ModelDriver(track, { margin });
  car.trackPos = Math.max(0, corner.start - 120) * TUNE.SEGMENT_LEN;
  car.x = 0;
  car.speed = car.maxSpeed * 0.9;

  let worstX = 0, offSteps = 0, minSpeedPct = 1;
  const stopAt = (corner.end + 40) * TUNE.SEGMENT_LEN;
  for (let t = 0; t < 60 / DT && car.trackPos < stopAt; t++) {
    car.update(DT, driver.drive(car));
    worstX = Math.max(worstX, Math.abs(car.x));
    if (Math.abs(car.x) > TUNE.OFFROAD_X) offSteps++;
    minSpeedPct = Math.min(minSpeedPct, car.speed / car.maxSpeed);
  }
  return { worstX, offSteps, minSpeedPct };
}

if (process.argv.includes('--sweep')) {
  console.log('CENTRIFUGAL sweep — need: flat-out off every time AND a lifting driver clean\n');
  console.log('  value   flat-out off   worst|x| flat   lifting worst|x|   lifting min speed');
  for (let c = 0.30; c <= 1.05; c += 0.04) {
    const runs = [];
    for (const ex of [-0.9, -0.45, 0, 0.45, 0.9]) {
      for (const es of [0.85, 0.95, 1.0]) runs.push(floorIt(ex, es, c));
    }
    const allOff = runs.every(r => r.wentOff);
    const worstFlat = Math.min(...runs.map(r => r.worstX));
    const d = driveCorner(c);
    console.log(
      `  ${c.toFixed(2)}    ${allOff ? 'ALL' : `${runs.filter(r => r.wentOff).length}/${runs.length}`.padEnd(3)}` +
      `            ${worstFlat.toFixed(2)}            ${d.worstX.toFixed(2)}` +
      `              ${(d.minSpeedPct * 100).toFixed(0)}%` +
      `   ${allOff && d.offSteps === 0 ? '  <= valid' : ''}`
    );
  }
  process.exit(0);
}

console.log(`hardest corner: segments ${corner.start}-${corner.end}, |curve| ${Math.abs(corner.seg.curve).toFixed(1)}`);
console.log(`CENTRIFUGAL = ${TUNE.CENTRIFUGAL}\n`);

// A: flat out, every line, every plausible entry speed.
const flatRuns = [];
for (const ex of [-0.95, -0.7, -0.35, 0, 0.35, 0.7, 0.95]) {
  for (const es of [0.8, 0.9, 0.95, 1.0]) {
    flatRuns.push({ ex, es, ...floorIt(ex, es) });
  }
}
const held = flatRuns.filter(r => !r.wentOff);
check('SOUL DIAL: full throttle through the hardest corner goes off EVERY time',
  held.length === 0,
  held.length
    ? `${held.length}/${flatRuns.length} runs held the road, e.g. entry x=${held[0].ex} at ${held[0].es * 100}% speed reached only |x|=${held[0].worstX.toFixed(2)}`
    : `${flatRuns.length}/${flatRuns.length} runs off the road despite perfect opposite lock (min worst |x| = ${Math.min(...flatRuns.map(r => r.worstX)).toFixed(2)})`);

// B: the corner is still learnable.
const clean = driveCorner();
check('SOUL DIAL: a driver who lifts gets through cleanly',
  clean.offSteps === 0,
  clean.offSteps === 0
    ? `stayed on the road, worst |x| = ${clean.worstX.toFixed(2)}, had to slow to ${(clean.minSpeedPct * 100).toFixed(0)}% of top speed`
    : `off the road for ${clean.offSteps} steps (worst |x| = ${clean.worstX.toFixed(2)}) — corner is impossible, not hard`);

check('the hardest corner demands a real lift (not just a feather)',
  clean.minSpeedPct < 0.8,
  `holdable speed there is ${(holdableSpeedPct(corner.seg.curve, 1) * 100).toFixed(0)}% of max; driver used ${(clean.minSpeedPct * 100).toFixed(0)}%`);

// Easy corners must NOT require lifting, or the whole track is a chore.
const easy = track.segments.filter(s => Math.abs(s.curve) > 1.5 && Math.abs(s.curve) < 2.5);
if (easy.length) {
  const pct = holdableSpeedPct(easy[0].curve, 1);
  check('gentle corners are flat out', pct >= 0.999,
    `|curve| ${Math.abs(easy[0].curve).toFixed(1)} holdable at ${(pct * 100).toFixed(0)}% of max`);
}

// --- a full lap --------------------------------------------------------------

function lap(opts = {}) {
  const car = new PlayerCar(track);
  const driver = new ModelDriver(track, opts);
  car.speed = car.maxSpeed * 0.5;
  let t = 0, offSteps = 0, crashes = 0, wasCrashed = false, maxSpeed = 0;
  const positions = [];
  while (car.trackPos < track.trackLength - TUNE.SEGMENT_LEN && t < 600 / DT) {
    car.update(DT, driver.drive(car));
    t++;
    if (car.offRoad) offSteps++;
    if (car.crashed && !wasCrashed) crashes++;
    wasCrashed = car.crashed;
    maxSpeed = Math.max(maxSpeed, car.speed);
    if (t % 10 === 0) positions.push(car.x);
  }
  return { seconds: t * DT, offSteps, crashes, maxSpeed, positions, finished: car.trackPos >= track.trackLength - TUNE.SEGMENT_LEN * 2 };
}

const L = lap();
check('you can lap the track', L.finished, `lap completed in ${L.seconds.toFixed(1)}s`);
check('lap time is in a sane range for a 2,425-segment track',
  L.seconds > 45 && L.seconds < 240, `${L.seconds.toFixed(1)}s`);
check('a competent lap does not need the grass', L.offSteps < 30,
  `${L.offSteps} steps off-road (${(L.offSteps * DT).toFixed(1)}s), ${L.crashes} crashes`);
check('top speed is reachable on the straights', L.maxSpeed > TUNE.BASE_MAX_SPEED * 0.9,
  `reached ${(L.maxSpeed * TUNE.SPEED_TO_KMH).toFixed(0)} km/h of ${(TUNE.BASE_MAX_SPEED * TUNE.SPEED_TO_KMH).toFixed(0)} km/h`);

// --- continuous position: prove there are no lanes ---------------------------

// A 3-lane system would put every sample into one of 3 buckets. Counting
// occupied 0.05-wide buckets across the road is the direct refutation of that.
const buckets = new Set(L.positions.map(x => Math.round(x / 0.05)));
check('lateral position is continuous, not snapped to lanes',
  buckets.size >= 12,
  `${buckets.size} distinct 0.05-wide positions occupied across a lap (a 3-lane model could only reach 3)`);

// A slow steady steer must sweep the road smoothly with no jumps.
{
  const car = new PlayerCar(track);
  car.trackPos = 0; car.speed = car.maxSpeed * 0.3;
  const xs = [];
  for (let t = 0; t < 120; t++) {
    car.update(DT, { steer: 0.25, throttle: 0.3, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    xs.push(car.x);
  }
  let maxJump = 0;
  for (let i = 1; i < xs.length; i++) maxJump = Math.max(maxJump, Math.abs(xs[i] - xs[i - 1]));
  check('steering moves the car smoothly (no lane snap)', maxJump < 0.02 && xs.length > 100,
    `largest single-step move ${maxJump.toFixed(4)} lateral units`);
}

// --- off-road, crashing ------------------------------------------------------

{
  const car = new PlayerCar(STRAIGHT);
  car.speed = car.maxSpeed; car.x = 1.2; car.gear = 5;
  for (let t = 0; t < 4 / DT; t++) {
    car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    car.x = 1.2;   // hold it in the grass
  }
  const pct = car.speed / car.maxSpeed;
  check('off-road drags you down to roughly OFFROAD_MAX even at full throttle',
    pct < TUNE.OFFROAD_MAX + 0.06,
    `settled at ${(pct * 100).toFixed(0)}% of max (OFFROAD_MAX ${TUNE.OFFROAD_MAX * 100}%)`);
}

{
  const car = new PlayerCar(STRAIGHT);
  car.speed = car.maxSpeed; car.x = 1.5;
  const before = car.speed;
  // Keep steering outward until scenery is actually reached — one step of lock
  // at 1.5 does not span the remaining 0.1 to CRASH_X.
  let toImpact = 0;
  while (!car.crashed && toImpact < 2 / DT) {
    car.update(DT, { steer: 1, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    toImpact++;
  }
  const atImpact = car.speed;
  let steps = 0;
  while (car.crashed && steps < 5 / DT) {
    car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    steps++;
  }
  check('hitting scenery is a crash, not instant death',
    car.damage > 0 && atImpact < before && Math.abs(car.x) <= TUNE.CRASH_X && !car.crashed,
    `damage ${(car.damage * 100).toFixed(0)}%, speed ${(atImpact / before * 100).toFixed(0)}% of entry at impact, then recovered and drivable`);
  check('crash recovery is about CRASH_RECOVERY seconds',
    Math.abs(steps * DT - TUNE.CRASH_RECOVERY) < 0.1, `${(steps * DT).toFixed(2)}s vs ${TUNE.CRASH_RECOVERY}s`);
}

// --- gears -------------------------------------------------------------------

{
  const car = new PlayerCar(STRAIGHT);
  const seen = [];
  let shifts = 0, prevGear = 0, timeTo300 = null;
  for (let t = 0; t < 40 / DT; t++) {
    car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    if (car.gear !== prevGear) { shifts++; prevGear = car.gear; }
    seen.push(car.rpm);
    if (timeTo300 === null && car.speedKmh >= 290) timeTo300 = t * DT;
  }
  check('auto gearbox works through all six gears', car.gear === 5 && shifts === 5,
    `ended in gear ${car.gear + 1}, ${shifts} upshifts`);
  check('RPM resets on upshift (the sound that sells it)',
    Math.min(...seen) < TUNE.RPM_REDLINE * 0.5 && Math.max(...seen) > TUNE.RPM_REDLINE * 0.9,
    `rpm ranged ${Math.round(Math.min(...seen))}-${Math.round(Math.max(...seen))}`);
  check('0-290 km/h in a plausible time', timeTo300 !== null && timeTo300 > 3 && timeTo300 < 32,
    timeTo300 === null ? 'never got there' : `${timeTo300.toFixed(1)}s`);
}

{
  const auto = new PlayerCar(track);
  const manual = new PlayerCar(track);
  manual.manualGears = true;
  check('manual gears offer ~4% more top speed',
    Math.abs(manual.maxSpeed / auto.maxSpeed - TUNE.MANUAL_TOP_SPEED_BONUS) < 1e-9,
    `${((manual.maxSpeed / auto.maxSpeed - 1) * 100).toFixed(1)}% more`);
}

// --- surfaces ----------------------------------------------------------------

{
  const pcts = {};
  for (const surface of ['asphalt', 'wet', 'dirt', 'ice']) {
    const car = new PlayerCar(track);
    // Fake the surface under the car.
    Object.defineProperty(car, 'surface', { get: () => surface });
    pcts[surface] = holdableSpeedPct(6, car.grip);
  }
  check('lower grip surfaces make corners slower, in the right order',
    pcts.asphalt > pcts.wet && pcts.wet > pcts.dirt && pcts.dirt > pcts.ice,
    Object.entries(pcts).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', '));
  check('ice is genuinely terrifying', pcts.ice < pcts.asphalt * 0.7,
    `ice holds only ${(pcts.ice * 100).toFixed(0)}% vs asphalt ${(pcts.asphalt * 100).toFixed(0)}%`);
}

// --- nitro -------------------------------------------------------------------

{
  const car = new PlayerCar(track);
  car.speed = car.maxSpeed * 0.99; car.gear = 5;
  const baseMax = car.maxSpeed;
  const gripBefore = car.grip;
  car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: true, shiftUp: false, shiftDown: false });
  check('nitro raises top speed by NITRO_BOOST and costs a charge',
    Math.abs(car.effectiveMaxSpeed / baseMax - TUNE.NITRO_BOOST) < 1e-9
    && car.nitroCharges === TUNE.NITRO_CHARGES_START - 1,
    `top speed ×${TUNE.NITRO_BOOST}, ${car.nitroCharges} charges left`);
  check('nitro costs grip, so nitro into a corner is a decision',
    car.grip < gripBefore,
    `grip ${gripBefore.toFixed(2)} -> ${car.grip.toFixed(2)}`);

  let t = 0;
  while (car.nitroTimer > 0 && t < 10 / DT) {
    car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    t++;
  }
  check('nitro lasts NITRO_DURATION seconds', Math.abs(t * DT - TUNE.NITRO_DURATION) < 0.05,
    `${(t * DT).toFixed(2)}s`);
}

// --- determinism: same inputs, same result (needed for honest racing) --------

{
  const runOnce = () => {
    const car = new PlayerCar(track);
    const driver = new ModelDriver(track);
    for (let t = 0; t < 20 / DT; t++) car.update(DT, driver.drive(car));
    return `${car.trackPos.toFixed(6)}|${car.x.toFixed(6)}|${car.speed.toFixed(6)}`;
  };
  check('physics is deterministic', runOnce() === runOnce(), runOnce());
}

report('M1');
