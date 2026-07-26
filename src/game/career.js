// Career: season, championship points, prize money, division progression.
// Section 5.
//
// The pressure in this mode comes from one relationship: rival cars get faster
// per division faster than your winnings let you upgrade. Repair costs come out
// of the same pot as upgrades, so a scrappy 4th can leave you poorer than a
// careful 8th.

import { DIVISIONS, POINTS, prizeFor } from '../data/season.js';
import { Garage } from './garage.js';
import { buildRoster } from '../data/rivals.js';
import { TRACKS } from '../data/tracks/index.js';
import { makeRng } from '../core/rng.js';
import { MAX_LEVEL } from '../data/upgrades.js';
import { TUNE } from '../tune.js';

export class Career {
  constructor(init = {}) {
    this.driverName = init.driverName ?? 'DRIVER';
    this.divisionIndex = init.divisionIndex ?? 0;
    this.seasonRace = init.seasonRace ?? 0;      // 0-based, 8 races per season
    this.money = init.money ?? TUNE.STARTING_MONEY;
    this.seed = init.seed ?? ((Math.random() * 1e9) | 0);
    this.garage = new Garage(init.car);
    this.difficulty = init.difficulty ?? 'career';
    this.seasonsWon = init.seasonsWon ?? 0;
    this.racesWon = init.racesWon ?? 0;
    this.bestLaps = init.bestLaps ?? {};          // trackId -> ms
    this.history = init.history ?? [];            // one entry per race finished
    this.lastRaceReport = null;

    this.standings = init.standings ?? this.freshStandings();
  }

  get division() { return DIVISIONS[this.divisionIndex]; }
  get racesPerSeason() { return TUNE.RACES_PER_SEASON; }
  get seasonComplete() { return this.seasonRace >= this.racesPerSeason; }

  // The championship table starts each season from zero, with the same field.
  freshStandings() {
    const rng = makeRng(this.seed + this.divisionIndex * 7919);
    const roster = buildRoster(TUNE.FIELD_SIZE, this.division.paceScale, rng);
    const rows = roster.map(r => ({ id: r.id, name: r.name, paint: r.paint, points: 0, isPlayer: false }));
    rows.unshift({ id: 'player', name: this.driverName, paint: this.garage.paint, points: 0, isPlayer: true });
    return rows;
  }

  // Track for the current round. Eight races cycle the available tracks.
  get track() {
    return TRACKS[this.seasonRace % TRACKS.length];
  }

  get maxUpgradeLevel() {
    return Math.min(MAX_LEVEL, this.division.maxUpgradeLevel);
  }

  // Section 4: the rival closest to you in points is your nemesis, gets a small
  // pace boost, and is shown before the race. Wired up properly at M4.
  nemesis() {
    const table = this.table();
    const meIndex = table.findIndex(r => r.isPlayer);
    if (meIndex === -1) return null;
    const neighbours = [table[meIndex - 1], table[meIndex + 1]].filter(Boolean);
    if (!neighbours.length) return null;
    const me = table[meIndex];
    return neighbours.reduce((a, b) =>
      Math.abs(a.points - me.points) <= Math.abs(b.points - me.points) ? a : b);
  }

  // Standings sorted, with positions.
  table() {
    return this.standings.slice()
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, position: i + 1 }));
  }

  // Config for the next race, ready to hand to `new Race(...)`.
  raceConfig() {
    const nem = this.nemesis();
    return {
      laps: this.division.laps,
      fieldSize: TUNE.FIELD_SIZE,
      playerStart: null,                    // M2 rule: you start at the back
      seed: this.seed + this.seasonRace * 104729 + this.divisionIndex * 7919,
      paceScale: this.division.paceScale,
      playerStats: this.garage.stats(),
      centrifugalScale: DIFFICULTY[this.difficulty].centrifugalScale,
      rivalPaceScale: DIFFICULTY[this.difficulty].rivalPace,
      nemesisId: nem ? nem.id : null,
      track: this.track,
    };
  }

  // Apply a finished race: points, prize money, damage, records.
  // `results` is Race.results(); `playerCar` is the car as it crossed the line.
  settleRace(results, playerCar) {
    const me = results.find(r => r.isPlayer);
    const prize = prizeFor(me.position);

    // Points for the top 8.
    for (const r of results) {
      const row = this.standings.find(s => r.isPlayer ? s.isPlayer : s.name === r.name);
      if (row) row.points += POINTS[r.position - 1] ?? 0;
    }

    this.money += prize;
    if (me.position === 1) this.racesWon++;

    this.garage.damage = playerCar ? playerCar.damage : this.garage.damage;
    this.garage.tyreWear = playerCar && playerCar.tyreWear !== undefined
      ? playerCar.tyreWear : this.garage.tyreWear;
    this.garage.nitroCharges = playerCar ? playerCar.nitroCharges : this.garage.nitroCharges;

    // Repairs. Section 5.2 wants the bill to come out of your winnings, which is
    // where "4th with a wrecked car leaves you poorer" comes from. Section 7
    // reserves damage *carrying between races* for Simulation — so in Arcade and
    // Career the car is put right and you pay for it, while in Simulation you
    // keep the damage and decide in the garage whether it's worth fixing.
    //
    // Without that split the career death-spirals: a wrecked car finishes badly,
    // a bad finish can't fund the repair, and it never recovers. A simulated
    // Rookie season sat on 100% damage from round three to the end.
    const billed = this.garage.repairCost();
    let repairPaid = 0;
    if (!DIFFICULTY[this.difficulty].damageCarries && billed > 0) {
      // Charge what they can cover, and put the car right either way. Making a
      // broke driver start the next race still wrecked punishes them twice and
      // is unrecoverable: they finish worse, earn less, and can never afford the
      // repair. A simulated season sat on 93% damage and $0 for six rounds.
      repairPaid = Math.min(billed, Math.max(0, this.money));
      this.money -= repairPaid;
      this.garage.damage = 0;
    }

    const trackId = this.track.id;
    const isRecord = me.bestLap && (!this.bestLaps[trackId] || me.bestLap < this.bestLaps[trackId]);
    if (isRecord) this.bestLaps[trackId] = me.bestLap;

    const report = {
      trackId,
      trackName: this.track.name,
      division: this.division.name,
      round: this.seasonRace + 1,
      position: me.position,
      points: POINTS[me.position - 1] ?? 0,
      prize,
      bestLap: me.bestLap,
      isRecord,
      damageTaken: playerCar ? playerCar.damage : 0,
      damage: this.garage.damage,
      repairCost: billed,
      repairPaid,
      net: prize - repairPaid,
      moneyAfter: this.money,
    };
    this.history.push(report);
    this.lastRaceReport = report;
    this.seasonRace++;
    return report;
  }

  // End of an 8-race season: top 3 in the championship are promoted.
  concludeSeason() {
    const table = this.table();
    const me = table.find(r => r.isPlayer);
    const promoted = me.position <= TUNE.PROMOTION_PLACES;
    const wasFinalDivision = this.divisionIndex === DIVISIONS.length - 1;

    if (promoted && me.position === 1 && wasFinalDivision) this.seasonsWon++;

    const outcome = {
      championshipPosition: me.position,
      points: me.points,
      promoted: promoted && !wasFinalDivision,
      championOfDivision: me.position === 1,
      division: this.division.name,
      nextDivision: promoted && !wasFinalDivision ? DIVISIONS[this.divisionIndex + 1].name : null,
    };

    if (outcome.promoted) this.divisionIndex++;
    this.seasonRace = 0;
    this.standings = this.freshStandings();
    return outcome;
  }

  toJSON() {
    return {
      driverName: this.driverName,
      divisionIndex: this.divisionIndex,
      seasonRace: this.seasonRace,
      money: this.money,
      seed: this.seed,
      difficulty: this.difficulty,
      seasonsWon: this.seasonsWon,
      racesWon: this.racesWon,
      bestLaps: { ...this.bestLaps },
      history: this.history.slice(-40),
      standings: this.standings.map(r => ({ ...r })),
      car: this.garage.toJSON(),
    };
  }
}

// Section 7. One setting, three values.
export const DIFFICULTY = {
  arcade: { name: 'Arcade', rivalPace: 0.85, centrifugalScale: TUNE.CENTRIFUGAL_ARCADE, fuel: false, damage: false },
  career: { name: 'Career', rivalPace: 1.0, centrifugalScale: 1, fuel: true, damage: true },
  simulation: { name: 'Simulation', rivalPace: 1.05, centrifugalScale: 1, fuel: true, damage: true, damageCarries: true, noRestarts: true },
};
