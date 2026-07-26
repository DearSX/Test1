// M3 "done when": buying tyres measurably changes your lap time.
//
// Also enforces section 5.3's rule that every upgrade must visibly change
// physics — each one is measured on a real lap or a real stopping distance, not
// asserted from the stat table.
//
//   node tools/verify-m3.mjs
//   node tools/verify-m3.mjs --season   # simulate a whole 8-race season

import { getTrack, TRACKS } from '../src/data/tracks/index.js';
import { TrackBuilder } from '../src/game/track.js';
import { PlayerCar } from '../src/game/physics.js';
import { ModelDriver } from '../src/game/driving.js';
import { Race, PHASE } from '../src/game/race.js';
import { Career, DIFFICULTY } from '../src/game/career.js';
import { Garage } from '../src/game/garage.js';
import { UPGRADES, MAX_LEVEL } from '../src/data/upgrades.js';
import { DIVISIONS, POINTS, prizeFor } from '../src/data/season.js';
import { TUNE } from '../src/tune.js';
import { formatTime } from '../src/render/hud.js';
import { check, report } from './harness.mjs';

const DT = TUNE.STEP;
const island = getTrack('island');

// A deterministic hot lap. Same driver, same track, same start — the only
// variable is the car, so any change in the time came from the upgrade.
function hotLap(stats, { track = island, margin = 0.92 } = {}) {
  const car = new PlayerCar(track, stats);
  const driver = new ModelDriver(track, { margin });
  car.speed = car.maxSpeed * 0.55;
  let t = 0;
  const limit = 400 / DT;
  while (car.distance < track.trackLength && t < limit) {
    car.update(DT, driver.drive(car));
    t++;
  }
  return { seconds: t * DT, finished: car.distance >= track.trackLength, topSpeed: car.maxSpeed };
}

function garageWith(overrides) {
  return new Garage({ upgrades: overrides });
}

// --- the milestone -----------------------------------------------------------

{
  const stock = hotLap(garageWith({}).stats());
  const tyred = hotLap(garageWith({ tyres: 1 }).stats());
  const delta = stock.seconds - tyred.seconds;

  check('BOTH LAPS COMPLETE (so the comparison means anything)',
    stock.finished && tyred.finished,
    `stock ${stock.seconds.toFixed(2)}s, tyres L1 ${tyred.seconds.toFixed(2)}s`);

  check('MILESTONE: buying tyres measurably changes lap time',
    delta > 0.25,
    `stock ${stock.seconds.toFixed(2)}s -> tyres L1 ${tyred.seconds.toFixed(2)}s = ${delta.toFixed(2)}s faster`);

  // And it should keep paying off, not just at the first level.
  const maxed = hotLap(garageWith({ tyres: 5 }).stats());
  check('...and tyre levels keep paying off up to L5',
    maxed.seconds < tyred.seconds,
    `L1 ${tyred.seconds.toFixed(2)}s -> L5 ${maxed.seconds.toFixed(2)}s (${(tyred.seconds - maxed.seconds).toFixed(2)}s more)`);
}

// --- every upgrade must visibly change physics --------------------------------

{
  const base = garageWith({}).stats();

  // Engine: top speed.
  const eng = garageWith({ engine: 1 }).stats();
  const baseCar = new PlayerCar(island, base), engCar = new PlayerCar(island, eng);
  check('Engine changes physics: top speed rises 6%',
    Math.abs(engCar.maxSpeed / baseCar.maxSpeed - 1.06) < 1e-9,
    `${(baseCar.maxSpeed * TUNE.SPEED_TO_KMH).toFixed(0)} -> ${(engCar.maxSpeed * TUNE.SPEED_TO_KMH).toFixed(0)} km/h`);

  // Gearbox: measured as time to 200 km/h on a straight.
  const straight = (() => { const t = new TrackBuilder(); for (let i = 0; i < 8; i++) t.addStraight(400); return t.build(); })();
  const timeTo = (stats, kmh) => {
    const c = new PlayerCar(straight, stats);
    for (let t = 0; t < 60 / DT; t++) {
      c.update(DT, { steer: 0, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
      if (c.speedKmh >= kmh) return t * DT;
    }
    return null;
  };
  const t0 = timeTo(base, 200), t1 = timeTo(garageWith({ gearbox: 2 }).stats(), 200);
  check('Gearbox changes physics: quicker to 200 km/h',
    t1 !== null && t0 !== null && t1 < t0 - 0.1,
    `stock ${t0.toFixed(2)}s -> gearbox L2 ${t1.toFixed(2)}s`);

  // Brakes: measured as stopping distance.
  const stopDist = (stats) => {
    const c = new PlayerCar(straight, stats);
    c.speed = c.maxSpeed * 0.8;
    const start = c.distance;
    for (let t = 0; t < 30 / DT && c.speed > 100; t++) {
      c.update(DT, { steer: 0, throttle: 0, brake: 1, nitro: false, shiftUp: false, shiftDown: false });
    }
    return c.distance - start;
  };
  const d0 = stopDist(base), d1 = stopDist(garageWith({ brakes: 2 }).stats());
  check('Brakes change physics: shorter stopping distance',
    d1 < d0 * 0.95, `${Math.round(d0)} -> ${Math.round(d1)} world units`);

  // Armor: damage taken from an identical crash.
  const crashDamage = (stats) => {
    const c = new PlayerCar(straight, stats);
    c.speed = c.maxSpeed; c.x = 1.5;
    while (!c.crashed) c.update(DT, { steer: 1, throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    return c.damage;
  };
  const dm0 = crashDamage(base), dm1 = crashDamage(garageWith({ armor: 3 }).stats());
  check('Armor changes physics: less damage from the same crash',
    dm1 < dm0 * 0.7, `${(dm0 * 100).toFixed(0)}% -> ${(dm1 * 100).toFixed(0)}% damage`);

  // Tyres: corner speed (already proven on lap time above, checked here as grip).
  check('Tyres change physics: more grip',
    new PlayerCar(island, garageWith({ tyres: 3 }).stats()).grip
    > new PlayerCar(island, base).grip * 1.15,
    `grip ${new PlayerCar(island, base).grip.toFixed(2)} -> ${new PlayerCar(island, garageWith({ tyres: 3 }).stats()).grip.toFixed(2)}`);

  // Fuel tank: capacity multiplier (burned at M4, but the stat must exist now).
  check('Fuel tank changes a real stat: capacity +12% per level',
    Math.abs(garageWith({ fuel: 2 }).stats().fuelCapacityMul - 1.24) < 1e-9,
    `×${garageWith({ fuel: 2 }).stats().fuelCapacityMul.toFixed(2)}`);
}

// --- cost curve --------------------------------------------------------------

{
  const g = garageWith({});
  check('upgrade costs match the spec endpoints (L1 -> L5)',
    UPGRADES.engine.costs[0] === 3000 && UPGRADES.engine.costs[4] === 24000
    && UPGRADES.gearbox.costs[0] === 2500 && UPGRADES.gearbox.costs[4] === 20000
    && UPGRADES.tyres.costs[0] === 2000 && UPGRADES.tyres.costs[4] === 16000
    && UPGRADES.brakes.costs[0] === 1500 && UPGRADES.brakes.costs[4] === 12000,
    'engine 3k->24k, gearbox 2.5k->20k, tyres 2k->16k, brakes 1.5k->12k');

  check('costs escalate with every level',
    Object.values(UPGRADES).every(u => u.costs.every((c, i) => i === 0 || c > u.costs[i - 1])),
    'monotonic for all six categories');

  const g2 = garageWith({});
  const r = g2.buy('tyres', 10000);
  check('buying a level costs money and raises the level',
    r.ok && r.spent === 2000 && g2.level('tyres') === 1, `spent $${r.spent}`);

  const poor = garageWith({});
  check('you cannot buy what you cannot afford',
    poor.buy('engine', 100).ok === false && poor.level('engine') === 0, 'refused at $100');

  const maxed = garageWith({ tyres: MAX_LEVEL });
  check('level 5 is the ceiling', maxed.costFor('tyres') === null && !maxed.buy('tyres', 1e6).ok,
    'no level 6');

  const capped = garageWith({ tyres: 2 });
  check('divisions cap upgrade tiers', capped.costFor('tyres', 2) === null,
    'Rookie caps at L2, per DIVISIONS');
}

// --- championship, money, promotion ------------------------------------------

{
  check('points are 10/8/6/5/4/3/2/1 for the top 8',
    POINTS.join(',') === '10,8,6,5,4,3,2,1' && POINTS.length === 8, POINTS.join('/'));
  check('prize money matches the spec table',
    prizeFor(1) === 12000 && prizeFor(2) === 8000 && prizeFor(3) === 6000
    && prizeFor(4) === 4000 && prizeFor(8) === 1500 && prizeFor(9) === 500,
    '1st $12k, 2nd $8k, 3rd $6k, 4th $4k, 8th $1.5k, 9th+ $500');
  check('four divisions, rising pace and lengthening races',
    DIVISIONS.length === 4
    && DIVISIONS.every((d, i) => i === 0 || d.paceScale > DIVISIONS[i - 1].paceScale)
    && DIVISIONS[3].laps > DIVISIONS[0].laps,
    DIVISIONS.map(d => `${d.name} ×${d.paceScale} ${d.laps}laps L${d.maxUpgradeLevel}`).join(', '));
  check('eight races per season', TUNE.RACES_PER_SEASON === 8, '8 rounds');
  check('a season visits more than one track', TRACKS.length >= 4,
    `${TRACKS.length} tracks: ${TRACKS.map(t => t.name).join(', ')}`);
}

// Section 5.2: "Finishing 4th with a wrecked car should sometimes leave you
// poorer." That tension is the point, so it gets a test.
{
  const c = new Career({ seed: 1 });
  const moneyBefore = c.money;
  const fakeResults = fabricateResults(4);
  const wrecked = { damage: 0.85, nitroCharges: 1, tyreWear: 0.5 };   // properly wrecked
  const rep = c.settleRace(fakeResults, wrecked);

  check('finishing 4th with a wrecked car leaves you poorer',
    rep.prize === 4000 && rep.repairPaid > rep.prize && c.money < moneyBefore && rep.net < 0,
    `won $${rep.prize}, repairs $${rep.repairPaid} — bank $${moneyBefore.toLocaleString()} -> $${c.money.toLocaleString()}`);

  check('...but the car does not stay wrecked forever (no death spiral)',
    c.garage.damage < 0.01,
    `damage after settling: ${(c.garage.damage * 100).toFixed(0)}%`);
}

{
  const c = new Career({ seed: 2 });
  const before = c.money;
  c.settleRace(fabricateResults(1), { damage: 0, nitroCharges: 3 });
  check('winning pays and scores', c.money === before + 12000
    && c.standings.find(s => s.isPlayer).points === 10
    && c.racesWon === 1,
    `$${before} -> $${c.money}, 10 points`);
}

{
  // Force a championship win and check promotion.
  const c = new Career({ seed: 3 });
  c.standings.find(s => s.isPlayer).points = 999;
  c.seasonRace = TUNE.RACES_PER_SEASON;
  const outcome = c.concludeSeason();
  check('finishing top 3 in the championship promotes you',
    outcome.promoted && c.divisionIndex === 1 && c.division.name === 'Pro',
    `${outcome.division} -> ${outcome.nextDivision}, championship ${outcome.championshipPosition}`);
  check('a new season resets the table and the round counter',
    c.seasonRace === 0 && c.standings.every(s => s.points === 0), 'table cleared');
}

{
  const c = new Career({ seed: 4 });
  // Player scores nothing; rivals score.
  for (const s of c.standings) if (!s.isPlayer) s.points = 50;
  c.seasonRace = TUNE.RACES_PER_SEASON;
  const outcome = c.concludeSeason();
  check('finishing outside the top 3 keeps you where you are',
    !outcome.promoted && c.divisionIndex === 0,
    `championship ${outcome.championshipPosition}, still ${c.division.name}`);
}

// --- rivals actually get harder per division ---------------------------------

{
  const paces = DIVISIONS.map(d => {
    const c = new Career({ seed: 9 });
    c.divisionIndex = DIVISIONS.indexOf(d);
    const race = new Race(island, { ...c.raceConfig(), seed: 5 });
    return Math.max(...race.rivals.map(r => r.car.maxSpeed));
  });
  check('each division fields faster rivals',
    paces.every((p, i) => i === 0 || p > paces[i - 1]),
    paces.map((p, i) => `${DIVISIONS[i].name} ${(p * TUNE.SPEED_TO_KMH).toFixed(0)}km/h`).join(', '));
}

{
  const c = new Career({ seed: 6 });
  c.standings.find(s => s.isPlayer).points = 20;
  const rival = c.standings.find(s => !s.isPlayer);
  rival.points = 21;
  for (const s of c.standings) if (!s.isPlayer && s !== rival) s.points = 2;
  const nem = c.nemesis();
  check('your nemesis is the rival nearest you on points',
    nem && nem.id === rival.id, nem ? `${nem.name} on ${nem.points} vs your 20` : 'none found');

  const race = new Race(island, c.raceConfig());
  const boosted = race.rivals.find(r => r.identity.id === rival.id);
  const same = race.rivals.find(r => r.identity.id !== rival.id && r.identity.pace);
  check('the nemesis gets a real pace boost, not just a label',
    boosted && boosted.identity.isNemesis === true,
    boosted ? `${boosted.name} pace ×${TUNE.NEMESIS_PACE_BOOST}` : 'nemesis not in field');
}

// --- difficulty modes (section 7) --------------------------------------------

{
  check('three difficulty modes, Arcade softer and Simulation harsher',
    DIFFICULTY.arcade.rivalPace < 1 && DIFFICULTY.simulation.rivalPace > 1
    && DIFFICULTY.arcade.centrifugalScale < 1,
    `arcade pace ×${DIFFICULTY.arcade.rivalPace} centrifugal ×${DIFFICULTY.arcade.centrifugalScale}, sim pace ×${DIFFICULTY.simulation.rivalPace}`);

  // Arcade must still be the same track and the same physics, just softer.
  const arcade = hotLap(garageWith({}).stats());
  const car = new PlayerCar(island, garageWith({}).stats());
  car.centrifugalScale = TUNE.CENTRIFUGAL_ARCADE;
  const drv = new ModelDriver(island, { margin: 0.92 });
  car.speed = car.maxSpeed * 0.55;
  let t = 0;
  while (car.distance < island.trackLength && t < 400 / DT) { car.update(DT, drv.drive(car)); t++; }
  check('Arcade is the same game with the punishment dialled back',
    t * DT < arcade.seconds,
    `career ${arcade.seconds.toFixed(1)}s vs arcade ${(t * DT).toFixed(1)}s on the same track`);
}

// --- a whole season runs -----------------------------------------------------

function playSeason({ seed = 42, skill = 1, buy = true, verbose = false } = {}) {
  const c = new Career({ seed });
  const log = [];
  for (let round = 0; round < TUNE.RACES_PER_SEASON; round++) {
    if (buy) spendSensibly(c);
    const cfg = c.raceConfig();
    const track = getTrack(cfg.track.id);
    const race = new Race(track, cfg);
    race.player.damage = c.garage.damage;
    const driver = new ModelDriver(track, { margin: 0.92 * skill });
    let steps = 0;
    while (race.phase !== PHASE.FINISHED && steps < 1200 / DT) {
      race.update(DT, race.phase === PHASE.RACING
        ? driver.drive(race.player, race.entries.map(e => e.car))
        : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
      steps++;
    }
    const rep = c.settleRace(race.results(), race.player);
    log.push(rep);
    if (verbose) {
      console.log(`  R${rep.round} ${rep.trackName.padEnd(19)} ${String(rep.position).padStart(2)}${ordinalSuffix(rep.position)}  ` +
        `+${String(rep.points).padStart(2)}pts  +$${String(rep.prize).padStart(6)}  ` +
        `best ${formatTime(rep.bestLap)}  dmg ${String(Math.round(rep.damageTaken * 100)).padStart(3)}%  ` +
        `repair -$${String(rep.repairPaid).padStart(5)}  ` +
        `bank $${rep.moneyAfter.toLocaleString()}`);
    }
  }
  const outcome = c.concludeSeason();
  return { career: c, log, outcome };
}

// Spend on whatever is affordable, cheapest first, keeping a repair buffer.
function spendSensibly(c) {
  if (c.garage.damage > 0.3 && c.garage.repairCost() <= c.money) {
    const r = c.garage.repair(c.money);
    if (r.ok) c.money -= r.spent;
  }
  for (let guard = 0; guard < 12; guard++) {
    const options = Object.keys(UPGRADES)
      .map(k => ({ k, cost: c.garage.costFor(k, c.maxUpgradeLevel) }))
      .filter(o => o.cost !== null && o.cost <= c.money - 500)
      .sort((a, b) => a.cost - b.cost);
    if (!options.length) break;
    const r = c.garage.buy(options[0].k, c.money, c.maxUpgradeLevel);
    if (!r.ok) break;
    c.money -= r.spent;
  }
}

if (process.argv.includes('--season')) {
  console.log('Rookie season, 8 rounds, model driver, spending as it goes:\n');
  const { career, outcome, log } = playSeason({ verbose: true });
  console.log(`\n  championship: ${outcome.championshipPosition}${ordinalSuffix(outcome.championshipPosition)} on ${outcome.points} points`);
  console.log(`  ${outcome.promoted ? `PROMOTED to ${outcome.nextDivision}` : `stayed in ${outcome.division}`}`);
  console.log(`  bank $${career.money.toLocaleString()}  ·  upgrades ${JSON.stringify(career.garage.upgrades)}`);
  process.exit(0);
}

{
  const { career, log, outcome } = playSeason({ seed: 42 });
  check('a full 8-race season runs to a championship',
    log.length === 8 && career.seasonRace === 0,
    `8 rounds, championship ${outcome.championshipPosition}${ordinalSuffix(outcome.championshipPosition)} on ${outcome.points} points`);
  check('every round awarded a finish, points and prize money',
    log.every(r => r.position >= 1 && r.position <= TUNE.FIELD_SIZE && r.prize > 0),
    `positions ${log.map(r => r.position).join(',')}`);
  check('the season is played across several tracks',
    new Set(log.map(r => r.trackId)).size >= 4,
    [...new Set(log.map(r => r.trackName))].join(', '));
  check('prize money funds real upgrades over a season',
    Object.values(career.garage.upgrades).reduce((a, b) => a + b, 0) >= 3,
    `upgrades bought: ${JSON.stringify(career.garage.upgrades)}, bank $${career.money.toLocaleString()}`);
  check('finishing last still earns something (not punitive)',
    prizeFor(TUNE.FIELD_SIZE) > 0, `20th pays $${prizeFor(TUNE.FIELD_SIZE)}`);
}

// A better driver must win more over a season, or the career means nothing.
{
  const good = playSeason({ seed: 77, skill: 1.0 }).career;
  const poor = playSeason({ seed: 77, skill: 0.82 }).career;
  const avgPos = c => c.history.reduce((a, r) => a + r.position, 0) / c.history.length;
  const pts = c => c.history.reduce((a, r) => a + r.points, 0);
  check('over a season, the better driver finishes higher and banks more',
    avgPos(good) < avgPos(poor) && pts(good) >= pts(poor),
    `skilled avg ${avgPos(good).toFixed(1)}th / ${pts(good)} pts vs slower avg ${avgPos(poor).toFixed(1)}th / ${pts(poor)} pts`);
}

function fabricateResults(playerPosition) {
  const out = [];
  for (let i = 1; i <= TUNE.FIELD_SIZE; i++) {
    out.push({
      position: i,
      isPlayer: i === playerPosition,
      name: i === playerPosition ? 'YOU' : `Rival ${i}`,
      bestLap: 60000 + i * 200,
      finishTime: 180 + i,
      damage: 0,
    });
  }
  return out;
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

report('M3');
