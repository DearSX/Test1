// Pseudo-3D road projection + rendering. Spec section 2.3.
// Segments are drawn back-to-front; x/dx accumulate per segment to bend the
// road. Each segment's p1/p2 get their camera+screen coords written in place so
// cars (M2) and scenery sprites (M6) can place themselves against the same
// projection instead of recomputing it.

import { TUNE } from '../tune.js';
import { setBackdrop, drawSky, MARKINGS } from './themes/index.js';

// The pre-M6 placeholder palette, kept only as the fallback when no theme is
// supplied. Real tracks pass a palette ported from top-flush-3-10.html.
export const DEFAULT_COLORS = {
  grassLight: '#2e8f4e',
  grassDark: '#278245',
  roadLight: '#5a5a62',
  roadDark: '#55555d',
  shoulder: 'rgba(120,110,90,.5)',
  fleck: null,
  sky: '#8fdcff',
};

export class RoadRenderer {
  constructor(canvas, colors = DEFAULT_COLORS) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors;
    this.themeIndex = 0;
    this.cameraDepth = 1 / Math.tan((TUNE.FOV / 2) * Math.PI / 180);
    // Furthest segment actually drawn last frame — the horizon the sky and
    // (later) the theme backdrop clip against.
    this.horizonY = 0;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // Swap in a ported theme: its road palette, and which backdrop branch to draw.
  setTheme({ palette, index }) {
    if (palette) this.colors = palette;
    if (index !== undefined) this.themeIndex = index;
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
    // Cars and scenery are drawn in a second pass, far to near, against the
    // projection this pass just wrote onto the segments.
    this.baseIndex = baseIndex;
    this.basePosition = position;
    const baseSegment = segs[baseIndex];
    const basePercent = (position % segLen) / segLen;
    const camY = TUNE.CAMERA_HEIGHT + track.elevationAt(position);

    this.drawBackdrop(ctx, W, H, baseSegment.curve);

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
        ctx.fillStyle = this.colors.night ? '#0a1020' : this.colors.sky;
        ctx.fillRect(0, seg.p2.screen.y, W, seg.p1.screen.y - seg.p2.screen.y);
        ctx.globalAlpha = 1;
      }

      maxY = seg.p2.screen.y;
      if (seg.p2.screen.y < horizon) horizon = seg.p2.screen.y;
    }

    this.horizonY = horizon;
  }

  // The ported backdrop. drawSky() paints sky, sun, clouds, the ocean band and
  // whichever theme silhouette applies — island hills, the Providence skyline,
  // the Cordillera, or the Costa Rican volcano.
  drawBackdrop(ctx, W, H, curve) {
    setBackdrop(ctx, {
      W, H,
      horizonY: H * 0.5,        // where this projection puts the horizon
      curve: curve * 12,        // the original's curve was a screen-space offset
      theme: this.themeIndex,
      dpr: 1,
    });
    drawSky(this.time ?? 0);
    if (this.colors.night) {
      // Providence Night: the ported daylight backdrop, darkened. Nothing in the
      // original was drawn at night, and inventing one would be restyling.
      // Heavy enough to put the ported daylight sun and clouds down to a faint
      // glow, which is as close to night as dimming can get without redrawing
      // art the plan says not to touch.
      ctx.fillStyle = 'rgba(6,10,26,0.8)';
      ctx.fillRect(0, 0, W, H * 0.5 + 2);
    }
  }

  drawSegment(ctx, W, seg) {
    const c = this.colors;
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const alt = Math.floor(seg.index / TUNE.RUMBLE_LEN) % 2 === 0;

    // grass / roadside
    ctx.fillStyle = alt ? c.grassLight : c.grassDark;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);

    // the original's grass texture fleck, on the themes that had one
    if (alt && c.fleck) {
      ctx.fillStyle = c.fleck;
      ctx.fillRect((seg.index * c.fleckSeed) % W, p2.y, p1.w * 0.04, p1.y - p2.y);
    }

    // gravel shoulder, then the red/white curbs
    const sh = Math.max(1.5, p1.w * 0.05);
    ctx.fillStyle = c.shoulder;
    poly(ctx, p1.x - p1.w - sh, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - sh, p2.y, c.shoulder);
    poly(ctx, p1.x + p1.w + sh, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + sh, p2.y, c.shoulder);

    const r1 = p1.w / 6, r2 = p2.w / 6;
    const rumbleColor = alt ? MARKINGS.curbLight : MARKINGS.curbDark;
    poly(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rumbleColor);
    poly(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rumbleColor);

    // road surface
    poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y,
      alt ? c.roadLight : c.roadDark);

    // start/finish stripe
    if (seg.index < TUNE.RUMBLE_LEN) {
      poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, MARKINGS.curbLight);
    }

    // The original's lane dividers and dashed yellow centreline. Decoration
    // only: lateral position is continuous and there are no lanes to snap to.
    const lw1 = Math.max(1.5, p1.w * 0.02), lw2 = Math.max(1.5, p2.w * 0.02);
    ctx.fillStyle = MARKINGS.lane;
    for (const side of [-0.3, 0.3]) {
      poly(ctx,
        p1.x + p1.w * side - lw1 / 2, p1.y, p1.x + p1.w * side + lw1 / 2, p1.y,
        p2.x + p2.w * side + lw2 / 2, p2.y, p2.x + p2.w * side - lw2 / 2, p2.y,
        MARKINGS.lane);
    }
    if (alt) {
      poly(ctx, p1.x - lw1, p1.y, p1.x + lw1, p1.y, p2.x + lw2, p2.y, p2.x - lw2, p2.y,
        MARKINGS.centreLine);
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
