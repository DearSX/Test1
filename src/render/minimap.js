// Minimap. Section 8: "what turns 'I'm 8th' into 'I'm 8th and 7th is right
// there.'"
//
// The outline is derived from the track's own curvature: walk the segments
// accumulating a heading and plot the path. Two corrections make that usable.
//
// First, the tracks are authored so their total curvature is close to one full
// lap. That returns the HEADING to where it started, so the outline doesn't
// arrive back at the start line pointing the wrong way.
//
// Second — and this is the part that is easy to get wrong — matching headings is
// not enough to close a loop. Closing it also needs the position integral to
// vanish, which is a far stronger constraint on the layout than any piece list
// satisfies by accident; measured raw, these paths ended up a full bounding-box
// away from where they began. So the residual is closed out by distributing it
// proportionally along the path (the traverse-closure rule used in surveying).
// The result is a schematic rather than a survey: the sequence of corners, their
// relative severity and where you are among them are all faithful, which is what
// the minimap is for.
//
// Outlines are cached — this walks a couple of thousand segments.

import { TUNE } from '../tune.js';

const cache = new WeakMap();

export function trackOutline(track) {
  if (cache.has(track)) return cache.get(track);

  const segs = track.segments;
  const k = TUNE.MINIMAP_CURVE_SCALE;

  // Raw traverse.
  const raw = [];
  let heading = 0, x = 0, y = 0;
  for (let i = 0; i < segs.length; i++) {
    heading += segs[i].curve * k;
    x += Math.sin(heading);
    y += Math.cos(heading);
    if (i % 6 === 0) raw.push({ x, y, distance: i * track.segmentLength });
  }

  // Close it: take out the residual, spread evenly along the lap.
  const last = raw[raw.length - 1];
  const pts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    const f = i / (raw.length - 1);
    const p = { x: raw[i].x - last.x * f, y: raw[i].y - last.y * f, distance: raw[i].distance };
    pts.push(p);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }

  const outline = {
    pts,
    minX, maxX, minY, maxY,
    width: Math.max(maxX - minX, 1e-6),
    height: Math.max(maxY - minY, 1e-6),
    // Where a lap distance falls on the outline, as a fraction.
    at(distance) {
      const L = track.trackLength;
      const d = ((distance % L) + L) % L;
      const idx = Math.min(pts.length - 1, Math.floor(d / L * pts.length));
      return pts[idx];
    },
  };

  cache.set(track, outline);
  return outline;
}

// entries: [{ trackPos, isPlayer, paint, position }]
export function drawMinimap(ctx, canvas, track, entries, opts = {}) {
  const W = canvas.width, H = canvas.height;
  const unit = Math.min(W, H);
  const portrait = H > W;
  const size = unit * (portrait ? 0.26 : 0.2);
  const pad = unit * 0.035;
  // Landscape has room above the tacho, bottom left. Portrait does not — the
  // gauges and the car fill that corner — so it goes top right under the bars.
  const x0 = portrait ? W - size - pad : pad;
  const y0 = opts.top ?? (portrait ? unit * 0.32 : H - size - pad - unit * 0.16);

  const o = trackOutline(track);
  const scale = Math.min(size / o.width, size / o.height) * 0.86;
  const cx = x0 + size / 2, cy = y0 + size / 2;
  const midX = (o.minX + o.maxX) / 2, midY = (o.minY + o.maxY) / 2;
  const px = p => cx + (p.x - midX) * scale;
  // Screen y grows downward; the track's y is a forward axis, so flip it.
  const py = p => cy - (p.y - midY) * scale;

  ctx.save();

  // backing
  ctx.fillStyle = 'rgba(6,10,20,0.55)';
  ctx.fillRect(x0, y0, size, size);

  // the circuit
  ctx.strokeStyle = 'rgba(230,240,255,0.55)';
  ctx.lineWidth = Math.max(2, unit * 0.006);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < o.pts.length; i++) {
    const p = o.pts[i];
    if (i === 0) ctx.moveTo(px(p), py(p)); else ctx.lineTo(px(p), py(p));
  }
  ctx.closePath();
  ctx.stroke();

  // start/finish
  const start = o.pts[0];
  ctx.fillStyle = '#ffffff';
  const tick = Math.max(3, unit * 0.009);
  ctx.fillRect(px(start) - tick / 2, py(start) - tick / 2, tick, tick);

  // cars — rivals first, player on top so it's never hidden
  const dot = Math.max(2.5, unit * 0.008);
  const sorted = entries.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
  for (const e of sorted) {
    const p = o.at(e.trackPos);
    ctx.fillStyle = e.isPlayer ? '#ffb020' : (e.paint ?? 'rgba(230,240,255,0.7)');
    const r = e.isPlayer ? dot * 1.5 : dot;
    ctx.beginPath();
    ctx.arc(px(p), py(p), r, 0, Math.PI * 2);
    ctx.fill();
    if (e.isPlayer) {
      ctx.strokeStyle = 'rgba(6,10,20,0.9)';
      ctx.lineWidth = Math.max(1, unit * 0.002);
      ctx.stroke();
    }
  }

  ctx.restore();
}
