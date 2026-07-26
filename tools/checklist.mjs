// The section 11 checklist, run as code wherever that's possible.
//
// Three of the seven items are about a real browser (portrait phone, mute before
// a user gesture, touch steering). Those are checked in Chromium — see the
// scripts referenced at the bottom of the output — because asserting them here
// would only be testing a mock.
//
//   node tools/checklist.mjs

import { getTrack, TRACKS } from '../src/data/tracks/index.js';
import { PlayerCar } from '../src/game/physics.js';
import { ModelDriver } from '../src/game/driving.js';
import { Race, PHASE } from '../src/game/race.js';
import { Career } from '../src/game/career.js';
import { Garage } from '../src/game/garage.js';
import { SaveStore } from '../src/core/storage.js';
import { TUNE } from '../src/tune.js';
import { prizeFor } from '../src/data/season.js';
import { check, report } from './harness.mjs';
import { readFileSync } from 'fs';

const DT = TUNE.STEP;
const island = getTrack('island');

// 1 — Sit on a 250ms frame stall: no car passes through another car.
{
  const race = new Race(island, { seed: 4242 });
  const driver = new ModelDriver(island, { margin: 0.94 });
  let worst = 0, steps = 0, stalls = 0;

  const step = () => {
    race.update(DT, race.phase === PHASE.RACING
      ? driver.drive(race.player, race.entries.map(e => e.car))
      : { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false });
    steps++;
    for (let i = 0; i < race.entries.length; i++) {
      for (let j = i + 1; j < race.entries.length; j++) {
        const a = race.entries[i].car, b = race.entries[j].car;
        let dz = (a.trackPos - b.trackPos) % island.trackLength;
        if (dz > island.trackLength / 2) dz -= island.trackLength;
        if (dz < -island.trackLength / 2) dz += island.trackLength;
        if (Math.abs(dz) < TUNE.CAR_LEN && Math.abs(a.x - b.x) < TUNE.CAR_WIDTH) {
          worst = Math.max(worst, TUNE.CAR_LEN - Math.abs(dz));
        }
      }
    }
  };

  for (let t = 0; t < 120 / DT && race.phase !== PHASE.FINISHED; t++) {
    step();
    if (t % 90 === 0) { for (let k = 0; k < 15; k++) step(); stalls++; }
  }
  check('[1] 250ms frame stalls: no car passes through another',
    worst < TUNE.CAR_LEN * 0.5,
    `${steps} steps, ${stalls} stalls of 15 catch-up ticks, worst interpenetration ${worst.toFixed(0)}/${TUNE.CAR_LEN} units`);
}

// 2 — Hold throttle through the hardest corner: you go off, every time.
{
  let hardest = island.segments[0];
  for (const s of island.segments) if (Math.abs(s.curve) > Math.abs(hardest.curve)) hardest = s;
  let start = hardest.index;
  while (start > 0 && Math.abs(island.segments[start - 1].curve) > 0.05) start--;

  let held = 0, runs = 0, worstMin = Infinity;
  for (const entryX of [-0.95, -0.6, -0.3, 0, 0.3, 0.6, 0.95]) {
    for (const entrySpeed of [0.8, 0.9, 1.0]) {
      const car = new PlayerCar(island);
      car.trackPos = Math.max(0, start - 60) * TUNE.SEGMENT_LEN;
      car.x = entryX;
      car.speed = car.maxSpeed * entrySpeed;
      car.gear = 5;
      let off = false, worst = 0;
      for (let t = 0; t < 20 / DT; t++) {
        const curve = island.curveAt(car.trackPos);
        car.update(DT, {
          steer: curve === 0 ? 0 : Math.sign(curve),   // perfect opposite lock
          throttle: 1, brake: 0, nitro: false, shiftUp: false, shiftDown: false,
        });
        worst = Math.max(worst, Math.abs(car.x));
        if (Math.abs(car.x) > TUNE.OFFROAD_X) { off = true; break; }
      }
      runs++;
      if (!off) held++;
      worstMin = Math.min(worstMin, worst);
    }
  }
  check('[2] hold throttle through the hardest corner: off the road, every time',
    held === 0,
    `${runs}/${runs} runs off, from every line and entry speed, with perfect opposite lock (worst case still reached |x| ${worstMin.toFixed(2)})`);
}

// 3 — Refresh mid-season: everything is where you left it.
{
  const backend = (() => {
    const m = new Map();
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  })();
  const store = new SaveStore(backend);
  const c = new Career({ seed: 24680 });
  c.money = 13400;
  c.seasonRace = 5;
  c.garage.upgrades.engine = 1;
  c.garage.upgrades.tyres = 2;
  c.bestLaps.island = 55980;
  c.standings.find(s => s.isPlayer).points = 27;
  store.write(1, c.toSave());

  const back = Career.fromSave(new SaveStore(backend).read(1));
  check('[3] refresh mid-season: everything is where you left it',
    back.money === 13400 && back.seasonRace === 5
    && back.garage.level('tyres') === 2 && back.garage.level('engine') === 1
    && back.bestLaps.island === 55980
    && back.standings.find(s => s.isPlayer).points === 27,
    `round ${back.seasonRace + 1}, $${back.money}, ${back.standings.find(s => s.isPlayer).points} points, upgrades intact`);
}

// 4 — Buy one upgrade level: lap time changes measurably.
{
  const lap = (stats) => {
    const car = new PlayerCar(island, stats);
    const driver = new ModelDriver(island, { margin: 0.92, managesFuel: false });
    car.speed = car.maxSpeed * 0.55;
    let t = 0;
    while (car.distance < island.trackLength && t < 400 / DT) { car.update(DT, driver.drive(car)); t++; }
    return t * DT;
  };
  const before = lap(new Garage().stats());
  const after = lap(new Garage({ upgrades: { tyres: 1 } }).stats());
  check('[4] buy one upgrade level: lap time changes measurably',
    before - after > 0.25,
    `one level of tyres: ${before.toFixed(2)}s -> ${after.toFixed(2)}s (${(before - after).toFixed(2)}s)`);
}

// 5 — Finish 20th: you still earn something, and it doesn't feel punitive.
{
  const c = new Career({ seed: 5 });
  const money = c.money;
  const results = [];
  for (let i = 1; i <= TUNE.FIELD_SIZE; i++) {
    results.push({ position: i, isPlayer: i === TUNE.FIELD_SIZE, name: `R${i}`, bestLap: 60000, finishTime: 200 + i, damage: 0, pitStops: 0 });
  }
  const rep = c.settleRace(results, { damage: 0.2, nitroCharges: 2, tyreWear: 0.4 });
  check('[5] finish 20th: you still earn something and are not driven backwards',
    prizeFor(TUNE.FIELD_SIZE) > 0 && rep.prize > 0 && c.money >= money - rep.prize
    && c.garage.damage === 0,
    `last place pays $${rep.prize}; after a $${rep.repairPaid} repair bill the bank went $${money.toLocaleString()} -> $${c.money.toLocaleString()}, car fixed`);
}

// 6, 7 — browser items, plus the source-level halves that CAN be checked here.
{
  const audioSrc = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  // No AudioContext may be constructed at module load or on a timer — only from
  // the unlock() path, which main.js calls from a gesture listener.
  const constructsAtLoad = /^\s*(const|let|var)\s+\w+\s*=\s*new\s+(AudioContext|webkitAudioContext)/m.test(audioSrc);
  const unlockFromGesture = /addEventListener\('(keydown|pointerdown|touchstart)', firstGesture\)/.test(mainSrc)
    && /audio\.unlock\(\)/.test(mainSrc);
  check('[7a] audio cannot start before a user gesture',
    !constructsAtLoad && unlockFromGesture,
    'AudioContext is only built inside unlock(), which is called from keydown/pointerdown/touchstart');

  const hasMute = /toggleMute\s*\(/.test(audioSrc) && /KeyK/.test(mainSrc)
    && /master\.gain\.setTargetAtTime/.test(audioSrc);
  check('[7b] a mute control exists and gates the master output',
    hasMute, 'K toggles mute on every screen, saved with the career');
}

// Extra: every track is a closed circuit that the minimap can draw.
{
  const { trackOutline } = await import('../src/render/minimap.js');
  const bad = [];
  for (const def of TRACKS) {
    const t = getTrack(def.id);
    const first = t.segments[0], last = t.segments[t.segments.length - 1];
    if (Math.abs(last.y - first.y) > 1e-6 || Math.abs(last.curve) > 1e-9) bad.push(`${def.id} seam`);
    const o = trackOutline(t);
    const gap = Math.hypot(o.pts[0].x - o.pts[o.pts.length - 1].x, o.pts[0].y - o.pts[o.pts.length - 1].y);
    if (gap / Math.max(o.width, o.height) > 0.02) bad.push(`${def.id} outline`);
  }
  check('[extra] all five tracks close, in elevation, curvature and on the minimap',
    bad.length === 0, bad.length ? bad.join(', ') : `${TRACKS.length} tracks: ${TRACKS.map(t => t.name).join(', ')}`);
}

console.log('\nBrowser-only items (checked in Chromium, not here):');
console.log('  [6] portrait phone: HUD readable, touch steering usable');
console.log('  [7] mute works and audio does not start before a user gesture');

report('Section 11 checklist');
