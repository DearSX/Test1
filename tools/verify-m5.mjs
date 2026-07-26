// M5 "done when": you can close the tab mid-season and come back.
//
// "Come back" has to mean more than "the numbers look similar". The strong test
// here plays half a season, serialises, throws the Career away, rebuilds it from
// storage alone, and then checks that the NEXT RACE runs identically to the one
// the original would have run. If the seed, roster or standings were lost, the
// two races diverge and the test fails.
//
//   node tools/verify-m5.mjs

import { SaveStore, SAVE_VERSION, SLOT_COUNT } from '../src/core/storage.js';
import { Career } from '../src/game/career.js';
import { Race, PHASE } from '../src/game/race.js';
import { ModelDriver } from '../src/game/driving.js';
import { getTrack } from '../src/data/tracks/index.js';
import { DIVISIONS } from '../src/data/season.js';
import { UPGRADE_KEYS } from '../src/data/upgrades.js';
import { TUNE } from '../src/tune.js';
import { check, report } from './harness.mjs';

const DT = TUNE.STEP;

// A localStorage stand-in, so the real SaveStore is what's under test.
function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    _dump: () => new Map(map),
  };
}

// Plays `rounds` races of a career, autosaving after each, exactly as main.js does.
function playRounds(career, store, slot, rounds, { skill = 1 } = {}) {
  for (let i = 0; i < rounds; i++) {
    const cfg = career.raceConfig();
    const track = getTrack(cfg.track.id);
    const race = new Race(track, cfg);
    race.player.damage = career.garage.damage;
    race.player.manualGears = career.settings.manualGears;
    const driver = new ModelDriver(track, { margin: 0.92 * skill });
    let steps = 0;
    while (race.phase !== PHASE.FINISHED && steps < 1200 / DT) {
      race.update(DT, race.phase === PHASE.RACING
        ? driver.drive(race.player, race.entries.map(e => e.car))
        : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
      steps++;
    }
    career.settleRace(race.results(), race.player, {
      pitRepairDamage: race.playerPitRepairDamage,
    });
    store.write(slot, career.toSave());
  }
}

// Signature of the race a career is about to run. Two careers with the same
// signature will produce the same race, car for car.
function nextRaceSignature(career) {
  const cfg = career.raceConfig();
  const track = getTrack(cfg.track.id);
  const race = new Race(track, cfg);
  const driver = new ModelDriver(track, { margin: 0.92 });
  let steps = 0;
  while (race.phase !== PHASE.FINISHED && steps < 1200 / DT) {
    race.update(DT, race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    steps++;
  }
  return {
    track: cfg.track.id,
    laps: cfg.laps,
    nemesis: cfg.nemesisId,
    classification: race.results().map(r => `${r.position}:${r.number}`).join(','),
    playerPosition: race.results().find(r => r.isPlayer).position,
  };
}

// --- the schema --------------------------------------------------------------

{
  const store = new SaveStore(fakeLocalStorage());
  const c = new Career({ seed: 12345 });
  c.money = 9400;
  c.garage.upgrades.tyres = 2;
  c.garage.upgrades.engine = 1;
  c.garage.damage = 0.15;
  c.garage.tyreCompound = 'soft';
  c.bestLaps.island = 56321;
  c.racesWon = 2;
  c.settings.manualGears = true;
  c.standings.find(s => s.isPlayer).points = 18;

  const save = c.toSave();
  check('the save carries every field section 6 asks for',
    save.version === SAVE_VERSION
    && typeof save.driverName === 'string'
    && typeof save.division === 'string'
    && Number.isInteger(save.seasonRace)
    && typeof save.money === 'number'
    && typeof save.championshipPoints === 'number'
    && Array.isArray(save.standings)
    && save.car && save.car.upgrades && save.car.model !== undefined
    && save.records && save.records.bestLap && save.records.racesWon !== undefined
    && save.settings && save.settings.difficulty !== undefined,
    `version ${save.version}, division "${save.division}", ${save.standings.length} standings rows`);

  check('version is stamped from day one', save.version === 1, `v${save.version}`);

  const back = Career.fromSave(save);
  check('a career survives a round trip byte for byte',
    JSON.stringify(back.toSave()) === JSON.stringify(save), 'identical re-serialisation');

  check('the restored car has the same upgrades, damage and compound',
    UPGRADE_KEYS.every(k => back.garage.level(k) === c.garage.level(k))
    && back.garage.damage === c.garage.damage
    && back.garage.tyreCompound === 'soft',
    `tyres L${back.garage.level('tyres')}, engine L${back.garage.level('engine')}, ${back.garage.tyreCompound}`);

  check('settings survive (manual gears, difficulty, mute)',
    back.settings.manualGears === true && back.difficulty === c.difficulty
    && back.settings.muted === c.settings.muted,
    `manualGears ${back.settings.manualGears}, difficulty ${back.difficulty}`);

  check('records survive', back.bestLaps.island === 56321 && back.racesWon === 2,
    `best lap ${back.bestLaps.island}ms, ${back.racesWon} wins`);
}

// Division is stored by id, so reordering the table can't move a career.
{
  const store = new SaveStore(fakeLocalStorage());
  const c = new Career({ seed: 1, divisionIndex: 2 });
  const save = c.toSave();
  check('division is stored by name, not by index',
    save.division === DIVISIONS[2].id && Career.fromSave(save).division.id === DIVISIONS[2].id,
    `"${save.division}" -> ${Career.fromSave(save).division.name}`);
}

// --- slots -------------------------------------------------------------------

{
  const store = new SaveStore(fakeLocalStorage());
  check('three save slots, all empty to begin with',
    store.summaries().length === SLOT_COUNT && store.summaries().every(s => s.empty),
    `${SLOT_COUNT} slots`);

  const a = new Career({ seed: 111, driverName: 'ALEX' });
  a.money = 4000;
  const b = new Career({ seed: 222, driverName: 'BROOKE' });
  b.money = 31000;
  b.divisionIndex = 1;
  store.write(0, a.toSave());
  store.write(2, b.toSave());

  const sums = store.summaries();
  check('slots hold independent careers',
    sums[0].driverName === 'ALEX' && sums[1].empty && sums[2].driverName === 'BROOKE'
    && sums[2].division === 'pro',
    `slot 1 ALEX $${sums[0].money}, slot 2 empty, slot 3 BROOKE (${sums[2].division})`);

  check('the last slot played is remembered', store.lastSlot() === 2, `slot ${store.lastSlot() + 1}`);

  store.clear(0);
  check('a slot can be deleted without touching the others',
    store.summaries()[0].empty && store.summaries()[2].driverName === 'BROOKE', 'slot 1 cleared');
}

// --- corrupt and hostile input -----------------------------------------------

{
  const backend = fakeLocalStorage();
  const store = new SaveStore(backend);
  backend.setItem('velocity3000.slot.1', '{not json at all');
  check('a corrupt slot reads as empty instead of crashing',
    store.read(1) === null && store.summaries()[1].empty, 'handled');

  backend.setItem('velocity3000.slot.1', JSON.stringify({ version: 999, driverName: 'FUTURE' }));
  check('a save from a newer version is refused, not misread',
    store.read(1) === null, 'refused v999');

  check('importing junk gives a readable error, not an exception',
    store.fromJsonText('hello').ok === false
    && typeof store.fromJsonText('hello').error === 'string',
    `"${store.fromJsonText('hello').error}"`);

  check('importing valid JSON that is not a save is refused',
    store.fromJsonText('{"hello":"world"}').ok === false,
    `"${store.fromJsonText('{"hello":"world"}').error}"`);
}

{
  // Storage that throws on write (private browsing) must not break the game.
  const hostile = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  const store = new SaveStore(hostile);
  const c = new Career({ seed: 3 });
  check('a blocked/full storage fails soft and reports it',
    store.write(0, c.toSave()) === false && store.lastError instanceof Error,
    `write refused: ${store.lastError.message}`);
}

// --- export / import ---------------------------------------------------------

{
  const store = new SaveStore(fakeLocalStorage());
  const c = new Career({ seed: 4242, driverName: 'EXPORTER' });
  c.money = 17500;
  c.garage.upgrades.brakes = 3;
  c.seasonRace = 5;
  c.standings.find(s => s.isPlayer).points = 22;

  const text = store.toJsonText(c.toSave());
  check('export produces readable JSON a human could inspect',
    text.includes('"driverName": "EXPORTER"') && text.includes('\n'),
    `${text.length} bytes, pretty-printed`);

  const imported = store.fromJsonText(text);
  check('import accepts what export produced', imported.ok, 'round trip through a file');

  const restored = Career.fromSave(imported.save);
  check('an imported career is the same career',
    restored.money === 17500 && restored.seasonRace === 5
    && restored.garage.level('brakes') === 3
    && restored.standings.find(s => s.isPlayer).points === 22,
    `$${restored.money}, round ${restored.seasonRace + 1}, brakes L${restored.garage.level('brakes')}`);
}

// --- THE MILESTONE ----------------------------------------------------------

{
  const backend = fakeLocalStorage();
  const store = new SaveStore(backend);

  // Play four rounds of an eight-race season, autosaving as we go.
  const original = new Career({ seed: 987654, driverName: 'MIDSEASON' });
  original.settings.manualGears = true;
  playRounds(original, store, 1, 4);

  const before = {
    money: original.money,
    round: original.seasonRace,
    points: original.standings.find(s => s.isPlayer).points,
    upgrades: JSON.stringify(original.garage.upgrades),
    history: original.history.length,
    bestLaps: JSON.stringify(original.bestLaps),
    table: original.table().map(r => `${r.position}:${r.name}:${r.points}`).join('|'),
    nemesis: original.nemesis()?.id,
  };

  check('MILESTONE setup: four rounds played, mid-season',
    before.round === 4 && before.round < TUNE.RACES_PER_SEASON && before.history === 4,
    `round ${before.round + 1} of ${TUNE.RACES_PER_SEASON}, $${before.money}, ${before.points} points`);

  // "Close the tab": drop everything and rebuild from storage alone.
  const reopened = Career.fromSave(new SaveStore(backend).read(1));

  const after = {
    money: reopened.money,
    round: reopened.seasonRace,
    points: reopened.standings.find(s => s.isPlayer).points,
    upgrades: JSON.stringify(reopened.garage.upgrades),
    history: reopened.history.length,
    bestLaps: JSON.stringify(reopened.bestLaps),
    table: reopened.table().map(r => `${r.position}:${r.name}:${r.points}`).join('|'),
    nemesis: reopened.nemesis()?.id,
  };

  const mismatches = Object.keys(before).filter(k => before[k] !== after[k]);
  check('MILESTONE: reopening mid-season restores everything',
    mismatches.length === 0,
    mismatches.length
      ? `lost: ${mismatches.join(', ')}`
      : `round ${after.round + 1}, $${after.money}, ${after.points} points, ` +
        `championship table and nemesis (${after.nemesis}) all intact`);

  // The strong version: the next race must play out identically. This is what
  // catches a lost seed or a rebuilt-from-scratch roster, which the field-by-field
  // comparison above would happily pass.
  const sigOriginal = nextRaceSignature(original);
  const sigReopened = nextRaceSignature(reopened);
  check('MILESTONE: and the next race runs identically, car for car',
    sigOriginal.classification === sigReopened.classification
    && sigOriginal.track === sigReopened.track
    && sigOriginal.nemesis === sigReopened.nemesis,
    sigOriginal.classification === sigReopened.classification
      ? `round 5 at ${sigOriginal.track}: identical 20-car classification, player ${sigOriginal.playerPosition}th both times`
      : `diverged — the reloaded career races a different field`);
}

// Carrying on from a reload has to keep working, not just look right once.
{
  const backend = fakeLocalStorage();
  const store = new SaveStore(backend);
  const c = new Career({ seed: 55, driverName: 'CONTINUE' });
  playRounds(c, store, 0, 3);

  const resumed = Career.fromSave(store.read(0));
  playRounds(resumed, store, 0, 5);

  check('a reloaded career can finish its season and be promoted or not',
    resumed.seasonComplete && resumed.history.length === 8,
    `8 rounds complete, championship ${resumed.table().find(r => r.isPlayer).position}th`);

  const outcome = resumed.concludeSeason();
  store.write(0, resumed.toSave());
  const nextSeason = Career.fromSave(store.read(0));
  check('a season transition is saved too, so promotion survives a reload',
    nextSeason.seasonRace === 0
    && nextSeason.division.id === resumed.division.id
    && nextSeason.standings.every(s => s.points === 0),
    `now ${nextSeason.division.name}, round 1, table reset${outcome.promoted ? ' (promoted)' : ''}`);
}

// --- autosave points ---------------------------------------------------------

{
  const backend = fakeLocalStorage();
  const store = new SaveStore(backend);
  const c = new Career({ seed: 8, driverName: 'AUTOSAVE' });

  store.write(0, c.toSave());
  const atStart = store.read(0).money;

  // A purchase.
  const r = c.garage.buy('brakes', c.money, c.maxUpgradeLevel);
  c.money -= r.spent;
  store.write(0, c.toSave());
  const afterBuy = store.read(0);

  check('a shop purchase is written immediately',
    afterBuy.money === atStart - r.spent && afterBuy.car.upgrades.brakes === 1,
    `$${atStart} -> $${afterBuy.money}, brakes L${afterBuy.car.upgrades.brakes}`);

  // A race finish.
  playRounds(c, store, 0, 1);
  const afterRace = store.read(0);
  check('a race finish is written immediately',
    afterRace.seasonRace === 1 && afterRace.history.length === 1,
    `round ${afterRace.seasonRace + 1}, ${afterRace.history.length} race in the books`);
}

report('M5');
