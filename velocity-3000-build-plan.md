# VELOCITY 3000 — Build Plan

**Hand-off spec for Claude Code.** A browser-based racer with the actual soul of Top Gear 3000: analog cornering that punishes you, a car you build up over a season, fuel strategy, and a championship you can lose.

This is a rebuild, not a patch. The existing `top-flush-3-10.html` is a lane-dodger with racing paint on it. Three of its assumptions have to go. Everything else — the scenery art especially — gets ported over and kept.

---

## 0. What we are deliberately changing

| Old (Top Flush) | New (Velocity 3000) | Why |
|---|---|---|
| 3 discrete lanes, instant snap | Continuous lateral position `-1.0 … 1.0` | Cornering can't matter if you can't hold a line. This is the single biggest change. |
| Random track segments generated ahead of you | Authored track data, fixed length, repeatable | You can't learn a corner that didn't exist last lap. Learning the track *is* the game. |
| Variable `dt` capped at 50ms | Fixed 60Hz timestep + accumulator | Permanently kills the collision tunneling bug. |
| Rivals are sprites moving relative to you | Rivals simulate on the same track model | Real positions, real overtakes, real lost places when you crash. |
| No persistence | localStorage save slots + JSON export | The career loop is meaningless without it. |

Ported unchanged from the old file: every scenery draw function (`drawTriplex`, `drawBodega`, `drawColmado`, `drawRoyalPalm`, `drawJungleTree`, `drawSoda`, `drawPalmTree`), the Celica/Soul/Lucid car sprites, the paint + number-decal system, and the four theme palettes. That art is the best thing in the project.

---

## 1. Stack & project shape

Vanilla JavaScript, ES modules, Canvas 2D. No framework, no bundler, no npm dependencies.

**Important:** ES modules do not work over `file://`. Run it with `npx serve` (or `python -m http.server`) and open `localhost`. Put this in the README so it isn't rediscovered painfully later.

```
/index.html
/src
  main.js                 # bootstrap, canvas, resize, fixed-timestep loop
  /core
    loop.js               # accumulator, render interpolation
    input.js              # keyboard, touch, gamepad — normalized to {steer,-1..1 throttle,brake,nitro,shift}
    audio.js              # WebAudio: engine pitch by RPM, tyre scrub, music
    storage.js            # save slots, JSON export/import, schema versioning
  /game
    physics.js            # player car: speed, gears, steering, centrifugal, grip, off-road
    track.js              # segment model, projection, lookup by trackPos
    rivals.js             # AI cars: racing line, pace, slipstream, collisions
    race.js               # race state machine: grid, laps, positions, fuel, pits, finish
    career.js             # season, standings, prize money, division progression
    garage.js             # car stats, upgrade levels, cost curves, stats→physics mapping
  /render
    road.js               # segment projection + road surface, rumble, lane paint
    cars.js               # player + rival sprites (ported)
    hud.js                # speedo, tacho, gear, position, lap, fuel, damage, minimap
    /themes
      island.js  providence.js  dominican.js  costarica.js   # ported scenery
  /data
    tracks/*.js           # authored track definitions
    upgrades.js           # upgrade tree + costs
    rivals.js             # named rival roster with personalities
/assets                   # (optional — art is code-drawn today)
```

---

## 2. Core engine

### 2.1 Fixed timestep

```js
const STEP = 1000/60;
let acc = 0, prev = performance.now();
function frame(now){
  acc += Math.min(now - prev, 250); prev = now;
  while(acc >= STEP){ update(STEP/1000); acc -= STEP; }
  render(acc / STEP);            // alpha for interpolation
  requestAnimationFrame(frame);
}
```

All physics runs in seconds, not milliseconds. Never read `dt` from the render call.

### 2.2 Track model

A track is an array of **segments**, each ~200 world units long:

```js
{ index, curve, y, surface, sprites:[], hazards:[] }
```

- `curve` — negative left, positive right. Typical range −6 … +6. A hairpin is 6+.
- `y` — elevation at the segment start. Hills come from real elevation, not `Math.sin(trackDist)`.
- `surface` — `'asphalt' | 'dirt' | 'ice' | 'wet'`. Drives the grip coefficient (see 3.3).
- Track length: 1500–2500 segments per lap. Laps: 3.

Build tracks from a **piece list** so they're authorable and readable:

```js
addStraight(LEN.LONG);
addCurve(LEN.MEDIUM, CURVE.HARD_RIGHT, HILL.UP);
addHairpin(CURVE.LEFT);
addSCurve(LEN.SHORT);
```

Ship 5 tracks at minimum, one per theme plus a night variant. Each should have at least one corner that is genuinely hard and one place where a brave overtake is possible.

### 2.3 Projection

Standard pseudo-3D camera. `project(segment, cameraX, cameraY, cameraZ)` → screen `x, y, w`. Render back-to-front from the furthest visible segment; accumulate `x` and `dx` per segment to bend the road. Cull anything behind the camera or above the horizon.

Draw order per segment, far to near: road surface → rumble strips → lane paint → roadside sprites → cars sorted by `z`.

---

## 3. Player physics — the heart of it

This section is what makes it Top Gear and not a dodger. Get it right before anything else.

### 3.1 Longitudinal

```
maxSpeed   = f(engineLevel, gearboxLevel)
accel      = f(engineLevel) × gearMultiplier[currentGear]
braking    = f(brakeLevel)
drag       = speed² × DRAG_K
offRoadDrag= applies below maxSpeed×0.4 when |x| > 1.0
```

**Gears.** Six-speed with a tachometer. Auto by default; manual toggle in options gives ~4% more top speed for correct shifts (rewards skill without gating the kid out). Engine audio pitch = RPM, and RPM resets on upshift — that sound is 60% of the feel.

### 3.2 Steering + centrifugal (the critical formula)

```js
const speedPct = speed / maxSpeed;
playerX += steerInput * STEER_RATE * dt * (1 - speedPct*0.35);   // slower steering at speed
playerX -= dx * speedPct * CENTRIFUGAL * segment.curve * grip;   // corner pushes you out
```

`CENTRIFUGAL` is the single most important constant in the game. Tune it so that **taking a hard corner flat out sends you off the road every time.** If the player can hold throttle through every corner, the game has no soul. Start at `0.35` and tune up.

### 3.3 Grip

```
grip = SURFACE_GRIP[surface] × tyreCompoundMultiplier × (1 - damage×0.3)
```

| Surface | Grip |
|---|---|
| asphalt | 1.00 |
| wet | 0.80 |
| dirt | 0.65 |
| ice | 0.40 |

Low grip = more centrifugal push and slower steering response. Ice sections should be terrifying. Tyre upgrades are the counter.

### 3.4 Off-road

Beyond `|playerX| > 1.0`: hard speed decay toward `maxSpeed × 0.4`, screen shake, dust/gravel particles, tyre-scrub audio. Hitting scenery (`|playerX| > 1.6`) is a **crash** — big speed loss, damage, ~1.5s recovery. No instant death.

### 3.5 Nitro

Limited charges, refilled by pickups and purchasable. `+35%` top speed for 2.5s, burns fuel at 3×, and **reduces effective grip by 15%** while active. Nitro into a corner should be a decision, not free speed.

---

## 4. Rivals

19 rivals for a 20-car field. Each simulates on the same track model with its own `trackPos`, `speed`, `x`.

**AI per rival:**
- `pace` (0.85–1.02 of player's maxSpeed) and `consistency` (how much pace wobbles lap to lap)
- Targets a racing line: `targetX = clamp(-curve × 0.35, -0.9, 0.9)` — they apex properly
- Lifts for corners based on a lookahead of ~30 segments
- Avoidance: steers around cars within 40 segments ahead in a similar `x`
- **Slipstream:** within 25 segments behind another car → `+8%` speed. Applies to the player too. This is what makes straights tactical.
- Occasional mistakes: a rival off the racing line on a hard corner, ~2% chance per corner per rival

**Named roster.** 6–8 recurring rivals with names, car colors, and personalities (`aggressive` blocks; `clean` gives room). Track a season-long **nemesis** — the rival closest to you in points gets a small pace boost and shows up in the pre-race screen. That rivalry is a big part of what people remember about the original.

**Collisions.** Swept AABB in `(trackPos, x)` space — test the segment the car moved *through*, not the point it landed on. Contact = mutual speed loss + damage + a lateral shove. No pass-through, ever.

---

## 5. Career mode — the actual progression

### 5.1 Structure

```
Season → 8 races → championship points (10/8/6/5/4/3/2/1 for top 8)
Finish top 3 in the championship → promoted to next Division
4 Divisions: Rookie → Pro → Elite → Galactic
```

Each division raises rival pace, lengthens races (3 → 5 laps), and unlocks higher-tier upgrades. Rival cars get faster faster than your money grows — that's the pressure.

### 5.2 Money

| Finish | Prize |
|---|---|
| 1st | $12,000 |
| 2nd | $8,000 |
| 3rd | $6,000 |
| 4th–8th | $4,000 → $1,500 |
| 9th+ | $500 |

Repair costs come out of winnings. Finishing 4th with a wrecked car should sometimes leave you *poorer*. That tension is the point.

### 5.3 Upgrade shop

Six categories, five levels each, escalating cost:

| Upgrade | Effect | L1 → L5 cost |
|---|---|---|
| Engine | top speed +6% per level | 3k → 24k |
| Gearbox | acceleration +8% per level | 2.5k → 20k |
| Tyres | grip +7% per level | 2k → 16k |
| Brakes | braking +10% per level | 1.5k → 12k |
| Armor | damage taken −15% per level | 2k → 16k |
| Fuel tank | capacity +12% per level | 1.5k → 12k |

Plus consumables: nitro charges, repair, tyre compound choice per race (soft = more grip, wears faster).

**Every upgrade must visibly change physics.** Buying tyres should be felt in the first corner. If an upgrade is invisible, cut it.

### 5.4 Fuel & pit stops

Fuel burns per distance, scaled by throttle and nitro. A full tank covers ~2.5 laps at Rookie level — so a 3-lap race forces one pit or careful lifting. Pit lane on the left of the start/finish straight: enter, ~4s stationary, refuel + optional repair, exit. Pitting costs positions. Choosing *when* is real strategy.

Show fuel as a bar that turns amber then red. Running dry = coasting to a stop and a race-ending DNF.

---

## 6. Persistence

`localStorage`, three save slots, plus JSON export/import to a file.

```js
{ version: 1, slot: 0, driverName, division, seasonRace,
  money, championshipPoints, standings:[...],
  car: { model, paint, number, upgrades:{engine:3, tyres:2, ...}, damage },
  records: { bestLap: {trackId: ms}, racesWon, seasonsWon },
  settings: { manualGears, difficulty, muted } }
```

Write on every race finish, shop purchase, and season transition. Include `version` from day one and a migration stub — you will change the schema.

---

## 7. Difficulty modes

The kid still has to be able to play this. One setting, three values:

- **Arcade** — no fuel, no damage, rival pace ×0.85, 5 hearts equivalent (crashes cost time only), forgiving centrifugal (×0.7)
- **Career** — the spec as written
- **Simulation** — rival pace ×1.05, damage carries between races, no mid-race restarts

Arcade mode is not a lesser game; it's the same track and physics with the punishment dialed back.

---

## 8. HUD

Speedometer (analog needle), tachometer with gear indicator, position `n/20`, lap `n/3`, current lap time + best lap with delta, fuel bar, damage bar, nitro charges, and a **minimap** showing the track outline with your dot and nearby rivals. The minimap is what turns "I'm 8th" into "I'm 8th and 7th is right there."

---

## 9. Build milestones

Do these in order. Each one ends playable.

**M0 — Skeleton.** Project structure, fixed-timestep loop, canvas + resize, one authored track rendering as a static road you can scroll along. *Done when:* the road bends and hills correctly at a constant speed.

**M1 — Physics.** Throttle, brake, gears, steering, centrifugal, off-road, surfaces. No rivals. *Done when:* you can lap the track, and flooring a hairpin reliably puts you in the grass.

**M2 — Racing.** 19 rivals, swept collisions, positions, laps, lap timing, finish. *Done when:* you can finish a 3-lap race from 20th to somewhere believable and the positions are honest.

**M3 — Career.** Season structure, prize money, upgrade shop, stats wired into physics, standings screen. *Done when:* buying tyres measurably changes your lap time.

**M4 — Strategy.** Fuel, pit stops, damage, repair costs, tyre compounds, nemesis rival. *Done when:* you lose a race you were winning because you mistimed a pit stop.

**M5 — Persistence.** Save slots, autosave, JSON export/import, records. *Done when:* you can close the tab mid-season and come back.

**M6 — Content & polish.** Port the four theme renderers + car sprites from the old file, add the night track, engine/tyre/crash audio, menus, minimap, Arcade mode. *Done when:* you'd show it to someone.

---

## 10. Tuning constants (put these in one file)

```js
export const TUNE = {
  STEP: 1/60,
  SEGMENT_LEN: 200,
  DRAW_DISTANCE: 300,        // segments
  FOV: 100,
  CAMERA_HEIGHT: 1000,
  CENTRIFUGAL: 0.35,         // ← the soul dial. Tune this first, tune it most.
  STEER_RATE: 2.2,
  OFFROAD_DECEL: 0.99,
  OFFROAD_MAX: 0.4,          // × maxSpeed
  DRAG_K: 0.0009,
  SLIPSTREAM: 1.08,
  SLIPSTREAM_RANGE: 25,      // segments
  NITRO_BOOST: 1.35,
  NITRO_GRIP_PENALTY: 0.85,
  NITRO_DURATION: 2.5,       // seconds
  CRASH_RECOVERY: 1.5,       // seconds
};
```

Keep every magic number here. You will be re-tuning `CENTRIFUGAL` for an hour and you don't want to hunt for it.

---

## 11. Test checklist before calling any milestone done

- [ ] Sit on a 250ms frame stall (throttle DevTools CPU) — no car passes through another car
- [ ] Hold throttle through the hardest corner — you go off, every time
- [ ] Refresh mid-season — everything is where you left it
- [ ] Buy one upgrade level — lap time changes measurably
- [ ] Finish a race in 20th — you still earn something and the game doesn't feel punitive
- [ ] Play on a phone in portrait — HUD readable, touch steering usable
- [ ] Mute button works and audio doesn't start before a user gesture

---

## 12. Explicit non-goals for v1

Split-screen two-player, online leaderboards, car models beyond the three existing sprites, weather transitions mid-race, and a track editor. All are good ideas. All will eat the season loop before it exists. Ship the career first.
