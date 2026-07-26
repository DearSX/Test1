// On-screen buttons for the things that are keyboard-only during a race.
//
// P (book pit repairs), M (manual gears), K (mute) and Esc (leave the race) had
// no touch equivalent, so on a phone those features simply didn't exist. They
// are drawn only when the device actually has touch — a desktop has the keys and
// doesn't need the clutter.
//
// The buttons also register exclusion zones with core/input.js. Without that a
// tap on a button would ALSO be read as throttle or nitro by the driving touch
// zones underneath it, and you'd blip the throttle every time you muted.

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

let regions = [];

export function hasTouch() {
  return typeof navigator !== 'undefined'
    && (navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis);
}

// The rects the driving controls must ignore.
export function buttonZones() {
  return regions.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
}

export function buttonAt(px, py) {
  for (const r of regions) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.id;
  }
  return null;
}

// state: { pitRepairs, manualGears, muted }
export function drawRaceButtons(ctx, canvas, state) {
  regions = [];
  if (!hasTouch()) return;

  const W = canvas.width, H = canvas.height;
  const unit = Math.min(W, H);

  const buttons = [
    { id: 'pit', label: 'PIT', on: state.pitRepairs, sub: state.pitRepairs ? 'FIX' : 'OFF' },
    { id: 'gears', label: 'GEAR', on: state.manualGears, sub: state.manualGears ? 'MAN' : 'AUTO' },
    { id: 'mute', label: 'SND', on: !state.muted, sub: state.muted ? 'OFF' : 'ON' },
    { id: 'menu', label: 'MENU', on: false, sub: '' },
  ];

  // Sit in the gap between the lap readouts (top left) and the gauges (top
  // right), never overlapping either.
  const leftEdge = unit * 0.035 + Math.round(unit * 0.032) * 9.8;
  const rightEdge = W - Math.min(W * 0.2, unit * 0.3) - Math.round(unit * 0.024) * 3.4 - unit * 0.045;
  const available = Math.max(rightEdge - leftEdge, unit * 0.5);

  const gap = unit * 0.012;
  const size = Math.max(
    unit * 0.085,
    Math.min(unit * 0.115, (available - gap * (buttons.length - 1)) / buttons.length));
  const totalW = size * buttons.length + gap * (buttons.length - 1);
  let x = leftEdge + Math.max(0, (available - totalW) / 2);
  const y = unit * 0.03;

  ctx.save();
  for (const b of buttons) {
    regions.push({ id: b.id, x, y, w: size, h: size });

    ctx.fillStyle = b.on ? 'rgba(125,249,255,0.22)' : 'rgba(6,10,20,0.6)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = b.on ? 'rgba(125,249,255,0.85)' : 'rgba(125,249,255,0.35)';
    ctx.lineWidth = Math.max(1, unit * 0.003);
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = b.on ? '#7df9ff' : 'rgba(230,240,255,0.85)';
    ctx.font = `700 ${Math.round(size * 0.26)}px ${FONT}`;
    ctx.fillText(b.label, x + size / 2, y + size * (b.sub ? 0.42 : 0.6));
    if (b.sub) {
      ctx.font = `700 ${Math.round(size * 0.22)}px ${FONT}`;
      ctx.fillStyle = b.on ? 'rgba(125,249,255,0.8)' : 'rgba(230,240,255,0.5)';
      ctx.fillText(b.sub, x + size / 2, y + size * 0.75);
    }

    x += size + gap;
  }
  ctx.restore();
}
