// M3 bootstrap. Done when: buying tyres measurably changes your lap time.
//
// The whole career loop: garage -> pre-race -> race -> report -> garage, with an
// 8-race season, championship points, prize money and promotion. Fuel and pit
// strategy arrive at M4; saving arrives at M5.

import { TUNE } from './tune.js';
import { startLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { RoadRenderer } from './render/road.js';
import { drawPlayer, drawCars } from './render/cars.js';
import { drawHud, drawCountdown, drawResults } from './render/hud.js';
import {
  drawShop, drawStandings, drawPreRace, drawRaceReport, drawSeasonEnd, shopRows,
} from './render/screens.js';
import { Effects } from './render/effects.js';
import { Race, PHASE } from './game/race.js';
import { Career } from './game/career.js';
import { TYRE_COMPOUNDS } from './game/garage.js';
import { getTrack } from './data/tracks/index.js';

const SCREEN = {
  SHOP: 'shop', STANDINGS: 'standings', PRERACE: 'prerace',
  RACE: 'race', RESULTS: 'results', REPORT: 'report', SEASON: 'season',
};

const canvas = document.getElementById('game');
const controlsHint = document.getElementById('controls');
const renderer = new RoadRenderer(canvas);
const input = new Input();
const effects = new Effects();

const app = {
  screen: SCREEN.SHOP,
  career: new Career(),
  race: null,
  track: null,
  sel: 0,
  report: null,
  seasonOutcome: null,
};

let prev = { trackPos: 0, x: 0 };

input.attachTouch(canvas);

function resize() { renderer.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ---------------------------------------------------------------------------
// screen transitions
// ---------------------------------------------------------------------------

function startRace() {
  const cfg = app.career.raceConfig();
  app.track = getTrack(cfg.track.id);
  app.race = new Race(app.track, cfg);
  app.race.player.nitroCharges = app.career.garage.nitroCharges;
  app.race.player.damage = app.career.garage.damage;
  prev = { trackPos: app.race.player.trackPos, x: app.race.player.x };
  app.screen = SCREEN.RACE;
}

function finishRace() {
  app.report = app.career.settleRace(app.race.results(), app.race.player);
  app.screen = SCREEN.REPORT;
}

function leaveReport() {
  if (app.career.seasonComplete) {
    app.seasonOutcome = app.career.concludeSeason();
    app.screen = SCREEN.SEASON;
  } else {
    app.sel = 0;
    app.screen = SCREEN.SHOP;
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

window.addEventListener('keydown', e => {
  const code = e.code;
  if (['ArrowUp', 'ArrowDown', 'Enter', 'Space'].includes(code)) e.preventDefault();

  switch (app.screen) {
    case SCREEN.SHOP: return shopKey(code);
    case SCREEN.STANDINGS: app.screen = SCREEN.SHOP; return;
    case SCREEN.PRERACE:
      if (code === 'Enter' || code === 'Space') startRace();
      if (code === 'Escape') app.screen = SCREEN.SHOP;
      return;
    case SCREEN.RACE:
      if (code === 'KeyM') app.race.player.manualGears = !app.race.player.manualGears;
      if (code === 'Escape') app.screen = SCREEN.SHOP;
      return;
    case SCREEN.RESULTS:
      if (code === 'Enter' || code === 'Space') finishRace();
      return;
    case SCREEN.REPORT:
      if (code === 'Enter' || code === 'Space') leaveReport();
      return;
    case SCREEN.SEASON:
      if (code === 'Enter' || code === 'Space') { app.sel = 0; app.screen = SCREEN.SHOP; }
      return;
  }
});

function shopKey(code) {
  const rows = shopRows(app.career);
  if (code === 'ArrowUp') app.sel = (app.sel - 1 + rows.length) % rows.length;
  if (code === 'ArrowDown') app.sel = (app.sel + 1) % rows.length;
  if (code === 'KeyS') { app.screen = SCREEN.STANDINGS; return; }
  if (code === 'KeyR') { app.screen = SCREEN.PRERACE; return; }
  if (code !== 'Enter' && code !== 'Space') return;

  const row = rows[app.sel];
  const g = app.career.garage;

  switch (row.kind) {
    case 'upgrade': {
      const r = g.buy(row.key, app.career.money, app.career.maxUpgradeLevel);
      if (r.ok) app.career.money -= r.spent;
      break;
    }
    case 'repair': {
      const r = g.repair(app.career.money);
      if (r.ok) app.career.money -= r.spent;
      break;
    }
    case 'nitro': {
      const r = g.buyNitro(app.career.money);
      if (r.ok) app.career.money -= r.spent;
      break;
    }
    case 'compound': {
      const keys = Object.keys(TYRE_COMPOUNDS);
      g.tyreCompound = keys[(keys.indexOf(g.tyreCompound) + 1) % keys.length];
      break;
    }
    case 'race':
      app.screen = SCREEN.PRERACE;
      break;
  }
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------

function update(dt) {
  if (app.screen !== SCREEN.RACE) {
    input.sample(dt);   // keep edge detection honest across screens
    return;
  }

  const car = app.race.player;
  prev.trackPos = car.trackPos;
  prev.x = car.x;

  app.race.update(dt, input.sample(dt));
  effects.update(dt, car, canvas);

  if (app.race.playerEntry.finished && app.race.phase === PHASE.FINISHED) {
    app.screen = SCREEN.RESULTS;
  }
}

function render(alpha) {
  const ctx = renderer.ctx;

  // The driving-controls hint only makes sense while driving; on the garage and
  // standings screens it just contradicts the footer.
  if (controlsHint) {
    controlsHint.style.display = app.screen === SCREEN.RACE ? '' : 'none';
  }

  if (app.screen === SCREEN.RACE || app.screen === SCREEN.RESULTS) {
    renderRace(ctx, alpha);
  } else {
    ctx.fillStyle = '#05060e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  switch (app.screen) {
    case SCREEN.SHOP: drawShop(ctx, canvas, app.career, app.sel); break;
    case SCREEN.STANDINGS: drawStandings(ctx, canvas, app.career); break;
    case SCREEN.PRERACE: drawPreRace(ctx, canvas, app.career); break;
    case SCREEN.RESULTS: drawResults(ctx, canvas, app.race.results(), {
      title: 'RACE RESULT', footer: 'press enter to collect your winnings',
    }); break;
    case SCREEN.REPORT: drawRaceReport(ctx, canvas, app.report, app.career); break;
    case SCREEN.SEASON: drawSeasonEnd(ctx, canvas, app.seasonOutcome); break;
  }
}

function renderRace(ctx, alpha) {
  const race = app.race, track = app.track, car = race.player;

  let d = car.trackPos - prev.trackPos;
  if (d < -track.trackLength / 2) d += track.trackLength;
  const pos = wrap(prev.trackPos + d * alpha, track.trackLength);
  const x = prev.x + (car.x - prev.x) * alpha;

  const shaken = effects.beginShake(ctx, canvas);
  renderer.render(track, pos, x);
  drawCars(ctx, canvas, renderer, track, race.entries
    .filter(e => !e.isPlayer)
    .map(e => ({ trackPos: e.car.trackPos, x: e.car.x, paint: rivalPaint(e) })), pos);
  drawPlayer(ctx, canvas, car, input.state);
  effects.draw(ctx);
  effects.endShake(ctx, shaken);

  drawHud(ctx, canvas, car, race.hudState());
  if (race.phase === PHASE.COUNTDOWN) drawCountdown(ctx, canvas, race.countdown);
}

function rivalPaint(entry) {
  if (!entry._paint) {
    entry._paint = { body: entry.identity.paint, trim: '#e8e8ee', glass: '#16222f' };
  }
  return entry._paint;
}

function wrap(z, L) { return ((z % L) + L) % L; }

startLoop(update, render);
