// M1 bootstrap. Done when: you can lap the track, and flooring a hairpin
// reliably puts you in the grass.
//
// Rivals, positions and the race state machine arrive at M2 — for now this is a
// hot lap with lap timing.

import { TUNE } from './tune.js';
import { startLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { RoadRenderer } from './render/road.js';
import { drawPlayer } from './render/cars.js';
import { drawHud } from './render/hud.js';
import { Effects } from './render/effects.js';
import { PlayerCar } from './game/physics.js';
import { buildIslandTrack } from './data/tracks/island.js';

const canvas = document.getElementById('game');
const renderer = new RoadRenderer(canvas);
const input = new Input();
const effects = new Effects();
const track = buildIslandTrack();
const car = new PlayerCar(track);

input.attachTouch(canvas);

const hot = {
  lap: 1,
  totalLaps: 3,
  lapTime: 0,
  bestLap: null,
  lastLapDelta: null,
};

// Previous state, for render interpolation.
let prev = { trackPos: car.trackPos, x: car.x };

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

window.addEventListener('keydown', e => {
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyM') car.manualGears = !car.manualGears;
});

function reset() {
  car.trackPos = 0; car.x = 0; car.speed = 0; car.gear = 0;
  car.damage = 0; car.crashTimer = 0; car.nitroTimer = 0;
  car.nitroCharges = TUNE.NITRO_CHARGES_START;
  hot.lap = 1; hot.lapTime = 0; hot.lastLapDelta = null;
  prev = { trackPos: 0, x: 0 };
}

function update(dt) {
  prev.trackPos = car.trackPos;
  prev.x = car.x;

  const cmd = input.sample(dt);
  const before = car.trackPos;
  car.update(dt, cmd);
  effects.update(dt, car, canvas);

  hot.lapTime += dt * 1000;

  // Crossing the start line wraps trackPos backwards.
  if (car.trackPos < before - track.trackLength / 2) {
    if (hot.bestLap === null || hot.lapTime < hot.bestLap) {
      hot.lastLapDelta = hot.bestLap === null ? null : hot.lapTime - hot.bestLap;
      hot.bestLap = hot.lapTime;
    } else {
      hot.lastLapDelta = hot.lapTime - hot.bestLap;
    }
    hot.lap++;
    hot.lapTime = 0;
  }
}

function render(alpha) {
  const ctx = renderer.ctx;

  // Interpolate the camera along the shorter way round the lap seam.
  let d = car.trackPos - prev.trackPos;
  if (d < -track.trackLength / 2) d += track.trackLength;
  const pos = wrap(prev.trackPos + d * alpha);
  const x = prev.x + (car.x - prev.x) * alpha;

  const shaken = effects.beginShake(ctx, canvas);
  renderer.render(track, pos, x);
  drawPlayer(ctx, canvas, car, input.state);
  effects.draw(ctx);
  effects.endShake(ctx, shaken);

  drawHud(ctx, canvas, car, hot);
}

function wrap(z) {
  const L = track.trackLength;
  return ((z % L) + L) % L;
}

startLoop(update, render);
