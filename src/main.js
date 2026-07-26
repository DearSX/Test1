// M2 bootstrap. Done when: you can finish a 3-lap race from 20th to somewhere
// believable, and the positions are honest.
//
// The career wrapper (seasons, money, shop) arrives at M3 — this runs a single
// race against the full 20-car field.

import { TUNE } from './tune.js';
import { startLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { RoadRenderer } from './render/road.js';
import { drawPlayer, drawCars, PAINTS } from './render/cars.js';
import { drawHud, drawCountdown, drawResults } from './render/hud.js';
import { Effects } from './render/effects.js';
import { Race, PHASE } from './game/race.js';
import { buildIslandTrack } from './data/tracks/island.js';

const canvas = document.getElementById('game');
const renderer = new RoadRenderer(canvas);
const input = new Input();
const effects = new Effects();
const track = buildIslandTrack();

// Declared before newRace() runs — it writes into prev.
let prev = { trackPos: 0, x: 0 };
let race = newRace();

input.attachTouch(canvas);

function newRace() {
  const r = new Race(track, { seed: (Math.random() * 1e9) | 0, laps: TUNE.LAPS_DEFAULT });
  prev = { trackPos: r.player.trackPos, x: r.player.x };
  return r;
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

window.addEventListener('keydown', e => {
  if (e.code === 'KeyR') race = newRace();
  if (e.code === 'KeyM') race.player.manualGears = !race.player.manualGears;
});

function update(dt) {
  const car = race.player;
  prev.trackPos = car.trackPos;
  prev.x = car.x;

  const cmd = input.sample(dt);
  race.update(dt, cmd);
  effects.update(dt, car, canvas);
}

function render(alpha) {
  const ctx = renderer.ctx;
  const car = race.player;

  // Interpolate the camera along the shorter way round the lap seam.
  let d = car.trackPos - prev.trackPos;
  if (d < -track.trackLength / 2) d += track.trackLength;
  const pos = wrap(prev.trackPos + d * alpha);
  const x = prev.x + (car.x - prev.x) * alpha;

  const shaken = effects.beginShake(ctx, canvas);
  renderer.render(track, pos, x);

  // Rivals, far to near, against the projection the road pass just wrote.
  drawCars(ctx, canvas, renderer, track, race.entries
    .filter(e => !e.isPlayer)
    .map(e => ({
      trackPos: e.car.trackPos,
      x: e.car.x,
      paint: rivalPaint(e),
      braking: false,
    })), pos);

  drawPlayer(ctx, canvas, car, input.state);
  effects.draw(ctx);
  effects.endShake(ctx, shaken);

  drawHud(ctx, canvas, car, race.hudState());

  if (race.phase === PHASE.COUNTDOWN) drawCountdown(ctx, canvas, race.countdown);
  if (race.playerEntry.finished) {
    drawResults(ctx, canvas, race.results(), {
      title: race.phase === PHASE.FINISHED ? 'RACE RESULT' : 'FINISHED — FIELD STILL RUNNING',
    });
  }
}

// Rival paint comes from the roster. Cached on the entry so we aren't building
// objects every frame.
function rivalPaint(entry) {
  if (!entry._paint) {
    entry._paint = {
      body: entry.identity.paint,
      trim: '#e8e8ee',
      glass: '#16222f',
    };
  }
  return entry._paint;
}

function wrap(z) {
  const L = track.trackLength;
  return ((z % L) + L) % L;
}

startLoop(update, render);
