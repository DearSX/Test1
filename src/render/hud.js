// HUD. Analog speedo + tacho with gear, lap counter, lap times, nitro, and a
// grip meter that tells you how close the corner is to spitting you out.
//
// Position/fuel/damage/minimap join this at their milestones (M2/M4/M6). Laid
// out in fractions of canvas size so portrait phones stay readable.

import { TUNE } from '../tune.js';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

export function drawHud(ctx, canvas, car, race = {}) {
  const W = canvas.width, H = canvas.height;
  const portrait = H > W;
  const unit = Math.min(W, H);
  const r = unit * (portrait ? 0.17 : 0.13);
  const pad = unit * 0.04;

  drawSpeedo(ctx, W - r - pad, H - r - pad, r, car);
  drawTacho(ctx, pad + r * 0.75, H - pad - r * 0.4, r * 0.75, car);
  drawGripMeter(ctx, W / 2, H - pad * 0.5, W * 0.24, unit * 0.014, car);
  drawReadouts(ctx, W, H, unit, car, race);
  drawWarnings(ctx, W, H, unit, car);
}

function drawSpeedo(ctx, cx, cy, r, car) {
  const maxKmh = Math.ceil((TUNE.BASE_MAX_SPEED * 1.4 * TUNE.SPEED_TO_KMH) / 50) * 50;
  const start = Math.PI * 0.78, end = Math.PI * 2.22;

  ctx.save();
  ctx.fillStyle = 'rgba(6,10,20,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(125,249,255,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, start, end); ctx.stroke();

  // ticks
  ctx.strokeStyle = 'rgba(230,240,255,0.7)';
  for (let kmh = 0; kmh <= maxKmh; kmh += 50) {
    const a = start + (end - start) * (kmh / maxKmh);
    const inner = r * (kmh % 100 === 0 ? 0.68 : 0.78);
    ctx.lineWidth = kmh % 100 === 0 ? Math.max(1, r * 0.035) : Math.max(1, r * 0.02);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
    ctx.stroke();
  }

  // needle
  const pct = Math.min(car.speedKmh / maxKmh, 1);
  const a = start + (end - start) * pct;
  ctx.strokeStyle = car.offRoad ? '#ffb020' : '#ff4438';
  ctx.lineWidth = Math.max(2, r * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
  ctx.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
  ctx.stroke();

  ctx.fillStyle = '#e6f0ff';
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(r * 0.36)}px ${FONT}`;
  ctx.fillText(String(Math.round(car.speedKmh)), cx, cy + r * 0.5);
  ctx.font = `700 ${Math.round(r * 0.15)}px ${FONT}`;
  ctx.fillStyle = 'rgba(230,240,255,0.6)';
  ctx.fillText('KM/H', cx, cy + r * 0.68);
  ctx.restore();
}

function drawTacho(ctx, cx, cy, r, car) {
  const start = Math.PI * 0.85, end = Math.PI * 2.15;
  const pct = Math.min(car.rpm / TUNE.RPM_REDLINE, 1.05);
  const redline = 0.88;

  ctx.save();
  ctx.fillStyle = 'rgba(6,10,20,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.lineWidth = Math.max(2, r * 0.13);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(125,249,255,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, start, end); ctx.stroke();

  // redline zone
  ctx.strokeStyle = 'rgba(255,60,50,0.5)';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, start + (end - start) * redline, end); ctx.stroke();

  // rev bar
  ctx.strokeStyle = pct > redline ? '#ff4438' : '#7df9ff';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, start, start + (end - start) * Math.min(pct, 1)); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = car.shiftFlash > 0 ? '#7df9ff' : '#e6f0ff';
  ctx.font = `700 ${Math.round(r * 0.72)}px ${FONT}`;
  ctx.fillText(String(car.gear + 1), cx, cy + r * 0.26);
  ctx.font = `700 ${Math.round(r * 0.17)}px ${FONT}`;
  ctx.fillStyle = 'rgba(230,240,255,0.55)';
  ctx.fillText(car.manualGears ? 'MANUAL' : 'AUTO', cx, cy + r * 0.58);
  ctx.restore();
}

// How much of the tyres' lateral grip the corner is using. Full = you are
// leaving the road whether you like it or not.
function drawGripMeter(ctx, cx, bottomY, w, h, car) {
  const x = cx - w / 2, y = bottomY - h;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,20,0.6)';
  ctx.fillRect(x, y, w, h);
  const pct = Math.min(car.lateralSlip, 1);
  ctx.fillStyle = pct > 0.92 ? '#ff4438' : pct > 0.7 ? '#ffb020' : '#7df9ff';
  ctx.fillRect(x, y, w * pct, h);
  ctx.strokeStyle = 'rgba(230,240,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(230,240,255,0.55)';
  ctx.font = `700 ${Math.round(h * 1.5)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('GRIP', cx, y - h * 0.6);
  ctx.restore();
}

function drawReadouts(ctx, W, H, unit, car, race) {
  const s = Math.round(unit * 0.032);
  const pad = unit * 0.035;
  ctx.save();
  ctx.font = `700 ${s}px ${FONT}`;
  ctx.textAlign = 'left';

  const rows = [];
  if (race.lap !== undefined) rows.push(['LAP', `${Math.min(race.lap, race.totalLaps)}/${race.totalLaps}`]);
  if (race.position !== undefined) rows.push(['POS', `${race.position}/${race.fieldSize}`]);
  rows.push(['TIME', formatTime(race.lapTime ?? 0)]);
  rows.push(['BEST', race.bestLap ? formatTime(race.bestLap) : '--:--.---']);
  rows.push(['NITRO', '|'.repeat(car.nitroCharges) || '-']);

  let y = pad + s;
  for (const [label, value] of rows) {
    ctx.fillStyle = 'rgba(125,249,255,0.65)';
    ctx.fillText(label, pad, y);
    ctx.fillStyle = '#e6f0ff';
    ctx.fillText(value, pad + s * 3.6, y);
    y += s * 1.35;
  }

  if (race.lastLapDelta !== undefined && race.lastLapDelta !== null) {
    ctx.fillStyle = race.lastLapDelta <= 0 ? '#4ade80' : '#ff7a6b';
    ctx.fillText(
      `${race.lastLapDelta <= 0 ? '-' : '+'}${formatTime(Math.abs(race.lastLapDelta))}`,
      pad + s * 3.6, y);
  }
  ctx.restore();
}

function drawWarnings(ctx, W, H, unit, car) {
  let text = null, color = null;
  if (car.crashed) { text = 'CRASH'; color = '#ff4438'; }
  else if (car.offRoad) { text = 'OFF ROAD'; color = '#ffb020'; }
  if (!text) return;
  ctx.save();
  ctx.font = `700 ${Math.round(unit * 0.07)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, H * 0.22);
  ctx.restore();
}

// Lights out. Big, central, unmissable.
export function drawCountdown(ctx, canvas, seconds) {
  const W = canvas.width, H = canvas.height;
  const unit = Math.min(W, H);
  const n = Math.ceil(seconds);
  const text = n <= 0 ? 'GO' : String(n);
  const frac = seconds - Math.floor(seconds);   // 1 -> 0 within each second

  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.35 + frac * 0.65;
  ctx.font = `700 ${Math.round(unit * (n <= 0 ? 0.22 : 0.3))}px ${FONT}`;
  ctx.fillStyle = n <= 0 ? '#4ade80' : n === 1 ? '#ffb020' : '#ff4438';
  ctx.fillText(text, W / 2, H * 0.42);
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.round(unit * 0.03)}px ${FONT}`;
  ctx.fillStyle = 'rgba(230,240,255,0.7)';
  ctx.fillText('HOLD THE LINE', W / 2, H * 0.5);
  ctx.restore();
}

// Post-race classification.
export function drawResults(ctx, canvas, results, { title = 'RACE RESULT', footer = 'press R to race again' } = {}) {
  const W = canvas.width, H = canvas.height;
  const unit = Math.min(W, H);
  const rows = Math.min(results.length, H > W ? 12 : 10);
  const s = Math.round(unit * (H > W ? 0.028 : 0.026));
  const lineH = s * 1.55;
  const boxH = lineH * (rows + 3.2);
  const boxW = Math.min(W * 0.92, unit * 1.5);
  const x0 = (W - boxW) / 2, y0 = (H - boxH) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(5,7,16,0.88)';
  ctx.fillRect(x0, y0, boxW, boxH);
  ctx.strokeStyle = 'rgba(125,249,255,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 1, y0 + 1, boxW - 2, boxH - 2);

  ctx.font = `700 ${Math.round(s * 1.4)}px ${FONT}`;
  ctx.fillStyle = '#7df9ff';
  ctx.textAlign = 'center';
  ctx.fillText(title, W / 2, y0 + lineH * 1.3);

  ctx.font = `700 ${s}px ${FONT}`;
  const pad = boxW * 0.05;
  const colPos = x0 + pad, colName = x0 + pad + s * 2.8;
  const colBest = x0 + boxW - pad - s * 9, colGap = x0 + boxW - pad;

  const winner = results[0];
  // Always show the player's row, even if they finished outside the visible rows.
  const shown = results.slice(0, rows);
  const me = results.find(r => r.isPlayer);
  if (me && !shown.includes(me)) shown[shown.length - 1] = me;

  let y = y0 + lineH * 2.6;
  for (const r of shown) {
    ctx.textAlign = 'left';
    ctx.fillStyle = r.isPlayer ? '#ffb020' : 'rgba(230,240,255,0.85)';
    ctx.fillText(String(r.position), colPos, y);
    ctx.fillText(r.isPlayer ? 'YOU' : r.name, colName, y);
    ctx.fillStyle = r.isPlayer ? '#ffb020' : 'rgba(230,240,255,0.55)';
    ctx.fillText(formatTime(r.bestLap), colBest, y);
    ctx.textAlign = 'right';
    const gap = r.finishTime - winner.finishTime;
    ctx.fillText(gap <= 0 ? 'WIN' : `+${gap.toFixed(1)}s`, colGap, y);
    y += lineH;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(125,249,255,0.6)';
  ctx.fillText(footer, W / 2, y0 + boxH - lineH * 0.7);
  ctx.restore();
}

export function formatTime(ms) {
  if (!isFinite(ms) || ms < 0) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}
