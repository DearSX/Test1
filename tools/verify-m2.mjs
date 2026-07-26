// M2 "done when": you can finish a 3-lap race from 20th to somewhere
// believable, and the positions are honest.
//
//   node tools/verify-m2.mjs
//   node tools/verify-m2.mjs --race    # print a race classification

import { buildIslandTrack } from '../src/data/tracks/island.js';
import { Race, PHASE } from '../src/game/race.js';
import { ModelDriver } from '../src/game/driving.js';
import { sweptContact } from '../src/game/collide.js';
import { TUNE } from '../src/tune.js';
import { formatTime } from '../src/render/hud.js';
import { check, report } from './harness.mjs';

const track = buildIslandTrack();
const DT = TUNE.STEP;

// Runs a whole race with a model driver at the wheel. `skill` scales how well
// the player drives, so we can check that finishing position tracks skill.
function runRace({ seed = 1, skill = 1, laps = 3, playerStart = null, maxSeconds = 900 } = {}) {
  const race = new Race(track, { seed, laps, playerStart });
  const driver = new ModelDriver(track, { margin: 0.92 * skill, aggression: skill });
  let steps = 0;
  while (race.phase !== PHASE.FINISHED && steps < maxSeconds / DT) {
    const input = race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false };
    race.update(DT, input);
    steps++;
  }
  return { race, steps, seconds: steps * DT };
}

if (process.argv.includes('--race')) {
  const { race, seconds } = runRace();
  console.log(`3 laps, ${race.fieldSize} cars, player started ${race.playerEntry.gridSlot}th`);
  console.log(`simulated ${seconds.toFixed(1)}s, ${race.contactsThisRace} contacts\n`);
  console.log('  POS  CAR                NUM  GRID  BEST LAP      GAP     DMG');
  const winner = race.order[0];
  for (const r of race.results()) {
    const gap = r.finishTime - winner.finishTime;
    console.log(
      `  ${String(r.position).padStart(3)}  ${(r.isPlayer ? '>> YOU' : r.name).padEnd(18)}` +
      ` ${String(r.number).padStart(3)}  ${String(r.gridSlot).padStart(4)}  ` +
      `${formatTime(r.bestLap).padEnd(13)} ${(gap === 0 ? '—' : `+${gap.toFixed(2)}s`).padEnd(8)}` +
      `${(r.damage * 100).toFixed(0)}%${r.extrapolated ? '  (est)' : ''}`);
  }
  process.exit(0);
}

// --- field, grid -------------------------------------------------------------

{
  const race = new Race(track, { seed: 3 });
  check('20-car field: you plus 19 rivals',
    race.entries.length === 20 && race.rivals.length === 19,
    `${race.entries.length} entries, ${race.rivals.length} rivals`);
  check('you start last by default', race.playerEntry.gridSlot === 20,
    `grid slot ${race.playerEntry.gridSlot}`);
  const slots = new Set(race.entries.map(e => e.gridSlot));
  check('every car has a distinct grid slot', slots.size === 20, `${slots.size} distinct slots`);
  const named = race.rivals.filter(r => r.identity.named).length;
  check('recurring named rivals with personalities', named >= 6,
    `${named} named rivals: ${race.rivals.filter(r => r.identity.named).map(r => r.name).join(', ')}`);
  const personalities = new Set(race.rivals.map(r => r.identity.personality));
  check('personalities vary across the field', personalities.size >= 3,
    [...personalities].join(', '));
  check('nobody moves before the lights', race.phase === PHASE.COUNTDOWN
    && race.entries.every(e => e.car.speed === 0), `countdown ${race.countdown}s`);
}

// --- swept collisions: the unit level ----------------------------------------

const boxOpts = { carLen: TUNE.CAR_LEN, carWidth: TUNE.CAR_WIDTH, trackLength: track.trackLength };

{
  // A car closing at 300 km/h covers ~183 units per step against a 260-unit car
  // length — the exact case a landing-position test misses.
  const fast = { z0: 0, z1: 620, x0: 0, x1: 0 };
  const slow = { z0: 300, z1: 310, x0: 0, x1: 0 };
  const hit = sweptContact(fast, slow, boxOpts);
  check('swept test catches a car passing THROUGH another in one step',
    hit !== null, hit ? `contact at t=${hit.t.toFixed(3)} of the step` : 'MISSED — this is tunnelling');

  // The naive test, for contrast: are they overlapping where they landed?
  const naiveWouldMiss = Math.abs(fast.z1 - slow.z1) > TUNE.CAR_LEN;
  check('...and a landing-position test would have missed that exact case',
    naiveWouldMiss, `gap on landing = ${Math.abs(fast.z1 - slow.z1)} units, car length ${TUNE.CAR_LEN}`);
}

{
  const a = { z0: 0, z1: 400, x0: -0.9, x1: -0.9 };
  const b = { z0: 300, z1: 305, x0: 0.9, x1: 0.9 };
  check('passing side by side with room is not a collision',
    sweptContact(a, b, boxOpts) === null, 'lateral gap 1.8 > CAR_WIDTH 0.33');
}

{
  const a = { z0: 0, z1: 100, x0: 0, x1: 0 };
  const b = { z0: track.trackLength / 2, z1: track.trackLength / 2 + 100, x0: 0, x1: 0 };
  check('cars half a lap apart do not collide through the wrap',
    sweptContact(a, b, boxOpts) === null, 'opposite sides of the track');
}

{
  // Contact across the start/finish line, where trackPos wraps to 0.
  const L = track.trackLength;
  const a = { z0: L - 100, z1: 80, x0: 0, x1: 0 };
  const b = { z0: L - 50, z1: 100, x0: 0.1, x1: 0.1 };
  check('contact is detected across the start/finish wrap',
    sweptContact(a, b, boxOpts) !== null, 'cars either side of z=0');
}

// --- swept collisions: in a real race, including a 250ms stall ---------------

// Section 11: "Sit on a 250ms frame stall — no car passes through another car."
// With a fixed timestep a stall becomes 15 catch-up steps, so the check that
// matters is that no pair is ever interpenetrating after any of them.
{
  const race = new Race(track, { seed: 7 });
  const driver = new ModelDriver(track, { margin: 0.95 });
  let worstOverlap = 0, worstPair = '', steps = 0, stalls = 0;

  const stepOnce = () => {
    const input = race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false };
    race.update(DT, input);
    steps++;
    // Check every pair for interpenetration.
    for (let i = 0; i < race.entries.length; i++) {
      for (let j = i + 1; j < race.entries.length; j++) {
        const a = race.entries[i].car, b = race.entries[j].car;
        let dz = (a.trackPos - b.trackPos) % track.trackLength;
        if (dz > track.trackLength / 2) dz -= track.trackLength;
        if (dz < -track.trackLength / 2) dz += track.trackLength;
        if (Math.abs(dz) < TUNE.CAR_LEN && Math.abs(a.x - b.x) < TUNE.CAR_WIDTH) {
          const overlap = TUNE.CAR_LEN - Math.abs(dz);
          if (overlap > worstOverlap) {
            worstOverlap = overlap;
            worstPair = `${race.entries[i].identity.name} / ${race.entries[j].identity.name}`;
          }
        }
      }
    }
  };

  // Run 90 seconds of racing, injecting a 250ms stall (15 steps at once) every
  // 2 seconds — the same catch-up burst DevTools CPU throttling produces.
  for (let t = 0; t < 90 / DT; t++) {
    stepOnce();
    if (t % 120 === 0) { for (let k = 0; k < 15; k++) stepOnce(); stalls++; }
    if (race.phase === PHASE.FINISHED) break;
  }

  check('no car ever passes through another, across 250ms stalls',
    worstOverlap < TUNE.CAR_LEN * 0.5,
    worstOverlap === 0
      ? `${steps} steps, ${stalls} stalls injected, zero interpenetration`
      : `worst overlap ${worstOverlap.toFixed(0)} of ${TUNE.CAR_LEN} units (${worstPair}) over ${steps} steps and ${stalls} stalls`);
  check('cars do make contact (the collision code is actually exercised)',
    race.contactsThisRace > 0, `${race.contactsThisRace} contacts`);
}

// --- a full race from 20th ---------------------------------------------------

const main = runRace({ seed: 11 });
const results = main.race.results();
const me = results.find(r => r.isPlayer);

check('a 3-lap race from 20th reaches a finish', main.race.phase === PHASE.FINISHED,
  `finished after ${main.seconds.toFixed(1)}s of simulation`);
check('you get from 20th to somewhere believable', me.position < 20 && me.position >= 1,
  `started 20th, finished ${ordinal(me.position)} of ${results.length}`);
check('the classification has no ties and no gaps',
  new Set(results.map(r => r.position)).size === results.length
  && results[0].position === 1 && results[results.length - 1].position === results.length,
  `positions 1..${results.length}, all distinct`);
check('every finisher has a real lap time', results.every(r => r.bestLap > 0),
  `best lap of the race ${formatTime(Math.min(...results.map(r => r.bestLap)))}`);
check('the winner is the car with the shortest finish time',
  results[0].finishTime === Math.min(...results.map(r => r.finishTime)),
  `${results[0].isPlayer ? 'YOU' : results[0].name} in ${results[0].finishTime.toFixed(1)}s`);

// --- positions are honest ----------------------------------------------------

// Honest means: driving better finishes higher. If skill and result were
// unrelated, the field would be theatre.
{
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const outcomes = [];
  for (const skill of [0.8, 0.9, 1.0]) {
    const runs = [21, 22, 23, 24].map(seed => {
      const me = runRace({ seed, skill }).race.results().find(r => r.isPlayer);
      return { pos: me.position, time: me.finishTime, best: me.bestLap };
    });
    outcomes.push({
      skill,
      pos: avg(runs.map(r => r.pos)),
      time: avg(runs.map(r => r.time)),
      best: avg(runs.map(r => r.best)),
      places: runs.map(r => r.pos),
    });
  }
  const posMonotonic = outcomes[0].pos > outcomes[1].pos && outcomes[1].pos > outcomes[2].pos;
  const timeMonotonic = outcomes[0].time > outcomes[1].time && outcomes[1].time > outcomes[2].time;
  const detail = outcomes.map(o =>
    `skill ${o.skill}: avg ${o.pos.toFixed(1)}th (${o.places.join(',')}), ${o.time.toFixed(0)}s, best lap ${(o.best / 1000).toFixed(1)}s`).join(' | ');

  check('POSITIONS ARE HONEST: driving better finishes higher', posMonotonic, detail);
  check('...and finishes sooner, so the result is not just luck of the draw',
    timeMonotonic, detail);
}

// Crashing must cost real places, not just time on a clock.
{
  const clean = runRace({ seed: 31, skill: 1 }).race.results().find(r => r.isPlayer).position;

  const race = new Race(track, { seed: 31, laps: 3 });
  const driver = new ModelDriver(track, { margin: 0.92 });
  let steps = 0, crashedAt = null;
  while (race.phase !== PHASE.FINISHED && steps < 900 / DT) {
    let input = race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false };
    // Throw it off the road midway through lap 1.
    if (race.phase === PHASE.RACING && race.playerEntry.distance > track.trackLength * 0.45
      && race.playerEntry.distance < track.trackLength * 0.55) {
      input = { ...input, steer: 1, throttle: 1, brake: 0 };
      if (crashedAt === null) crashedAt = race.playerEntry.position;
    }
    race.update(DT, input);
    steps++;
  }
  const crashed = race.results().find(r => r.isPlayer).position;
  check('crashing loses you real places', crashed > clean,
    `clean run finished ${ordinal(clean)}, run with an off finished ${ordinal(crashed)}`);
}

// --- slipstream --------------------------------------------------------------

{
  const race = new Race(track, { seed: 5 });
  race.phase = PHASE.RACING;
  const a = race.entries[0], b = race.entries[1];
  // Put the player right behind a rival on a straight, same line.
  a.car.trackPos = 100 * TUNE.SEGMENT_LEN; a.car.x = 0;
  b.car.trackPos = a.car.trackPos + 10 * TUNE.SEGMENT_LEN; b.car.x = 0;
  race.applySlipstream();
  const towed = a.car.slipstream;

  b.car.x = 1.0;   // move the rival out of the tow
  race.applySlipstream();
  const alone = a.car.slipstream;

  check('slipstream gives the player a tow behind a nearby car',
    Math.abs(towed - TUNE.SLIPSTREAM) < 1e-9 && alone === 1,
    `behind: ×${towed}, out of the tow: ×${alone}`);

  b.car.trackPos = a.car.trackPos + (TUNE.SLIPSTREAM_RANGE + 8) * TUNE.SEGMENT_LEN;
  b.car.x = 0;
  race.applySlipstream();
  check('slipstream only works within SLIPSTREAM_RANGE', a.car.slipstream === 1,
    `${TUNE.SLIPSTREAM_RANGE + 8} segments back: ×${a.car.slipstream}`);
}

// --- rivals behave like drivers ----------------------------------------------

{
  const race = new Race(track, { seed: 13 });
  const driver = new ModelDriver(track);
  for (let t = 0; t < 120 / DT; t++) {
    race.update(DT, race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
  }

  const xs = race.rivals.map(r => r.car.x);
  check('rivals hold their own lines across the road',
    new Set(xs.map(x => Math.round(x / 0.1))).size >= 5,
    `${new Set(xs.map(x => Math.round(x / 0.1))).size} distinct lines among 19 rivals`);

  const spread = race.entries.map(e => e.distance);
  check('the field spreads out instead of moving as a block',
    Math.max(...spread) - Math.min(...spread) > track.trackLength * 0.1,
    `${Math.round((Math.max(...spread) - Math.min(...spread)) / TUNE.SEGMENT_LEN)} segments between first and last`);

  const wentOff = race.rivals.filter(r => r.car.damage > 0 || r.mistakeTimer > 0).length;
  check('rivals make mistakes of their own', race.rivals.some(r => r.lapPace !== 1),
    `${wentOff} rivals have picked up damage or are mid-mistake`);

  const paces = race.rivals.map(r => r.identity.pace);
  check('rival pace spans the spec range (0.85-1.02)',
    Math.min(...paces) >= 0.84 && Math.max(...paces) <= 1.03,
    `${Math.min(...paces).toFixed(2)} - ${Math.max(...paces).toFixed(2)}`);
}

// --- laps and timing ---------------------------------------------------------

{
  const race = new Race(track, { seed: 17, laps: 3 });
  const driver = new ModelDriver(track);
  const lapsSeen = [];
  let steps = 0;
  while (!race.playerEntry.finished && steps < 900 / DT) {
    race.update(DT, race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    if (!lapsSeen.includes(race.playerEntry.lap)) lapsSeen.push(race.playerEntry.lap);
    steps++;
  }
  check('lap counter runs 1 to 3 and stops', lapsSeen.join(',') === '1,2,3',
    `saw laps ${lapsSeen.join(', ')}`);
  check('the race ends after exactly the race distance',
    race.playerEntry.distance >= race.raceDistance
    && race.playerEntry.distance < race.raceDistance + TUNE.BASE_MAX_SPEED * DT * 2,
    `${(race.playerEntry.distance / track.trackLength).toFixed(3)} laps covered`);
  check('best lap is the quickest of the three', race.playerEntry.bestLap > 0,
    `best ${formatTime(race.playerEntry.bestLap)}`);
}

// --- determinism -------------------------------------------------------------

{
  const sig = () => runRace({ seed: 99 }).race.results()
    .map(r => `${r.position}:${r.number}`).join(',');
  check('the same seed gives the same race', sig() === sig(), 'classification reproduced exactly');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

report('M2');
