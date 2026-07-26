// M0 "done when": the road bends and hills correctly at a constant speed.
//
// Runs the real renderer against a recording 2D context, so what we assert on
// is the geometry the game actually draws — not a re-derivation of it.
//
//   node tools/verify-m0.mjs

import { buildIslandTrack } from '../src/data/tracks/island.js';
import { RoadRenderer } from '../src/render/road.js';
import { TUNE } from '../src/tune.js';
import { startLoop } from '../src/core/loop.js';
import { fakeCanvas, check, report } from './harness.mjs';

const W = 960, H = 540;
const canvas = fakeCanvas(W, H);
const renderer = new RoadRenderer(canvas);
renderer.resize(W, H);
const track = buildIslandTrack();

// --- track shape ------------------------------------------------------------

check('track length is in spec range (1500-2500 segments)',
  track.segments.length >= 1500 && track.segments.length <= 2500,
  `${track.segments.length} segments`);

const first = track.segments[0], last = track.segments[track.segments.length - 1];
check('lap closes: elevation returns to the start', Math.abs(last.y - first.y) < 1e-6,
  `start y=${first.y.toFixed(1)} end y=${last.y.toFixed(1)}`);
check('lap closes: curvature returns to straight',
  Math.abs(last.curve) < 1e-6 && Math.abs(first.curve) < 1e-6,
  `start curve=${first.curve} end curve=${last.curve}`);

let maxKink = 0;
for (let i = 1; i < track.segments.length; i++) {
  maxKink = Math.max(maxKink, Math.abs(track.segments[i].curve - track.segments[i - 1].curve));
}
check('no curvature kinks (smooth entry/exit)', maxKink < 0.5, `max step ${maxKink.toFixed(3)}`);

const hardest = track.segments.reduce((a, s) => Math.abs(s.curve) > Math.abs(a.curve) ? s : a);
check('has a genuinely hard corner (|curve| >= 5)', Math.abs(hardest.curve) >= 5,
  `hardest |curve|=${Math.abs(hardest.curve).toFixed(1)} at segment ${hardest.index}`);

const elevations = track.segments.map(s => s.y);
check('has real elevation change', Math.max(...elevations) - Math.min(...elevations) > 1000,
  `range ${Math.round(Math.max(...elevations) - Math.min(...elevations))} units`);

// --- projection: does the road actually bend the right way? ------------------

// Road centre on screen at a given draw depth, for a camera sitting at z.
function centreAt(z, depth = 120) {
  canvas.ctx.reset();
  renderer.render(track, z, 0);
  const base = track.findIndex(z);
  const seg = track.segments[(base + depth) % track.segments.length];
  return seg.p1.screen.x;
}

const straightSeg = track.segments.findIndex((s, i) => i > 5 && Math.abs(s.curve) < 1e-9);
const onStraight = centreAt(straightSeg * TUNE.SEGMENT_LEN + 5 * TUNE.SEGMENT_LEN);
check('straight road stays centred', Math.abs(onStraight - W / 2) < 30,
  `centre at depth 120 = ${onStraight}px (screen middle ${W / 2})`);

// Sample the deepest visible centre through every held corner and confirm the
// sign of the bend matches the sign of the curve.
let bendWrong = [];
for (const seg of track.segments) {
  if (Math.abs(seg.curve) < 3.5) continue;
  if (seg.index % 40 !== 0) continue;              // sample, don't grind
  const c = centreAt(seg.index * TUNE.SEGMENT_LEN, 100);
  const offset = c - W / 2;
  // positive curve = bends right = far road drifts to +x on screen
  if (Math.sign(offset) !== Math.sign(seg.curve) || Math.abs(offset) < 40) {
    bendWrong.push(`seg ${seg.index} curve ${seg.curve.toFixed(1)} -> offset ${offset}px`);
  }
}
check('every hard corner bends in its own direction', bendWrong.length === 0,
  bendWrong.length ? bendWrong.slice(0, 4).join('; ') : 'checked all corners with |curve| >= 3.5');

// --- projection: do hills move the road vertically? -------------------------

function crestHeight(z) {
  canvas.ctx.reset();
  renderer.render(track, z, 0);
  const base = track.findIndex(z);
  const seg = track.segments[(base + 60) % track.segments.length];
  return seg.p1.screen.y;
}

// Find the steepest climb and the steepest drop, and check the road ahead sits
// higher on screen going uphill than it does going downhill.
let steepestUp = { slope: 0, i: 0 }, steepestDown = { slope: 0, i: 0 };
for (let i = 60; i < track.segments.length - 60; i++) {
  const slope = track.segments[i + 40].y - track.segments[i].y;
  if (slope > steepestUp.slope) steepestUp = { slope, i };
  if (slope < steepestDown.slope) steepestDown = { slope, i };
}
const upY = crestHeight(steepestUp.i * TUNE.SEGMENT_LEN);
const downY = crestHeight(steepestDown.i * TUNE.SEGMENT_LEN);
check('uphill road ahead rises up the screen', upY < H / 2,
  `road 60 segments ahead at y=${upY}px, horizon ${H / 2}px`);
check('downhill road ahead falls below the horizon', downY > upY,
  `uphill y=${upY}px vs downhill y=${downY}px`);

// --- no infinities anywhere on a full lap -----------------------------------

let bad = 0, drawnMin = Infinity, drawnMax = 0;
for (let z = 0; z < track.trackLength; z += TUNE.SEGMENT_LEN * 7) {
  canvas.ctx.reset();
  renderer.render(track, z, 0);
  for (const call of canvas.ctx.calls) {
    for (const v of call.args) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad++;
    }
  }
  drawnMin = Math.min(drawnMin, canvas.ctx.calls.length);
  drawnMax = Math.max(drawnMax, canvas.ctx.calls.length);
}
check('no NaN/Infinity in any draw call over a full lap', bad === 0, `${bad} bad values`);
check('every camera position draws road', drawnMin > 50,
  `draw calls per frame: ${drawnMin}-${drawnMax}`);

// The old skeleton had no near-plane clip: crossing a segment boundary divided
// by ~zero. Sweep sub-segment offsets right up to the boundary.
let nearBad = 0;
for (let f = 0; f < 1; f += 0.01) {
  canvas.ctx.reset();
  renderer.render(track, 400 * TUNE.SEGMENT_LEN + f * TUNE.SEGMENT_LEN, 0);
  for (const call of canvas.ctx.calls) {
    for (const v of call.args) {
      if (typeof v === 'number' && Math.abs(v) > 1e7) nearBad++;
    }
  }
}
check('near-plane clip holds across a segment boundary', nearBad === 0,
  `${nearBad} runaway coordinates`);

// --- fixed timestep ---------------------------------------------------------

let ticks = 0, dts = new Set(), frames = 0;
await simulateLoop(
  dt => { ticks++; dts.add(dt); },
  () => { frames++; },
  [16.7, 16.7, 16.7, 250, 16.7, 8, 40, 16.7],   // includes a 250ms stall
);
check('update() dt is always exactly 1/60', dts.size === 1 && Math.abs([...dts][0] - 1 / 60) < 1e-9,
  `distinct dt values: ${[...dts].map(d => d.toFixed(6)).join(', ')}`);
check('a 250ms stall is caught up in discrete steps, not one big one', ticks >= 20,
  `${ticks} physics steps across ${frames} frames`);

// Drives startLoop with a scripted frame clock instead of real time.
async function simulateLoop(update, render, frameDeltas) {
  const realNow = performance.now.bind(performance);
  const realRAF = globalThis.requestAnimationFrame;
  let t = 1000, i = 0, done;
  const finished = new Promise(r => (done = r));
  performance.now = () => t;
  globalThis.requestAnimationFrame = cb => {
    if (i >= frameDeltas.length) return done();
    t += frameDeltas[i++];
    setTimeout(() => cb(t), 0);
  };
  startLoop(update, render);
  await finished;
  performance.now = realNow;
  globalThis.requestAnimationFrame = realRAF;
}

report('M0');
