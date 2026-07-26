// Pseudo-3D road projection + rendering. Spec section 2.3.
// Segments are drawn back-to-front; x/dx accumulate per segment to bend the
// road. Each segment's p1/p2 get their camera+screen coords written in place so
// cars (M2) and scenery sprites (M6) can place themselves against the same
// projection instead of recomputing it.

import { TUNE } from '../tune.js';

export const DEFAULT_COLORS = {
  skyTop: '#0b1030',
  skyBottom: '#2a3f7a',
  grassLight: '#2e8f4e',
  grassDark: '#278245',
  roadLight: '#5a5a62',
  roadDark: '#55555d',
  rumbleLight: '#e8e8e8',
  rumbleDark: '#c8283c',
  laneLine: '#e8e8e8',
  startLine: '#ffffff',
  fog: '#2a3f7a',
};

export class RoadRenderer {
  constructor(canvas, colors = DEFAULT_COLORS) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors;
    this.cameraDepth = 1 / Math.tan((TUNE.FOV / 2) * Math.PI / 180);
    // Furthest segment actually drawn last frame — the horizon the sky and
    // (later) the theme backdrop clip against.
    this.horizonY = 0;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // Writes camera + screen coords onto a segment endpoint, in place.
  project(p, camX, camY, camZ) {
    const W = this.canvas.width, H = this.canvas.height;
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    const scale = this.cameraDepth / p.camera.z;
    p.screen.scale = scale;
    p.screen.x = Math.round((W / 2) + (scale * p.camera.x * W / 2));
    p.screen.y = Math.round((H / 2) - (scale * p.camera.y * H / 2));
    p.screen.w = Math.round(scale * TUNE.ROAD_WIDTH * W / 2);
    return p;
  }

  // position: camera z along the track (world units). playerX: -1..1.
  render(track, position, playerX) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const segLen = track.segmentLength;
    const segs = track.segments;
    const N = segs.length;

    const baseIndex = track.findIndex(position);
    const baseSegment = segs[baseIndex];
    const basePercent = (position % segLen) / segLen;
    const camY = TUNE.CAMERA_HEIGHT + track.elevationAt(position);

    this.drawBackdrop(ctx, W, H);

    let maxY = H;   // clip: never draw below ground already laid down
    let x = 0;      // accumulated bend
    let dx = -(baseSegment.curve * basePercent);
    let horizon = H;

    for (let n = 0; n < TUNE.DRAW_DISTANCE; n++) {
      const seg = segs[(baseIndex + n) % N];
      seg.looped = (baseIndex + n) >= N;
      seg.clip = maxY;

      // Wrapping is handled by pulling the camera back a whole lap for the
      // segments that live behind the start line.
      const camZ = position - (seg.looped ? track.trackLength : 0);
      this.project(seg.p1, playerX * TUNE.ROAD_WIDTH - x, camY, camZ);
      this.project(seg.p2, playerX * TUNE.ROAD_WIDTH - x - dx, camY, camZ);

      x += dx;
      dx += seg.curve;

      // Near-plane clip. Without it the segment straddling the camera divides
      // by ~0 and throws the projection to infinity.
      if (seg.p1.camera.z <= this.cameraDepth) continue;
      // Back-facing (falling away over a crest), or hidden by nearer ground.
      if (seg.p2.screen.y >= seg.p1.screen.y) continue;
      if (seg.p2.screen.y >= maxY) continue;

      this.drawSegment(ctx, W, seg);
      // Distance haze. Fades the road into the sky, and — the reason it isn't
      // optional — hides far segments that pop back into view over a crest
      // after the segments in front of them have been culled.
      const clarity = 1 / Math.pow(Math.E, (n / TUNE.DRAW_DISTANCE) ** 2 * TUNE.FOG_DENSITY);
      if (clarity < 1) {
        ctx.globalAlpha = 1 - clarity;
        ctx.fillStyle = this.colors.fog;
        ctx.fillRect(0, seg.p2.screen.y, W, seg.p1.screen.y - seg.p2.screen.y);
        ctx.globalAlpha = 1;
      }

      maxY = seg.p2.screen.y;
      if (seg.p2.screen.y < horizon) horizon = seg.p2.screen.y;
    }

    this.horizonY = horizon;
  }

  drawBackdrop(ctx, W, H) {
    const c = this.colors;
    // Runs all the way down and ends on the fog colour, so the hazed far
    // segments meet the sky with no seam. Real theme backdrops arrive at M6.
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, c.skyTop);
    sky.addColorStop(1, c.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  drawSegment(ctx, W, seg) {
    const c = this.colors;
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const alt = Math.floor(seg.index / TUNE.RUMBLE_LEN) % 2 === 0;

    // grass
    ctx.fillStyle = alt ? c.grassLight : c.grassDark;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);

    // rumble strips
    const r1 = p1.w / 6, r2 = p2.w / 6;
    const rumbleColor = alt ? c.rumbleLight : c.rumbleDark;
    poly(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rumbleColor);
    poly(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rumbleColor);

    // road surface
    poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y,
      alt ? c.roadLight : c.roadDark);

    // start/finish stripe
    if (seg.index < TUNE.RUMBLE_LEN) {
      poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.startLine);
    }

    // centre paint — decoration only. Lateral position is continuous; there are
    // no lanes to snap to.
    if (alt) {
      const l1 = p1.w / 32, l2 = p2.w / 32;
      poly(ctx, p1.x - l1, p1.y, p1.x + l1, p1.y, p2.x + l2, p2.y, p2.x - l2, p2.y, c.laneLine);
    }
  }
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
