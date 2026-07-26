// Car rendering.
//
// PLACEHOLDER GEOMETRY. At M6 the Celica / Soul / Lucid sprites, the paint
// system and the number decals are ported verbatim from top-flush-3-10.html and
// replace drawCarBody() below. Nothing here is meant to be kept or restyled —
// it exists so M1 through M5 are playable and testable. Keep the call signature
// (ctx, x, y, width, facing, paint) so the port is a drop-in.

import { TUNE } from '../tune.js';

export const PAINTS = {
  player: { body: '#d8342c', trim: '#f2e6c9', glass: '#1b2a3a' },
  rival1: { body: '#2f6fd0', trim: '#dfe8f5', glass: '#16222f' },
  rival2: { body: '#e0a51f', trim: '#3b2f14', glass: '#1b2a3a' },
  rival3: { body: '#37a05a', trim: '#e8f4ea', glass: '#16222f' },
  rival4: { body: '#8d43c4', trim: '#efe2f7', glass: '#1b2a3a' },
  rival5: { body: '#d9d9de', trim: '#2a2a30', glass: '#16222f' },
};

// Draws a car centred on (x, y) with the given on-screen width.
// facing: -1..1, how much the car is turned (steering or lateral drift).
export function drawCarBody(ctx, x, y, width, facing = 0, paint = PAINTS.player, opts = {}) {
  const w = width, h = width * 0.52;
  const lean = facing * w * 0.05;

  ctx.save();
  ctx.translate(x, y);

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.5, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // rear tyres
  ctx.fillStyle = '#15151a';
  rrect(ctx, -w * 0.5, -h * 0.42, w * 0.16, h * 0.42, 2);
  rrect(ctx, w * 0.34, -h * 0.42, w * 0.16, h * 0.42, 2);

  // body
  ctx.fillStyle = paint.body;
  rrect(ctx, -w * 0.44 + lean, -h * 0.72, w * 0.88, h * 0.58, w * 0.06);

  // cabin / rear glass
  ctx.fillStyle = paint.glass;
  rrect(ctx, -w * 0.29 + lean * 1.4, -h * 0.98, w * 0.58, h * 0.34, w * 0.05);

  // roof
  ctx.fillStyle = paint.body;
  rrect(ctx, -w * 0.31 + lean * 1.4, -h * 1.06, w * 0.62, h * 0.12, w * 0.04);

  // spoiler
  ctx.fillStyle = paint.trim;
  rrect(ctx, -w * 0.46 + lean, -h * 0.78, w * 0.92, h * 0.07, 2);

  // lights
  ctx.fillStyle = opts.braking ? '#ff3b30' : '#7a1f1a';
  rrect(ctx, -w * 0.38 + lean, -h * 0.52, w * 0.16, h * 0.1, 2);
  rrect(ctx, w * 0.22 + lean, -h * 0.52, w * 0.16, h * 0.1, 2);

  if (opts.nitro) {
    ctx.fillStyle = 'rgba(125,249,255,0.85)';
    rrect(ctx, -w * 0.1, -h * 0.36, w * 0.2, h * 0.16, 3);
  }

  ctx.restore();
}

// The player, planted at the bottom of the screen. The camera already follows
// lateral position, so the sprite only leans — it does not slide across.
export function drawPlayer(ctx, canvas, car, input) {
  const W = canvas.width, H = canvas.height;
  const width = W * 0.17;
  const y = H - H * 0.055;
  // Lean into the steering, plus a little from how hard the corner is pushing.
  const facing = clamp(input.steer * 0.8 + car.lateralSlip * Math.sign(-car.x || 1) * 0.2, -1, 1);
  drawCarBody(ctx, W / 2, y, width, facing, PAINTS.player, {
    braking: input.brake > 0,
    nitro: car.nitroTimer > 0,
  });
}

// A rival, projected against the same segment data the road used. Returns false
// if it isn't visible. (M2 uses this; the geometry is the same placeholder.)
export function drawRival(ctx, canvas, seg, rival, cameraX, paint) {
  const p = seg.p1.screen;
  if (!p.scale || p.scale <= 0) return false;
  const W = canvas.width;
  const scale = p.scale;
  const screenX = p.x + scale * rival.x * TUNE.ROAD_WIDTH * W / 2;
  const width = scale * TUNE.ROAD_WIDTH * W / 2 * 0.62;
  if (width < 2) return false;
  if (p.y < seg.clip - width) return false;
  drawCarBody(ctx, screenX, p.y, width, 0, paint, {});
  return true;
}

function rrect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
