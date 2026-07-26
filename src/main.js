// M5 bootstrap. Done when: you can close the tab mid-season and come back.
//
// The whole game: slot picker -> garage -> pre-race -> race -> report -> garage,
// across 8-race seasons and four divisions, autosaving at every point the state
// actually changes.

import { TUNE } from './tune.js';
import { startLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { RoadRenderer } from './render/road.js';
import { drawPlayer, drawCars } from './render/cars.js';
import { drawHud, drawCountdown, drawResults } from './render/hud.js';
import {
  drawShop, drawStandings, drawPreRace, drawRaceReport, drawSeasonEnd, drawSlots,
  shopRows, slotRows, hitTest, debugHitRegions,
} from './render/screens.js';
import { SaveStore, downloadSave, pickSaveFile } from './core/storage.js';
import { Audio } from './core/audio.js';
import { drawMinimap } from './render/minimap.js';
import { themeFor, placeScenery, drawScenery, buildBackdrop } from './render/themes/index.js';
import { DIFFICULTY } from './game/career.js';
import { Effects } from './render/effects.js';
import { Race, PHASE } from './game/race.js';
import { Career } from './game/career.js';
import { TYRE_COMPOUNDS } from './game/garage.js';
import { CARS, PAINT_OPTIONS, NUMBER_OPTIONS } from './render/themes/sprites.js';
import { getTrack } from './data/tracks/index.js';

const SCREEN = {
  SLOTS: 'slots', SHOP: 'shop', STANDINGS: 'standings', PRERACE: 'prerace',
  RACE: 'race', RESULTS: 'results', REPORT: 'report', SEASON: 'season',
};

const canvas = document.getElementById('game');
const controlsHint = document.getElementById('controls');
const renderer = new RoadRenderer(canvas);
const input = new Input();
const effects = new Effects();

const store = new SaveStore();
const audio = new Audio();

const app = {
  screen: SCREEN.SLOTS,
  career: null,
  slot: null,
  race: null,
  track: null,
  theme: null,
  sel: 0,
  report: null,
  seasonOutcome: null,
  message: null,
};

// Autosave. Called after anything that changes career state — a race result, a
// purchase, a season rolling over. Section 6 asks for exactly those three, and
// the cost of writing a few KB of JSON is nil next to losing a season.
function autosave() {
  if (!app.career || app.slot === null) return;
  if (!store.write(app.slot, app.career.toSave())) {
    app.message = 'Could not save — browser storage is full or blocked.';
  }
}

function startCareer(slot, save = null) {
  app.slot = slot;
  app.career = save ? Career.fromSave(save) : new Career();
  app.sel = 0;
  app.message = null;
  app.screen = app.career.seasonComplete ? SCREEN.SHOP : SCREEN.SHOP;
  autosave();
}

let prev = { trackPos: 0, x: 0 };

input.attachTouch(canvas);

// Audio must not exist before a user gesture (section 11). These listeners are
// the only place it gets created, and they remove themselves once it has.
function firstGesture() {
  if (audio.unlock()) {
    audio.setMuted(app.career ? app.career.settings.muted : false);
    window.removeEventListener('keydown', firstGesture);
    window.removeEventListener('pointerdown', firstGesture);
    window.removeEventListener('touchstart', firstGesture);
  }
}
window.addEventListener('keydown', firstGesture);
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('touchstart', firstGesture);

// Touch/click on the menu screens. Without this the whole game is unreachable on
// a phone: the driving controls were wired for touch but every screen — slots,
// garage, results — was keydown-only, so a phone could not get past the first
// screen at all.
canvas.addEventListener('pointerdown', e => {
  if (app.screen === SCREEN.RACE) return;      // driving owns touch during a race
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  e.preventDefault();

  // Screens drawn by hud.js have no hit-region table; a tap anywhere continues.
  if (app.screen === SCREEN.RESULTS) { finishRace(); return; }

  const action = hitTest(x, y);
  if (!action) return;

  switch (action.screen) {
    case 'slots': activateSlotRow(action.row); break;
    case 'shop': activateShopRow(action.row); break;
    case 'standings': app.screen = SCREEN.SHOP; break;
    case 'prerace': startRace(); break;
    case 'results': finishRace(); break;
    case 'report': leaveReport(); break;
    case 'season': app.sel = 0; app.screen = SCREEN.SHOP; break;
  }
});

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
  // The ported backdrop's hills, clouds and skyline are laid out in canvas
  // space, so they are rebuilt whenever that changes.
  buildBackdrop(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ---------------------------------------------------------------------------
// screen transitions
// ---------------------------------------------------------------------------

function startRace() {
  const cfg = app.career.raceConfig();
  app.track = getTrack(cfg.track.id);
  // Ported palette + backdrop for this circuit, and its roadside objects.
  app.theme = themeFor(cfg.track);
  renderer.setTheme(app.theme);
  placeScenery(app.track, cfg.track);
  app.race = new Race(app.track, cfg);
  app.race.player.nitroCharges = app.career.garage.nitroCharges;
  app.race.player.damage = app.career.garage.damage;
  app.race.player.manualGears = app.career.settings.manualGears;
  prev = { trackPos: app.race.player.trackPos, x: app.race.player.x };
  app.screen = SCREEN.RACE;
}

function finishRace() {
  app.report = app.career.settleRace(app.race.results(), app.race.player, {
    pitRepairDamage: app.race.playerPitRepairDamage,
  });
  autosave();                   // race finish
  app.screen = SCREEN.REPORT;
}

function leaveReport() {
  if (app.career.seasonComplete) {
    app.seasonOutcome = app.career.concludeSeason();
    autosave();                 // season transition
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

  // Mute works on every screen, and is remembered with the career.
  if (code === 'KeyK') {
    const muted = audio.toggleMute();
    if (app.career) { app.career.settings.muted = muted; autosave(); }
    app.message = muted ? 'Audio muted (K).' : null;
    return;
  }

  switch (app.screen) {
    case SCREEN.SLOTS: return slotsKey(code);
    case SCREEN.SHOP: return shopKey(code);
    case SCREEN.STANDINGS: app.screen = SCREEN.SHOP; return;
    case SCREEN.PRERACE:
      if (code === 'Enter' || code === 'Space') startRace();
      if (code === 'Escape') app.screen = SCREEN.SHOP;
      return;
    case SCREEN.RACE:
      if (code === 'KeyM') {
        app.race.player.manualGears = !app.race.player.manualGears;
        app.career.settings.manualGears = app.race.player.manualGears;
      }
      if (code === 'KeyP') app.race.pitRepairRequested = !app.race.pitRepairRequested;
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

function slotsKey(code) {
  const rows = slotRows(store.summaries());
  if (code === 'ArrowUp') { app.sel = (app.sel - 1 + rows.length) % rows.length; return; }
  if (code === 'ArrowDown') { app.sel = (app.sel + 1) % rows.length; return; }

  const row = rows[app.sel];

  if (code === 'KeyD' && row.kind === 'slot' && !row.summary.empty) {
    store.clear(row.slot);
    app.message = `Slot ${row.slot + 1} deleted.`;
    return;
  }
  if (code !== 'Enter' && code !== 'Space') return;
  activateSlotRow(app.sel);
}

function activateSlotRow(index) {
  const rows = slotRows(store.summaries());
  app.sel = index;
  const row = rows[index];
  if (!row) return;

  if (row.kind === 'import') {
    pickSaveFile().then(text => {
      if (text === null) return;
      const result = store.fromJsonText(text);
      if (!result.ok) { app.message = result.error; return; }
      // Imported saves land in the first empty slot, or slot 1 if all are full.
      const empty = store.summaries().find(sm => sm.empty);
      const slot = empty ? empty.slot : 0;
      store.write(slot, result.save);
      startCareer(slot, store.read(slot));
    });
    return;
  }

  startCareer(row.slot, row.summary.empty ? null : store.read(row.slot));
}

function shopKey(code) {
  const rows = shopRows(app.career);
  if (code === 'ArrowUp') app.sel = (app.sel - 1 + rows.length) % rows.length;
  if (code === 'ArrowDown') app.sel = (app.sel + 1) % rows.length;
  if (code === 'KeyS') { app.screen = SCREEN.STANDINGS; return; }
  if (code === 'KeyR') { app.screen = SCREEN.PRERACE; return; }
  if (code === 'Escape') { app.sel = app.slot ?? 0; app.screen = SCREEN.SLOTS; return; }
  if (code !== 'Enter' && code !== 'Space') return;
  activateShopRow(app.sel);
}

// One place where a shop row is acted on, so tapping a row and pressing Enter on
// it can never diverge.
function activateShopRow(index) {
  const rows = shopRows(app.career);
  app.sel = index;
  const row = rows[index];
  if (!row) return;
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
    case 'model': {
      const i = CARS.findIndex(c => c.id === g.model);
      g.model = CARS[(i + 1 + CARS.length) % CARS.length].id;
      break;
    }
    case 'paint': {
      // null is "stock paint", which is a real choice in the ported system.
      const hexes = [null, ...PAINT_OPTIONS.map(p2 => p2.hex)];
      const i = hexes.indexOf(g.paint);
      g.paint = hexes[(i + 1 + hexes.length) % hexes.length];
      break;
    }
    case 'number': {
      const nums = [null, ...NUMBER_OPTIONS];
      const i = nums.indexOf(g.number === null ? null : String(g.number));
      g.number = nums[(i + 1 + nums.length) % nums.length];
      break;
    }
    case 'difficulty': {
      const keys = Object.keys(DIFFICULTY);
      app.career.difficulty = keys[(keys.indexOf(app.career.difficulty) + 1) % keys.length];
      break;
    }
    case 'standings':
      app.screen = SCREEN.STANDINGS;
      break;
    case 'export':
      downloadSave(app.career.toSave(),
        `velocity3000-${app.career.driverName.toLowerCase()}-slot${app.slot + 1}.json`);
      break;
    case 'race':
      app.screen = SCREEN.PRERACE;
      break;
  }

  // Any purchase changes the career, so it gets written straight away.
  if (['upgrade', 'repair', 'nitro', 'compound', 'difficulty', 'model', 'paint', 'number']
    .includes(row.kind)) autosave();
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------

function update(dt) {
  if (app.screen !== SCREEN.RACE) {
    input.sample(dt);   // keep edge detection honest across screens
    audio.idle();
    return;
  }

  const car = app.race.player;
  prev.trackPos = car.trackPos;
  prev.x = car.x;

  const wasCrashed = car.crashed;
  app.race.update(dt, input.sample(dt));
  effects.update(dt, car, canvas);
  audio.update(car, { racing: app.race.phase === PHASE.RACING });
  if (car.crashed && !wasCrashed) audio.crash();

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
    case SCREEN.SLOTS:
      drawSlots(ctx, canvas, store.summaries(), app.sel,
        { message: app.message, persistent: store.persistent });
      break;
    case SCREEN.SHOP: drawShop(ctx, canvas, app.career, app.sel); break;
    case SCREEN.STANDINGS: drawStandings(ctx, canvas, app.career); break;
    case SCREEN.PRERACE: drawPreRace(ctx, canvas, app.career); break;
    case SCREEN.RESULTS: drawResults(ctx, canvas, app.race.results(), {
      title: 'RACE RESULT',
      footer: 'tap to collect your winnings',
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
  renderer.time = performance.now();
  renderer.render(track, pos, x);

  // Scenery first, then cars: both run far to near, and a car alongside a palm
  // should be in front of it.
  drawScenery(ctx, canvas, renderer, track);

  drawCars(ctx, canvas, renderer, track, race.entries
    .filter(e => !e.isPlayer)
    .map(e => ({ trackPos: e.car.trackPos, x: e.car.x, paint: e.identity.paint })), pos);
  drawPlayer(ctx, canvas, car, input.state, app.career.garage);
  effects.draw(ctx);
  effects.endShake(ctx, shaken);

  drawMinimap(ctx, canvas, track, race.entries.map(e => ({
    trackPos: e.car.trackPos,
    isPlayer: e.isPlayer,
    paint: e.identity.paint,
  })));

  drawHud(ctx, canvas, car, race.hudState());
  if (race.phase === PHASE.COUNTDOWN) drawCountdown(ctx, canvas, race.countdown);
}

function wrap(z, L) { return ((z % L) + L) % L; }

// Resume the slot that was last played, so returning to the tab lands you where
// you left off instead of on a menu.
{
  const last = store.lastSlot();
  const summaries = store.summaries();
  app.sel = last !== null ? last : 0;
  if (last !== null && !summaries[last].empty) app.sel = last;
}

// Dev hook. Lets a browser session (or an automated check) inspect and poke game
// state without a debugger — e.g. put the car in the pit lane, or drain the tank,
// to look at a situation that would otherwise take a lap and a half to reach.
// Read-only as far as the game is concerned: nothing here is called by the loop.
window.velocity3000 = app;
window.velocity3000.hitRegions = debugHitRegions;

startLoop(update, render);
