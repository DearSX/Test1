// Career screens: shop, standings, pre-race, season end. Section 5.
//
// Keyboard/touch driven lists rather than a widget framework — one panel helper
// and one row renderer covers all of it. Sized in fractions of the canvas so a
// portrait phone gets the same screens.

import { formatTime } from './hud.js';
import { UPGRADES } from '../data/upgrades.js';
import { DIVISIONS } from '../data/season.js';
import { TYRE_COMPOUNDS } from '../game/garage.js';
import { TUNE } from '../tune.js';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

function panel(ctx, canvas, { rows = 12, widthFrac = 0.92 } = {}) {
  const W = canvas.width, H = canvas.height;
  const unit = Math.min(W, H);
  const s = Math.round(unit * (H > W ? 0.03 : 0.026));
  const lineH = s * 1.6;
  const boxH = Math.min(H * 0.94, lineH * (rows + 4));
  const boxW = Math.min(W * widthFrac, unit * 1.75);
  const x0 = (W - boxW) / 2, y0 = (H - boxH) / 2;

  ctx.fillStyle = 'rgba(5,7,16,0.93)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,14,28,0.96)';
  ctx.fillRect(x0, y0, boxW, boxH);
  ctx.strokeStyle = 'rgba(125,249,255,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 1, y0 + 1, boxW - 2, boxH - 2);

  return { W, H, unit, s, lineH, boxW, boxH, x0, y0, pad: boxW * 0.045 };
}

function header(ctx, p, title, right) {
  ctx.font = `700 ${Math.round(p.s * 1.35)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7df9ff';
  ctx.fillText(title, p.x0 + p.pad, p.y0 + p.lineH * 1.4);
  if (right) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(right, p.x0 + p.boxW - p.pad, p.y0 + p.lineH * 1.4);
  }
  ctx.strokeStyle = 'rgba(125,249,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x0 + p.pad, p.y0 + p.lineH * 1.85);
  ctx.lineTo(p.x0 + p.boxW - p.pad, p.y0 + p.lineH * 1.85);
  ctx.stroke();
}

function footer(ctx, p, text) {
  ctx.font = `700 ${Math.round(p.s * 0.85)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(125,249,255,0.55)';
  ctx.fillText(text, p.x0 + p.boxW / 2, p.y0 + p.boxH - p.lineH * 0.6);
}

// Level pips, so an upgrade's state reads at a glance.
function pips(level, max = 5) {
  return '#'.repeat(level) + '.'.repeat(Math.max(0, max - level));
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

// Returns the list of selectable rows, so main.js and the renderer can't
// disagree about what is selected.
export function shopRows(career) {
  const g = career.garage;
  const cap = career.maxUpgradeLevel;
  const rows = [];

  for (const [key, u] of Object.entries(UPGRADES)) {
    const level = g.level(key);
    const cost = g.costFor(key, cap);
    rows.push({
      kind: 'upgrade', key,
      label: u.name,
      note: u.effect,
      value: pips(level),
      cost,
      locked: cost === null && level < 5,
      affordable: cost !== null && cost <= career.money,
    });
  }

  const repair = g.repairCost();
  rows.push({
    kind: 'repair',
    label: 'Repair damage',
    note: `${Math.round(g.damage * 100)}% damage`,
    value: g.damage > 0 ? 'NEEDED' : 'OK',
    cost: repair > 0 ? repair : null,
    affordable: repair > 0 && repair <= career.money,
  });

  rows.push({
    kind: 'nitro',
    label: 'Nitro charge',
    note: `${g.nitroCharges} in the car`,
    value: pips(g.nitroCharges, 6),
    cost: 800,
    affordable: 800 <= career.money && g.nitroCharges < 6,
  });

  rows.push({
    kind: 'compound',
    label: 'Tyre compound',
    note: 'Soft grips more and wears faster',
    value: TYRE_COMPOUNDS[g.tyreCompound].name.toUpperCase(),
    cost: null,
    affordable: true,
  });

  rows.push({ kind: 'race', label: 'GO RACING', note: career.track.blurb, value: '', cost: null, affordable: true });
  return rows;
}

export function drawShop(ctx, canvas, career, selected) {
  const rows = shopRows(career);
  const p = panel(ctx, canvas, { rows: rows.length + 1 });

  header(ctx, p,
    `GARAGE — ${career.division.name.toUpperCase()} ROUND ${career.seasonRace + 1}/${career.racesPerSeason}`,
    `$${career.money.toLocaleString()}`);

  let y = p.y0 + p.lineH * 2.9;
  ctx.font = `700 ${p.s}px ${FONT}`;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const on = i === selected;

    if (on) {
      ctx.fillStyle = 'rgba(125,249,255,0.13)';
      ctx.fillRect(p.x0 + p.pad * 0.4, y - p.lineH * 0.72, p.boxW - p.pad * 0.8, p.lineH);
    }

    const dim = r.kind === 'race' ? '#4ade80'
      : r.locked ? 'rgba(230,240,255,0.3)'
        : r.cost !== null && !r.affordable ? 'rgba(255,122,107,0.75)'
          : 'rgba(230,240,255,0.9)';

    ctx.textAlign = 'left';
    ctx.fillStyle = on ? '#ffb020' : dim;
    ctx.fillText(`${on ? '>' : ' '} ${r.label}`, p.x0 + p.pad, y);

    ctx.fillStyle = on ? 'rgba(255,176,32,0.7)' : 'rgba(230,240,255,0.35)';
    ctx.font = `700 ${Math.round(p.s * 0.78)}px ${FONT}`;
    ctx.fillText(r.note, p.x0 + p.pad + p.s * 11, y);
    ctx.font = `700 ${p.s}px ${FONT}`;

    ctx.textAlign = 'right';
    ctx.fillStyle = on ? '#ffb020' : dim;
    if (r.value) ctx.fillText(r.value, p.x0 + p.boxW - p.pad - p.s * 5.5, y);
    if (r.cost !== null) ctx.fillText(`$${r.cost.toLocaleString()}`, p.x0 + p.boxW - p.pad, y);
    else if (r.locked) ctx.fillText('LOCKED', p.x0 + p.boxW - p.pad, y);
    else if (r.kind === 'upgrade') ctx.fillText('MAX', p.x0 + p.boxW - p.pad, y);

    y += p.lineH;
  }

  footer(ctx, p, `${career.track.name} · up/down select · enter buy · S standings · R race`);
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export function drawStandings(ctx, canvas, career) {
  const table = career.table();
  const shown = table.slice(0, 14);
  const me = table.find(r => r.isPlayer);
  if (me && !shown.includes(me)) shown[shown.length - 1] = me;

  const p = panel(ctx, canvas, { rows: shown.length + 2 });
  header(ctx, p,
    `${career.division.name.toUpperCase()} CHAMPIONSHIP`,
    `ROUND ${Math.min(career.seasonRace + 1, career.racesPerSeason)}/${career.racesPerSeason}`);

  const nem = career.nemesis();
  let y = p.y0 + p.lineH * 2.9;
  ctx.font = `700 ${p.s}px ${FONT}`;

  for (const r of shown) {
    const promo = r.position <= TUNE.PROMOTION_PLACES;
    ctx.textAlign = 'left';
    ctx.fillStyle = r.isPlayer ? '#ffb020' : promo ? 'rgba(74,222,128,0.85)' : 'rgba(230,240,255,0.8)';
    ctx.fillText(String(r.position).padStart(2), p.x0 + p.pad, y);
    ctx.fillText(r.isPlayer ? `${r.name} (YOU)` : r.name, p.x0 + p.pad + p.s * 2.5, y);
    if (nem && r.id === nem.id && !r.isPlayer) {
      ctx.fillStyle = '#ff7a6b';
      ctx.font = `700 ${Math.round(p.s * 0.78)}px ${FONT}`;
      ctx.fillText('NEMESIS', p.x0 + p.pad + p.s * 14, y);
      ctx.font = `700 ${p.s}px ${FONT}`;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = r.isPlayer ? '#ffb020' : 'rgba(230,240,255,0.8)';
    ctx.fillText(String(r.points), p.x0 + p.boxW - p.pad, y);
    y += p.lineH;
  }

  footer(ctx, p, `top ${TUNE.PROMOTION_PLACES} are promoted · any key to go back`);
}

// ---------------------------------------------------------------------------
// Pre-race
// ---------------------------------------------------------------------------

export function drawPreRace(ctx, canvas, career) {
  const p = panel(ctx, canvas, { rows: 9 });
  const t = career.track;
  header(ctx, p, t.name.toUpperCase(), `${career.division.laps} LAPS`);

  let y = p.y0 + p.lineH * 3;
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(p.s * 0.95)}px ${FONT}`;
  ctx.fillStyle = 'rgba(230,240,255,0.75)';
  ctx.fillText(t.blurb, p.x0 + p.pad, y);
  y += p.lineH * 1.4;

  const best = career.bestLaps[t.id];
  const lines = [
    ['DIVISION', `${career.division.name}  ·  round ${career.seasonRace + 1} of ${career.racesPerSeason}`],
    ['GRID', `you start ${TUNE.FIELD_SIZE}th of ${TUNE.FIELD_SIZE}`],
    ['YOUR BEST', best ? formatTime(best) : 'no time set'],
    ['CAR', `${Math.round(career.garage.damage * 100)}% damage  ·  ${career.garage.nitroCharges} nitro  ·  ${TYRE_COMPOUNDS[career.garage.tyreCompound].name} tyres`],
  ];
  for (const [k, v] of lines) {
    ctx.fillStyle = 'rgba(125,249,255,0.6)';
    ctx.fillText(k, p.x0 + p.pad, y);
    ctx.fillStyle = 'rgba(230,240,255,0.9)';
    ctx.fillText(v, p.x0 + p.pad + p.s * 7, y);
    y += p.lineH;
  }

  const nem = career.nemesis();
  if (nem && !nem.isPlayer) {
    y += p.lineH * 0.3;
    ctx.fillStyle = '#ff7a6b';
    ctx.fillText(`NEMESIS  ${nem.name} — ${nem.points} pts`, p.x0 + p.pad, y);
  }

  footer(ctx, p, 'press enter to take the grid');
}

// ---------------------------------------------------------------------------
// Post-race report and season end
// ---------------------------------------------------------------------------

export function drawRaceReport(ctx, canvas, report, career) {
  const p = panel(ctx, canvas, { rows: 9 });
  header(ctx, p, `${report.trackName.toUpperCase()} — RESULT`, `$${report.moneyAfter.toLocaleString()}`);

  let y = p.y0 + p.lineH * 3;
  ctx.textAlign = 'left';
  ctx.font = `700 ${p.s}px ${FONT}`;

  const lines = [
    ['FINISHED', `${ordinal(report.position)} of ${TUNE.FIELD_SIZE}`],
    ['POINTS', `+${report.points}`],
    ['PRIZE', `+$${report.prize.toLocaleString()}`],
    ['BEST LAP', `${formatTime(report.bestLap)}${report.isRecord ? '   NEW RECORD' : ''}`],
    ['DAMAGE', `${Math.round(report.damageTaken * 100)}% taken`],
    ['REPAIRS', report.repairPaid > 0 ? `-$${report.repairPaid.toLocaleString()}` : 'none needed'],
    ['NET', `${report.net < 0 ? '-' : '+'}$${Math.abs(report.net).toLocaleString()}`],
  ];
  for (const [k, v] of lines) {
    ctx.fillStyle = 'rgba(125,249,255,0.6)';
    ctx.fillText(k, p.x0 + p.pad, y);
    ctx.fillStyle = (k === 'NET' && report.net < 0) || k === 'REPAIRS' && report.repairPaid > report.prize
      ? '#ff7a6b' : 'rgba(230,240,255,0.9)';
    ctx.fillText(v, p.x0 + p.pad + p.s * 8, y);
    y += p.lineH;
  }

  if (report.net < 0) {
    y += p.lineH * 0.3;
    ctx.fillStyle = '#ff7a6b';
    ctx.font = `700 ${Math.round(p.s * 0.85)}px ${FONT}`;
    ctx.fillText('repairs cost more than you won', p.x0 + p.pad, y);
  }

  footer(ctx, p, 'press enter for the garage');
}

export function drawSeasonEnd(ctx, canvas, outcome) {
  const p = panel(ctx, canvas, { rows: 7 });
  header(ctx, p, 'SEASON OVER', outcome.division.toUpperCase());

  const W = canvas.width;
  let y = p.y0 + p.lineH * 3.2;
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(p.s * 1.6)}px ${FONT}`;
  ctx.fillStyle = outcome.promoted ? '#4ade80' : '#ffb020';
  ctx.fillText(`${ordinal(outcome.championshipPosition)} in the championship`, W / 2, y);
  y += p.lineH * 1.8;

  ctx.font = `700 ${p.s}px ${FONT}`;
  ctx.fillStyle = 'rgba(230,240,255,0.85)';
  ctx.fillText(`${outcome.points} points`, W / 2, y);
  y += p.lineH * 1.4;

  ctx.fillStyle = outcome.promoted ? '#4ade80' : 'rgba(255,122,107,0.9)';
  ctx.fillText(outcome.promoted
    ? `PROMOTED TO ${outcome.nextDivision.toUpperCase()}`
    : outcome.championOfDivision
      ? 'CHAMPION — nowhere left to be promoted to'
      : `stayed in ${outcome.division} — top ${TUNE.PROMOTION_PLACES} go up`, W / 2, y);

  footer(ctx, p, 'press enter to start the next season');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
