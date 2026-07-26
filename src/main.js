// M0 bootstrap. Done when: the road bends and hills correctly at a constant speed.
// No input, no physics — the camera cruises the authored track on rails.

import { TUNE } from './tune.js';
import { startLoop } from './core/loop.js';
import { RoadRenderer } from './render/road.js';
import { buildIslandTrack } from './data/tracks/island.js';

const canvas = document.getElementById('game');
const renderer = new RoadRenderer(canvas);
const track = buildIslandTrack();

// prev + current so render can interpolate between fixed-timestep states
const state = {
  position: 0,       // camera z along the track
  prevPosition: 0,
  playerX: 0,        // continuous lateral position, -1..1. Fixed at 0 for M0.
};

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function update(dt) {
  state.prevPosition = state.position;
  state.position = wrap(state.position + TUNE.M0_CRUISE_SPEED * dt);
}

function render(alpha) {
  // Interpolate along the shorter way round so the lap seam doesn't hitch.
  let delta = state.position - state.prevPosition;
  if (delta < -track.trackLength / 2) delta += track.trackLength;
  const pos = wrap(state.prevPosition + delta * alpha);

  renderer.render(track, pos, state.playerX);
  drawDebug(pos);
}

function wrap(z) {
  const L = track.trackLength;
  return ((z % L) + L) % L;
}

function drawDebug(pos) {
  const ctx = renderer.ctx;
  const seg = track.findSegment(pos);
  ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(125, 249, 255, 0.85)';
  ctx.textAlign = 'right';
  ctx.fillText(
    `seg ${seg.index}/${track.segments.length}  curve ${track.curveAt(pos).toFixed(2)}  y ${Math.round(track.elevationAt(pos))}`,
    canvas.width - 12, 22
  );
}

startLoop(update, render);
