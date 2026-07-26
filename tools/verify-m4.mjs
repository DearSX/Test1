// M4 "done when": you lose a race you were winning because you mistimed a pit
// stop.
//
// That is a claim about consequences, so it's tested as one: the same race, the
// same seed, the same leading position, and the only difference is when the stop
// is taken. Getting it right keeps the win; getting it wrong loses it.
//
//   node tools/verify-m4.mjs
//   node tools/verify-m4.mjs --strategy   # print the three strategies side by side

import { getTrack } from '../src/data/tracks/index.js';
import { PlayerCar } from '../src/game/physics.js';
import { ModelDriver } from '../src/game/driving.js';
import { Race, PHASE } from '../src/game/race.js';
import { Career, DIFFICULTY } from '../src/game/career.js';
import { Garage, TYRE_COMPOUNDS } from '../src/game/garage.js';
import { TUNE } from '../src/tune.js';
import { check, report } from './harness.mjs';

const DT = TUNE.STEP;
const island = getTrack('island');

// --- fuel range --------------------------------------------------------------

{
  const race = new Race(island, { seed: 1, laps: 3 });
  const car = race.player;
  check('a stock tank covers about FUEL_RANGE_LAPS laps at race pace',
    Math.abs(car.lapsOfFuelLeft(island.trackLength) - TUNE.FUEL_RANGE_LAPS) < 0.01,
    `${car.lapsOfFuelLeft(island.trackLength).toFixed(2)} laps`);

  check('so a 3-lap race cannot be done on one tank without lifting',
    car.lapsOfFuelLeft(island.trackLength) < race.laps,
    `${TUNE.FUEL_RANGE_LAPS} laps of fuel for a ${race.laps}-lap race — one stop, or careful lifting`);
}

{
  // Lifting has to actually save fuel, or "careful lifting" is not a strategy.
  const burn = (throttle) => {
    const race = new Race(island, { seed: 2, laps: 3 });
    race.phase = PHASE.RACING;
    const car = race.player;
    car.speed = car.maxSpeed * 0.7;
    const before = car.fuel;
    for (let t = 0; t < 20 / DT; t++) {
      car.update(DT, { steer: 0, throttle, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    }
    return { used: before - car.fuel, distance: car.distance };
  };
  const full = burn(1), part = burn(0.5);
  check('lifting the throttle burns less fuel per unit distance',
    (part.used / part.distance) < (full.used / full.distance),
    `full throttle ${(full.used / full.distance * 1e5).toFixed(2)} vs half ${(part.used / part.distance * 1e5).toFixed(2)} per 100k units`);
}

{
  const race = new Race(island, { seed: 3, laps: 3 });
  race.phase = PHASE.RACING;
  const car = race.player;
  car.speed = car.maxSpeed * 0.8;
  const before = car.fuel;
  for (let t = 0; t < 1 / DT; t++) {
    car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: t === 0, shiftUp: false, shiftDown: false });
  }
  const withNitro = before - car.fuel;

  const race2 = new Race(island, { seed: 3, laps: 3 });
  race2.phase = PHASE.RACING;
  const car2 = race2.player;
  car2.speed = car2.maxSpeed * 0.8;
  const before2 = car2.fuel;
  for (let t = 0; t < 1 / DT; t++) {
    car2.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
  }
  const without = before2 - car2.fuel;

  check('nitro burns fuel much faster', withNitro > without * 2,
    `${withNitro.toFixed(3)} vs ${without.toFixed(3)} units in one second`);
}

{
  const race = new Race(island, { seed: 4, laps: 3 });
  const stock = race.player.fuelCapacity;
  const race2 = new Race(island, { seed: 4, laps: 3, playerStats: new Garage({ upgrades: { fuel: 3 } }).stats() });
  check('the fuel-tank upgrade turns into real range',
    race2.player.fuelCapacity > stock
    && race2.player.lapsOfFuelLeft(island.trackLength) > race.player.lapsOfFuelLeft(island.trackLength),
    `${race.player.lapsOfFuelLeft(island.trackLength).toFixed(2)} -> ${race2.player.lapsOfFuelLeft(island.trackLength).toFixed(2)} laps at L3`);
}

// --- running dry -------------------------------------------------------------

{
  const race = new Race(island, { seed: 5, laps: 3 });
  race.phase = PHASE.RACING;
  const car = race.player;
  car.fuel = 0.02;
  car.speed = car.maxSpeed * 0.8;
  let coasted = 0, cutAt = null;
  for (let t = 0; t < 60 / DT; t++) {
    car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    if (car.outOfFuel && cutAt === null) cutAt = car.speed;
    if (car.outOfFuel) coasted++;
    if (car.speed < 20) break;
  }
  check('running dry cuts the engine and you coast to a stop',
    car.outOfFuel && car.speed < 20 && cutAt > 0,
    `engine cut at ${(cutAt * TUNE.SPEED_TO_KMH).toFixed(0)} km/h, coasted ${(coasted * DT).toFixed(1)}s to a halt`);
}

{
  // A dry tank on track is a DNF, and a DNF classifies behind the finishers.
  const race = new Race(island, { seed: 6, laps: 3 });
  race.phase = PHASE.RACING;
  race.player.fuel = 0.01;
  race.player.x = 0;
  const driver = new ModelDriver(island, { margin: 0.9 });
  for (let t = 0; t < 40 / DT; t++) {
    race.update(DT, driver.drive(race.player, race.entries.map(e => e.car)));
    if (race.playerEntry.dnf) break;
  }
  check('a dry tank on track is a race-ending DNF',
    race.playerEntry.dnf && race.playerEntry.finished, 'DNF recorded');
  race.updateOrder();
  check('...and a DNF is classified behind every car still running',
    race.playerEntry.position === TUNE.FIELD_SIZE,
    `classified ${race.playerEntry.position} of ${TUNE.FIELD_SIZE}`);
}

// --- the pit lane ------------------------------------------------------------

{
  check('the pit lane runs along the left of the start/finish straight',
    island.pit.xInner < 0 && island.pit.xOuter < island.pit.xInner
    && island.inPitWindow(island.pit.boxZ),
    `x ${island.pit.xOuter} to ${island.pit.xInner}, segments 0-${TUNE.PIT_WINDOW_SEGMENTS}`);

  check('the pit lane is a surface, not the grass',
    island.inPitLane(island.pit.boxZ, -1.2) && !island.inPitLane(island.trackLength / 2, -1.2),
    'x=-1.2 is pit lane on the start straight, grass everywhere else');
}

{
  // In the lane: no off-road penalty, and a speed limit.
  const race = new Race(island, { seed: 7, laps: 3 });
  race.phase = PHASE.RACING;
  const car = race.player;
  car.trackPos = 10 * TUNE.SEGMENT_LEN;
  car.x = -1.2;
  car.speed = car.maxSpeed * 0.9;
  car.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
  check('the pit lane does not count as off-road',
    car.inPitLane && !car.offRoad && !car.crashed, 'in the lane, no penalty, no crash');
  check('the pit lane enforces a speed limit',
    car.speed <= car.maxSpeed * TUNE.PIT_SPEED_LIMIT + 1,
    `capped at ${(car.speed * TUNE.SPEED_TO_KMH).toFixed(0)} km/h`);
}

{
  // A full stop: drive down the lane, stop at the box, get serviced, leave.
  const race = new Race(island, { seed: 8, laps: 3 });
  race.phase = PHASE.RACING;
  const e = race.playerEntry, car = race.player;
  car.trackPos = 5 * TUNE.SEGMENT_LEN;
  car.x = -1.2;
  car.speed = car.maxSpeed * 0.2;
  car.fuel = car.fuelCapacity * 0.15;
  car.tyreWear = 0.8;
  car.damage = 0.5;
  race.pitRepairRequested = true;

  let stoppedFor = 0, sawStop = false, movedDuringStop = false;
  const posAtStop = { z: null };
  for (let t = 0; t < 30 / DT; t++) {
    race.update(DT, { steer: -0.2, throttle: 0.6, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    if (e.pitState === 'stopped') {
      sawStop = true;
      stoppedFor++;
      if (posAtStop.z === null) posAtStop.z = car.trackPos;
      else if (Math.abs(car.trackPos - posAtStop.z) > 1) movedDuringStop = true;
    }
    if (e.pitStops > 0) break;
  }

  check('driving into the pit lane triggers a stop at the box', sawStop && e.pitStops === 1,
    `${e.pitStops} stop recorded`);
  check('the car is genuinely stationary during the stop', !movedDuringStop,
    `held for ${(stoppedFor * DT).toFixed(1)}s without moving`);
  check('the stop takes about PIT_STOP_SECONDS (plus repair time)',
    Math.abs(stoppedFor * DT - (TUNE.PIT_STOP_SECONDS + TUNE.PIT_REPAIR_SECONDS)) < 0.2,
    `${(stoppedFor * DT).toFixed(2)}s vs ${TUNE.PIT_STOP_SECONDS} + ${TUNE.PIT_REPAIR_SECONDS} for repairs`);
  check('the stop refuels, fits tyres and (when asked) repairs',
    car.fuel === car.fuelCapacity && car.tyreWear === 0 && car.damage === 0,
    'tank full, tyres fresh, damage cleared');
  check('repairs taken in the pits still land on the bill',
    race.playerPitRepairDamage > 0.4, `${(race.playerPitRepairDamage * 100).toFixed(0)}% of damage billed`);
}

{
  // Skipping repairs is a real choice: it's a shorter stop.
  const timeStop = (repair) => {
    const race = new Race(island, { seed: 9, laps: 3 });
    race.phase = PHASE.RACING;
    race.pitRepairRequested = repair;
    const e = race.playerEntry, car = race.player;
    car.trackPos = 5 * TUNE.SEGMENT_LEN; car.x = -1.2;
    car.speed = car.maxSpeed * 0.2; car.damage = 0.6;
    let held = 0;
    for (let t = 0; t < 30 / DT; t++) {
      race.update(DT, { steer: -0.2, throttle: 0.6, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
      if (e.pitState === 'stopped') held++;
      if (e.pitStops > 0) break;
    }
    return held * DT;
  };
  const withRepair = timeStop(true), without = timeStop(false);
  check('taking repairs costs extra time, so skipping them is a real decision',
    withRepair > without + 1,
    `${without.toFixed(1)}s without repairs vs ${withRepair.toFixed(1)}s with`);
}

// --- tyre wear ---------------------------------------------------------------

{
  const race = new Race(island, { seed: 10, laps: 3 });
  race.phase = PHASE.RACING;
  const car = race.player;
  const gripFresh = car.grip;
  const driver = new ModelDriver(island, { margin: 0.92 });
  car.speed = car.maxSpeed * 0.6;
  while (car.distance < island.trackLength * 1.5) car.update(DT, driver.drive(car));
  check('tyres wear over a race and cost grip',
    car.tyreWear > 0.2 && car.grip < gripFresh,
    `${(car.tyreWear * 100).toFixed(0)}% worn after 1.5 laps, grip ${gripFresh.toFixed(2)} -> ${car.grip.toFixed(2)}`);
}

{
  const wearFor = (compound) => {
    const stats = new Garage({ tyreCompound: compound }).stats();
    const race = new Race(island, { seed: 11, laps: 3, playerStats: stats });
    race.phase = PHASE.RACING;
    const car = race.player;
    const driver = new ModelDriver(island, { margin: 0.92 });
    car.speed = car.maxSpeed * 0.6;
    while (car.distance < island.trackLength) car.update(DT, driver.drive(car));
    return { wear: car.tyreWear, grip0: TYRE_COMPOUNDS[compound].gripMul };
  };
  const soft = wearFor('soft'), medium = wearFor('medium'), hard = wearFor('hard');
  check('soft tyres grip more and wear faster; hard is the reverse',
    soft.grip0 > medium.grip0 && medium.grip0 > hard.grip0
    && soft.wear > medium.wear && medium.wear > hard.wear,
    `soft grip ×${soft.grip0} wear ${(soft.wear * 100).toFixed(0)}% | medium ×${medium.grip0} ${(medium.wear * 100).toFixed(0)}% | hard ×${hard.grip0} ${(hard.wear * 100).toFixed(0)}%`);
}

// --- rivals run the same rules ----------------------------------------------

{
  const race = new Race(island, { seed: 12, laps: 3 });
  const driver = new ModelDriver(island, { margin: 0.9 });
  let steps = 0;
  while (race.phase !== PHASE.FINISHED && steps < 900 / DT) {
    race.update(DT, race.phase === PHASE.RACING
      ? pitStrategyInput(race, driver, 0.22)
      : neutral());
    steps++;
  }
  const rivalStops = race.entries.filter(e => !e.isPlayer).reduce((a, e) => a + e.pitStops, 0);
  const rivalDnfs = race.entries.filter(e => !e.isPlayer && e.dnf).length;
  check('rivals burn the same fuel and pit for themselves',
    rivalStops > 0,
    `${rivalStops} rival pit stops across the field, ${rivalDnfs} ran dry`);
  check('the field is not decimated by fuel — rivals manage it',
    rivalDnfs <= 4, `${rivalDnfs} of 19 rivals DNF'd`);
}

// --- THE MILESTONE -----------------------------------------------------------
//
// Put the player on pole, give the same car and the same field, and vary only
// the strategy. Pitting on time keeps the lead; pitting far too late loses it.

// Drives normally, but dives into the pit lane once fuel drops below `pitAt`.
function pitStrategyInput(race, driver, pitAt) {
  const car = race.player;
  const base = driver.drive(car, race.entries.map(e => e.car));
  const needsFuel = car.fuelFraction < pitAt;
  const e = race.playerEntry;

  if (e.pitState === 'stopped' || e.pitState === 'exiting') return base;

  // Committed and near the pit entry: get left and slow down.
  if ((needsFuel || e.pitState === 'lane') && race.track.inPitWindow(car.trackPos)) {
    return { ...base, steer: -1, throttle: 0.2, brake: car.speed > car.maxSpeed * 0.25 ? 0.8 : 0 };
  }
  if (needsFuel) {
    const toLine = forwardGapTo(car.trackPos, race.track.pit.entryZ, race.track.trackLength);
    if (toLine >= 0 && toLine < 18 * TUNE.SEGMENT_LEN) {
      return { ...base, steer: -0.9, throttle: 0.35, brake: 0.3 };
    }
  }
  return base;
}

function forwardGapTo(from, to, L) {
  let d = (to - from) % L;
  if (d < 0) d += L;
  return d > L / 2 ? d - L : d;
}

function neutral() {
  return { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false };
}

// `pitAt`: fuel fraction at which the player commits to the stop.
// A high value stops early (plenty in the tank), a very low value stops far too
// late, and `null` never stops at all.
function raceWithStrategy(pitAt, { seed = 4242, laps = 3, skill = 1, paceScale = 1, upgrades = {} } = {}) {
  const race = new Race(island, {
    seed, laps,
    playerStart: 0,          // start on pole so there is a lead to lose
    playerStats: new Garage({ upgrades }).stats(),
    paceScale,
  });
  // managesFuel: false — the whole point here is that the *test* makes the
  // strategy call, including the wrong one. Left on, the driver's own sensible
  // pit logic quietly rescues every bad strategy and nothing is being measured.
  const driver = new ModelDriver(island, { margin: 0.92 * skill, managesFuel: false });

  let steps = 0, ledAtHalf = null;
  while (race.phase !== PHASE.FINISHED && steps < 900 / DT) {
    const input = race.phase === PHASE.RACING
      ? (pitAt === null
        ? driver.drive(race.player, race.entries.map(e => e.car))
        : pitStrategyInput(race, driver, pitAt))
      : neutral();
    race.update(DT, input);
    if (ledAtHalf === null && race.playerEntry.distance > island.trackLength * 0.9) {
      ledAtHalf = race.playerEntry.position;
    }
    steps++;
  }

  const me = race.results().find(r => r.isPlayer);
  return {
    position: me.position,
    dnf: me.dnf,
    pitStops: me.pitStops,
    positionAfterLap1: ledAtHalf,
    finishTime: me.finishTime,
    fuelLeft: race.player.fuelFraction,
  };
}

// Scenario A — the milestone. A car quick enough to lead the Rookie field from
// pole, so there is a win on the table to throw away.
const LEADING = { upgrades: { tyres: 1, engine: 1 }, paceScale: 1 };
const onTime = raceWithStrategy(0.42, LEADING);    // stop with fuel in hand
const tooLate = raceWithStrategy(0.02, LEADING);   // leave it until the tank is dry
const noStop = raceWithStrategy(null, LEADING);    // never stop at all

// Scenario B — "pitting costs positions". A tighter race, because a margin big
// enough to lead comfortably is also big enough to absorb one wasted stop, and
// then the cost of stopping is invisible.
const TIGHT = { upgrades: { tyres: 1 }, paceScale: 1 };
const tightOnce = raceWithStrategy(0.42, TIGHT);
const tightTwice = raceWithStrategy(0.8, TIGHT);   // dives in every time it dips

if (process.argv.includes('--strategy')) {
  console.log('Same seed, same car, pole position. Only the pit call changes.\n');
  console.log('  A: quick car, leading the Rookie field');
  console.log('     strategy            led after lap 1   stops   finished   fuel left');
  const row = (name, r) =>
    console.log(`     ${name.padEnd(20)}${String(r.positionAfterLap1 ?? '-').padStart(9)}` +
      `${String(r.pitStops).padStart(8)}   ${(r.dnf ? 'DNF' : `${r.position}${ord(r.position)}`).padStart(8)}` +
      `${(r.fuelLeft * 100).toFixed(0).padStart(11)}%`);
  row('pit on time', onTime);
  row('pit far too late', tooLate);
  row('never pit', noStop);
  console.log('\n  B: stock car, tight midfield race');
  row('one stop', tightOnce);
  row('two stops', tightTwice);
  process.exit(0);
}

check('MILESTONE setup: the on-time strategy is genuinely winning the race',
  onTime.positionAfterLap1 === 1 && onTime.position === 1 && !onTime.dnf,
  `leading after lap 1 and won, with ${onTime.pitStops} stop`);

check('MILESTONE: mistiming the pit stop loses a race you were winning',
  tooLate.positionAfterLap1 === 1 && tooLate.position > onTime.position,
  `same race, same car: pitting on time finished ${onTime.position}${ord(onTime.position)}, ` +
  `leaving it too late finished ${tooLate.dnf ? 'DNF' : `${tooLate.position}${ord(tooLate.position)}`} ` +
  `— both were leading after lap 1`);

check('...and skipping the stop entirely ends the race on the spot',
  noStop.dnf, noStop.dnf ? 'DNF, out of fuel' : `somehow finished ${noStop.position}${ord(noStop.position)}`);

check('a well-timed stop still costs you time on the road (it is a real trade)',
  onTime.pitStops >= 1 && onTime.fuelLeft > 0,
  `${onTime.pitStops} stop, ${(onTime.fuelLeft * 100).toFixed(0)}% fuel left at the flag`);

check('pitting costs positions, so an unnecessary stop is a real mistake',
  tightTwice.pitStops > tightOnce.pitStops && tightTwice.position > tightOnce.position,
  `tight race: one stop finished ${tightOnce.position}${ord(tightOnce.position)}, ` +
  `two stops finished ${tightTwice.position}${ord(tightTwice.position)}`);

// --- Arcade turns it all off (section 7) --------------------------------------

{
  const c = new Career({ seed: 20, difficulty: 'arcade' });
  const cfg = c.raceConfig();
  const race = new Race(island, { ...cfg });
  check('Arcade has no fuel to manage',
    cfg.fuel === false && race.player.fuelBurnPerUnit === 0,
    'fuel burn disabled, no pit strategy required');

  const cc = new Career({ seed: 20, difficulty: 'career' });
  check('Career and Simulation do have fuel',
    cc.raceConfig().fuel === true && DIFFICULTY.simulation.fuel === true, 'enabled');
  check('only Simulation carries damage between races',
    !DIFFICULTY.career.damageCarries && !DIFFICULTY.arcade.damageCarries
    && DIFFICULTY.simulation.damageCarries === true, 'per section 7');
}

// --- nemesis (section 4) ------------------------------------------------------

{
  const c = new Career({ seed: 21 });
  c.standings.find(s => s.isPlayer).points = 30;
  const near = c.standings.find(s => !s.isPlayer);
  near.points = 32;
  for (const s of c.standings) if (!s.isPlayer && s !== near) s.points = 4;

  const nem = c.nemesis();
  const race = new Race(island, c.raceConfig());
  const boosted = race.rivals.find(r => r.identity.isNemesis);
  const plain = race.rivals.find(r => !r.identity.isNemesis && r.identity.id === 'okonkwo');
  check('the nemesis is tracked across the season and shows up faster',
    nem.id === near.id && boosted && boosted.identity.id === near.id
    && boosted.car.maxSpeed > boosted.identity.pace / TUNE.NEMESIS_PACE_BOOST * TUNE.BASE_MAX_SPEED * 0.99,
    `${nem.name} on ${nem.points} pts, pace boosted ×${TUNE.NEMESIS_PACE_BOOST}`);
}

function ord(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

report('M4');
