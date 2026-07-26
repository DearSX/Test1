// Career screens: shop, standings, pre-race, season end. Section 5.
//
// Keyboard/touch driven lists rather than a widget framework — one panel helper
// and one row renderer covers all of it. Sized in fractions of the canvas so a
// portrait phone gets the same screens.

import { formatTime } from './hud.js';
import { UPGRADES } from '../data/upgrades.js';
import { DIVISIONS } from '../data/season.js';
import { TYRE_COMPOUNDS } from '../game/garage.js';
import { CARS, PAINT_OPTIONS, NUMBER_OPTIONS } from './themes/sprites.js';
import { TUNE } from '../tune.js';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

// Tap targets, rebuilt every frame by whichever screen is drawing.
//
// The screens compute their own row geometry, so they are the only thing that
// knows where a row ended up. Recording it here — rather than main.js trying to
// recompute the layout — is what keeps a tap landing on the row you can see.
let hitRegions = [];

function beginHits() { hitRegions = []; }
function addHit(x, y, w, h, action) { hitRegions.push({ x, y, w, h, action }); }

// Returns the action at a point, or null. Later regions win, so a full-screen
// fallback can be registered first and a row on top of it second.
// Dev aid: the live tap targets, for checking that what you can see is what you
// can hit. Used by the touch test.
export function debugHitRegions() { return hitRegions.map(r => ({ ...r })); }

export function hitTest(px, py) {
  for (let i = hitRegions.length - 1; i >= 0; i--) {
    const r = hitRegions[i];
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.action;
  }
  return null;
}

// Section 7. Arcade is not a lesser game — same track, same physics.
const DIFFICULTY_NOTES = {
  arcade: 'No fuel, no damage, slower rivals, softer corners',
  career: 'The game as designed',
  simulation: 'Faster rivals, damage carries between races',
};

// Reserved for the header and footer, in row heights.
const PANEL_CHROME_ROWS = 4;
// A comfortable finger target. Rows sized purely from the font came out 19px
// tall on a phone, which is far too small to hit reliably — the menus were
// unusable by touch even once tapping was wired up.
const MIN_TOUCH_ROW = 38;

function panel(ctx, canvas, { rows = 12, widthFrac = 0.92 } = {}) {
  const W = canvas.width, H = canvas.height;
  const unit = Math.min(W, H);
  const portrait = H > W;
  let s = Math.round(unit * (portrait ? 0.03 : 0.026));

  // Rows are as tall as a finger needs, then shrunk only as far as fitting the
  // screen demands — so a long list stays on screen and a short one stays chunky.
  const maxBoxH = H * 0.94;
  const total = rows + PANEL_CHROME_ROWS;
  let lineH = Math.max(s * 1.6, MIN_TOUCH_ROW);
  if (lineH * total > maxBoxH) lineH = maxBoxH / total;
  s = Math.min(s, Math.round(lineH * 0.58));

  const boxH = lineH * total;
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

// Where a row's note should start: after the label, never on top of it. A fixed
// offset overlapped as soon as a label was longer than expected.
function noteX(ctx, p, label, minColumns) {
  const labelWidth = ctx.measureText(`  ${label}`).width;
  return p.x0 + p.pad + Math.max(p.s * minColumns, labelWidth + p.s * 1.2);
}

// Draws a row's note in whatever space is left before the value column,
// truncating it rather than running through it. On a portrait phone there is
// simply not room for label + note + value + cost on one line, and drawing all
// four unconditionally left the garage unreadable — notes printed straight
// across the prices.
function drawNote(ctx, text, x, y, maxWidth) {
  if (!text || maxWidth < ctx.measureText('mmmm').width) return;
  let out = text;
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1);
    out = out.trimEnd() + '…';
  }
  ctx.fillText(out, x, y);
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

  // The ported car sprites, paint booth and number decals.
  rows.push({
    kind: 'model',
    label: 'Car',
    note: 'GT-S Coupe, Kia Soul or Lucid Air',
    value: (CARS.find(c => c.id === g.model) ?? CARS[0]).name.toUpperCase(),
    cost: null, affordable: true,
  });
  rows.push({
    kind: 'paint',
    label: 'Paint',
    note: 'Custom paint, or the car\'s stock colours',
    value: g.paint ? (PAINT_OPTIONS.find(p2 => p2.hex === g.paint)?.name ?? g.paint).toUpperCase() : 'STOCK',
    cost: null, affordable: true,
  });
  rows.push({
    kind: 'number',
    label: 'Race number',
    note: 'Roundel on the rear deck',
    value: g.number ? String(g.number) : 'NONE',
    cost: null, affordable: true,
  });

  rows.push({
    kind: 'difficulty',
    label: 'Difficulty',
    note: DIFFICULTY_NOTES[career.difficulty] ?? '',
    value: career.difficulty.toUpperCase(),
    cost: null,
    affordable: true,
  });

  rows.push({
    kind: 'standings', label: 'Championship table',
    note: 'see where you are in the season',
    value: '', cost: null, affordable: true,
  });

  rows.push({ kind: 'export', label: 'Export save file', note: 'download this career as .json', value: '', cost: null, affordable: true });
  rows.push({ kind: 'race', label: 'GO RACING', note: career.track.blurb, value: '', cost: null, affordable: true });
  return rows;
}

export function drawShop(ctx, canvas, career, selected) {
  const rows = shopRows(career);
  const p = panel(ctx, canvas, { rows: rows.length + 1 });
  beginHits();

  header(ctx, p,
    `GARAGE — ${career.division.name.toUpperCase()} ROUND ${career.seasonRace + 1}/${career.racesPerSeason}`,
    `$${career.money.toLocaleString()}`);

  let y = p.y0 + p.lineH * 2.9;
  ctx.font = `700 ${p.s}px ${FONT}`;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const on = i === selected;

    addHit(p.x0, y - p.lineH * 0.78, p.boxW, p.lineH, { screen: 'shop', row: i });

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

    // Right-hand columns first, so the note knows how much room is actually left.
    const right = p.x0 + p.boxW - p.pad;
    const costText = r.cost !== null ? `$${r.cost.toLocaleString()}`
      : r.locked ? 'LOCKED'
        : r.kind === 'upgrade' ? 'MAX' : null;

    ctx.textAlign = 'right';
    ctx.fillStyle = on ? '#ffb020' : dim;
    if (costText) ctx.fillText(costText, right, y);

    // A row with no price gets the full right edge for its value, instead of
    // leaving an empty price column and shoving the value into the note.
    const costWidth = costText ? ctx.measureText(costText).width + p.s * 0.8 : 0;
    const valueRight = right - costWidth;
    if (r.value) ctx.fillText(r.value, valueRight, y);
    const valueWidth = r.value ? ctx.measureText(r.value).width : 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = on ? 'rgba(255,176,32,0.7)' : 'rgba(230,240,255,0.35)';
    const nx = noteX(ctx, p, r.label, 11);
    ctx.font = `700 ${Math.round(p.s * 0.78)}px ${FONT}`;
    drawNote(ctx, r.note, nx, y, valueRight - valueWidth - nx - p.s * 0.6);
    ctx.font = `700 ${p.s}px ${FONT}`;

    y += p.lineH;
  }

  footer(ctx, p, `${career.track.name} · tap a row, or up/down + enter`);
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export function drawStandings(ctx, canvas, career) {
  beginHits();
  addHit(0, 0, canvas.width, canvas.height, { screen: 'standings', row: 0 });
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

  footer(ctx, p, `top ${TUNE.PROMOTION_PLACES} are promoted · tap to go back`);
}

// ---------------------------------------------------------------------------
// Pre-race
// ---------------------------------------------------------------------------

export function drawPreRace(ctx, canvas, career) {
  beginHits();
  addHit(0, 0, canvas.width, canvas.height, { screen: 'prerace', row: 0 });
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

  footer(ctx, p, 'tap to take the grid');
}

// ---------------------------------------------------------------------------
// Post-race report and season end
// ---------------------------------------------------------------------------

export function drawRaceReport(ctx, canvas, report, career) {
  beginHits();
  addHit(0, 0, canvas.width, canvas.height, { screen: 'report', row: 0 });
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

  footer(ctx, p, 'tap for the garage');
}

export function drawSeasonEnd(ctx, canvas, outcome) {
  beginHits();
  addHit(0, 0, canvas.width, canvas.height, { screen: 'season', row: 0 });
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

  footer(ctx, p, 'tap to start the next season');
}

// ---------------------------------------------------------------------------
// Save slots (M5)
// ---------------------------------------------------------------------------

export function slotRows(summaries) {
  const rows = summaries.map(sm => ({
    kind: 'slot', slot: sm.slot, summary: sm,
    label: `SLOT ${sm.slot + 1}`,
    note: sm.empty
      ? 'empty — start a new career'
      : `${sm.driverName} · ${divisionName(sm.division)} round ${sm.seasonRace + 1}/${TUNE.RACES_PER_SEASON}`,
    value: sm.empty ? '' : `$${sm.money.toLocaleString()}`,
  }));
  rows.push({ kind: 'import', label: 'IMPORT SAVE FILE', note: 'load a career from a .json file', value: '' });
  return rows;
}

export function drawSlots(ctx, canvas, summaries, selected, { message = null, persistent = true } = {}) {
  const rows = slotRows(summaries);
  const p = panel(ctx, canvas, { rows: rows.length + 3 });
  beginHits();
  header(ctx, p, 'VELOCITY 3000', 'SELECT A CAREER');

  let y = p.y0 + p.lineH * 3;
  ctx.font = `700 ${p.s}px ${FONT}`;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const on = i === selected;
    addHit(p.x0, y - p.lineH * 0.78, p.boxW, p.lineH, { screen: 'slots', row: i });
    if (on) {
      ctx.fillStyle = 'rgba(125,249,255,0.13)';
      ctx.fillRect(p.x0 + p.pad * 0.4, y - p.lineH * 0.72, p.boxW - p.pad * 0.8, p.lineH);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = on ? '#ffb020' : r.kind === 'import' ? 'rgba(125,249,255,0.75)' : 'rgba(230,240,255,0.9)';
    ctx.fillText(`${on ? '>' : ' '} ${r.label}`, p.x0 + p.pad, y);
    ctx.fillStyle = on ? 'rgba(255,176,32,0.75)' : 'rgba(230,240,255,0.4)';
    const nx = noteX(ctx, p, r.label, 7);
    ctx.font = `700 ${Math.round(p.s * 0.8)}px ${FONT}`;
    const valueLeft = p.x0 + p.boxW - p.pad - (r.value ? p.s * 6 : 0);
    drawNote(ctx, r.note, nx, y, valueLeft - nx - p.s * 0.5);
    ctx.font = `700 ${p.s}px ${FONT}`;
    if (r.value) {
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? '#ffb020' : 'rgba(230,240,255,0.8)';
      ctx.fillText(r.value, p.x0 + p.boxW - p.pad, y);
    }
    y += p.lineH;
  }

  if (message) {
    y += p.lineH * 0.4;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff7a6b';
    ctx.font = `700 ${Math.round(p.s * 0.85)}px ${FONT}`;
    ctx.fillText(message, p.x0 + p.pad, y);
  }

  if (!persistent) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb020';
    ctx.font = `700 ${Math.round(p.s * 0.8)}px ${FONT}`;
    ctx.fillText('storage is blocked — progress will not survive a reload',
      p.x0 + p.boxW / 2, p.y0 + p.boxH - p.lineH * 1.5);
  }

  footer(ctx, p, 'tap a slot to play it · or up/down + enter');
}

function divisionName(id) {
  const d = DIVISIONS.find(x => x.id === id);
  return d ? d.name : id;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
