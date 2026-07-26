// Car rendering.
//
// The bodies are the PORTED sprites from top-flush-3-10.html — Celica (GT-S
// Coupe), Kia Soul and Lucid Air — plus its paint and number-decal system, all
// verbatim in render/themes/sprites.js. This file is only the placement: work out
// where on screen a car goes and how big, then hand off.
//
// The placeholder geometry that stood in for these through M1-M5 is gone.

import { TUNE } from '../tune.js';
import {
  setSpriteContext, carById, drawRivalBody, CARS,
} from './themes/sprites.js';

export { CARS, PAINT_OPTIONS, NUMBER_OPTIONS } from './themes/sprites.js';

// Rival paints, from the original's CAR_COLORS.
export const RIVAL_COLORS = ['#3d7bff','#7dff6a','#ffd23d','#b66bff','#3dfcff','#ff8a3d','#ff5ad0'];

// The player, planted at the bottom of the screen. The camera already follows
// lateral position, so the sprite only leans — it does not slide across.
//
// Width comes from the same projection the rivals use, evaluated at the camera's
// own distance to the car, so a rival drawn alongside is the right size relative
// to your own.
export function drawPlayer(ctx, canvas, car, input, garage = null) {
  const W = canvas.width, H = canvas.height;

  // Both the size AND the ground line come from the same projection the rivals
  // use, evaluated at the camera's own distance to the car. A fixed fraction of
  // the canvas was standing in here since M1, and it put the contact patch ~30px
  // above where the road surface actually projects — the car was literally
  // hovering, by about 9% of its own width.
  const cameraDepth = 1 / Math.tan((TUNE.FOV / 2) * Math.PI / 180);
  const playerZ = TUNE.CAMERA_HEIGHT * cameraDepth;
  const scale = cameraDepth / playerZ;
  const width = scale * TUNE.ROAD_WIDTH * (W / 2) * TUNE.CAR_SCREEN_WIDTH;
  const y = H / 2 + scale * TUNE.CAMERA_HEIGHT * (H / 2);
  const lean = clamp(input.steer * 0.8 + car.lateralSlip * Math.sign(-car.x || 1) * 0.2, -1, 1) * 0.35;

  setSpriteContext(ctx, {
    dpr: 1,
    carColor: garage && garage.paint ? garage.paint : null,
    carNumber: garage && garage.number ? String(garage.number) : null,
  });

  ctx.save();
  ctx.translate(W / 2, y);
  ctx.rotate(lean);

  // Ground shadow, from the original's drawPlayer. Dropping it is what made the
  // car look like it was hovering — there was nothing anchoring it to the road.
  ctx.fillStyle = 'rgba(10,60,40,.4)';
  ctx.beginPath(); ctx.ellipse(0, width * .06, width * .55, width * .12, 0, 0, 7); ctx.fill();

  // The original drew nitro flames behind the car before the body.
  if (car.nitroTimer > 0) {
    for (let i = 0; i < 5; i++) {
      const fx = (Math.random() - 0.5) * width * 0.5;
      const fl = width * (0.15 + Math.random() * 0.3);
      ctx.fillStyle = Math.random() < 0.5 ? '#ffd23d' : '#ff7b3d';
      ctx.beginPath();
      ctx.moveTo(fx - width * 0.06, width * 0.05);
      ctx.lineTo(fx + width * 0.06, width * 0.05);
      ctx.lineTo(fx, width * 0.05 + fl);
      ctx.closePath(); ctx.fill();
    }
  }

  carById(garage ? garage.model : 'celica').draw(width);
  ctx.restore();
}

// Draws the other cars, far to near, against the projection road.js just wrote
// onto the segments. Must run after RoadRenderer.render() — it reads the screen
// coordinates that pass produced rather than recomputing them, so the cars sit
// exactly on the road however it bends.
//
// The near-to-far road pass and this far-to-near sprite pass are the standard
// pairing: the road needs painter's order outward, sprites need it inward so a
// close car overlaps a distant one.
export function drawCars(ctx, canvas, renderer, track, cars, cameraZ) {
  const segs = track.segments;
  const N = segs.length;
  const base = renderer.baseIndex;
  if (base === undefined) return 0;

  // Bucket cars by the segment they're in, so each segment is one lookup.
  const buckets = new Map();
  for (const c of cars) {
    if (c.hidden) continue;
    const n = offsetFromCamera(track, base, c.trackPos);
    if (n < 1 || n >= TUNE.DRAW_DISTANCE) continue;
    if (!buckets.has(n)) buckets.set(n, []);
    buckets.get(n).push(c);
  }
  if (!buckets.size) return 0;

  const W = canvas.width;
  let drawn = 0;

  for (let n = TUNE.DRAW_DISTANCE - 1; n >= 1; n--) {
    const list = buckets.get(n);
    if (!list) continue;
    const seg = segs[(base + n) % N];
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    if (!p1.scale || p1.scale <= 0) continue;

    for (const c of list) {
      // Position within the segment, so cars glide rather than hop.
      const frac = ((c.trackPos % track.segmentLength) + track.segmentLength)
        % track.segmentLength / track.segmentLength;
      const scale = p1.scale + (p2.scale - p1.scale) * frac;
      const roadX = p1.x + (p2.x - p1.x) * frac;
      const y = p1.y + (p2.y - p1.y) * frac;
      const width = Math.min(
        scale * TUNE.ROAD_WIDTH * W / 2 * TUNE.CAR_SCREEN_WIDTH,
        W * TUNE.CAR_MAX_SCREEN_FRAC);
      if (width < 1.5) continue;

      const screenX = roadX + scale * c.x * TUNE.ROAD_WIDTH * W / 2;
      // Hidden behind a crest.
      if (y > seg.clip) continue;

      setSpriteContext(ctx, { dpr: 1 });
      ctx.save();
      ctx.translate(screenX, y);
      // Ground shadow, from the original's drawRival.
      ctx.fillStyle = 'rgba(10,60,40,.35)';
      ctx.beginPath(); ctx.ellipse(0, width * .06, width * .55, width * .12, 0, 0, 7); ctx.fill();
      drawRivalBody(width, c.paint ?? RIVAL_COLORS[0], c.dark ?? '#1b2a3a');
      ctx.restore();
      drawn++;
    }
  }
  return drawn;
}

// How many segments ahead of the camera a track position is, allowing for the
// lap wrap.
function offsetFromCamera(track, baseIndex, trackPos) {
  const N = track.segments.length;
  let n = track.findIndex(trackPos) - baseIndex;
  if (n < 0) n += N;
  return n;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
