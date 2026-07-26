# VELOCITY 3000

Browser pseudo-3D racer. Vanilla JS, ES modules, Canvas 2D. No framework, no bundler, no npm dependencies.

## Running it (read this first)

**ES modules do not work over `file://`.** Opening `index.html` directly will show a blank page with a CORS error in the console. Serve it:

```
npx serve
# or
python -m http.server
```

then open `http://localhost:3000` (serve) or `http://localhost:8000` (python).

## Status

- **M0 — Skeleton: DONE.** Fixed 60Hz timestep + accumulator, canvas + resize, one authored track ("Island Loop", 2,425 segments) rendering with curves and elevation at a constant cruise speed. Render interpolation is wired in (`render(alpha)`).
- **M1 — Physics: DONE.** Throttle, brake, six-speed box with tacho (auto or manual), continuous analog steering, centrifugal force, per-surface grip, off-road, crashes, nitro. Keyboard, touch and gamepad. `CENTRIFUGAL` tuned to **0.78**.
- **M2 — Racing: DONE.** 19 rivals running the same physics on the same track, swept collisions with no pass-through, slipstream, honest positions, 3-lap races with lap timing and a results screen.
- **M3 — Career: DONE.** 8-race seasons, championship points, prize money, 4 divisions with promotion, a 6-category upgrade shop wired into physics, standings, and 4 tracks. One tyre level is worth 0.85s a lap.
- **M4 — Strategy: DONE.** Fuel burned per distance (a tank does 2.5 of a 3-lap race), a working pit lane on the left of the start straight, tyre wear and compounds, repair bills, DNF on a dry tank, and a nemesis with a real pace boost.
- **M5 — Persistence: DONE.** Three save slots, autosave on every race finish / purchase / season transition, JSON export and import, schema `version` with a migration table, and graceful behaviour when storage is blocked or a slot is corrupt.
- **M6 — Content & polish: DONE.** The scenery, car sprites, paint + number-decal system and four theme palettes ported verbatim from `top-flush-3-10.html`; the night track (Providence Night, with ice); a minimap; engine/tyre/crash audio with mute; Arcade/Career/Simulation selectable.

### Controls

**Driving:** `↑` throttle · `↓` brake · `←` `→` steer · `Shift` nitro · `M` toggle manual gears (`Q`/`E` to shift) · `P` book repairs at your next pit stop · `K` mute.

**Pitting:** the pit lane is the left verge of the start/finish straight. When fuel is low the HUD warns you before the entry — steer left across the road edge, slow to the limit, and you'll be held for about 4 seconds while the car is refuelled and re-shod (longer if you booked repairs).
On a phone: drag the left half of the screen to steer, hold the lower right for throttle, below that for brake, upper right for nitro.

**Garage:** `↑` `↓` select · `Enter` buy · `S` standings · `R` go racing · `Esc` back to save slots.

**Save slots:** `↑` `↓` select · `Enter` load or start a career · `D` delete. The game autosaves after every race, every purchase and every season transition, and reopening the tab pre-selects the slot you were last playing. "Export save file" in the garage downloads the career as JSON; "Import save file" on the slot screen reads one back.

`window.velocity3000` exposes the live game state in the browser console — handy for looking at a situation without driving to it.

## Tuning

Every magic number is in `src/tune.js`. `M0_CRUISE_SPEED` controls the scroll speed for the M0 test; it goes away at M1.

`CENTRIFUGAL` is the one that matters. The rule it has to satisfy: **holding full throttle through the hardest corner puts you off the road every single time.** If throttle can be held everywhere, the game has no soul — retune before building anything else.

## Verifying a milestone

Each milestone has a headless check that runs the real game modules under Node against a recording canvas, so the "done when" test is repeatable instead of eyeballed:

```
node tools/verify-m0.mjs     # projection, track shape, fixed timestep
node tools/verify-m1.mjs     # physics, and both halves of the soul-dial rule
node tools/verify-m2.mjs     # rivals, swept collisions, honest positions
node tools/verify-m3.mjs     # upgrades measurably changing physics, season economy
node tools/verify-m4.mjs     # fuel range, pit stops, and losing a race to a bad pit call
node tools/verify-m5.mjs     # save schema, slots, corrupt input, and a mid-season reload
node tools/checklist.mjs     # the build plan's section 11 checklist
```

Exit code is non-zero if any check fails. `tools/harness.mjs` holds the fake canvas and the assertion helpers.

Two of these take arguments worth knowing about:

```
node tools/verify-m1.mjs --sweep   # scan CENTRIFUGAL for the window where both halves hold
node tools/verify-m2.mjs --race    # print a full race classification
node tools/verify-m3.mjs --season  # simulate an 8-race season round by round
node tools/verify-m4.mjs --strategy  # compare pit strategies in the same race
```

## Lateral position

Position across the road is a continuous `-1.0 … 1.0`, not a lane index. Nothing snaps. `|x| > 1.0` is off-road, `|x| > 1.6` is a crash into scenery. The centre paint in `render/road.js` is decoration — there are no lanes to be in.

## Save data

`localStorage`, three slots, schema `version: 1`. `src/core/storage.js` has a migration table that runs in order for any older save; when the schema changes, bump `SAVE_VERSION` and add a step rather than editing an existing one. A save from a newer version, or a corrupt slot, reads as empty rather than taking the game down.

## Structure

Per the build plan (`velocity-3000-build-plan.md`), milestones M0→M6. Files fill in at their milestone.

## Tracks

Five circuits: Island Loop, Providence Point, Dominican Ridge, Costa Rica Jungle and Providence Night. All five close in elevation, in curvature and on the minimap — see the note at the top of `src/render/minimap.js` for why a track's total curvature summing to one lap is necessary but not sufficient for a closed outline.

## Audio

Synthesised, no assets. Engine pitch tracks RPM, so an upshift is audible because the rev model resets rather than because a sound is triggered. `K` mutes. The `AudioContext` is only constructed inside `Audio.unlock()`, which is called from the first keydown/pointerdown/touchstart — nothing makes a noise before you touch it.

## The ported art

`src/render/themes/` holds the art from `top-flush-3-10.html`, copied across rather than reinterpreted (build plan non-negotiable #3: *"Scenery is ported, not rewritten... Do not restyle them."*).

| File | What's in it |
|---|---|
| `scenery.js` | `drawPalmTree`, `drawRoyalPalm`, `drawJungleTree`, `drawTriplex`, `drawBodega`, `drawColmado`, `drawSoda` — byte-identical, plus the building colour tables |
| `sprites.js` | `drawCelica`, `drawSoul`, `drawLucid`, the rival body, and the paint + number-decal system (`bodyPaint`, `hexShift`, `drawNumberRoundel`) — byte-identical |
| `backdrop.js` | `drawSky` and `makeSideObj` — byte-identical, including every `if(theme === N)` branch. This is where the four palettes live |
| `palette.js` | the road/grass/shoulder colours from `drawRoad`'s theme branches, value for value |
| `index.js` | the only new code: which palette a track uses, where its roadside objects stand, and drawing them against this engine's projection |

Each ported file has a marked `verbatim below this line` block. Everything inside it is the original's; everything outside is plumbing that replaces what used to be page globals (`ctx`, `dpr`, `carColor`, `carNumber`, `theme`, `mountains`, `skyline`, `bgStars`).

Two adaptations were needed and both are documented at the code:

- **Scenery scale.** The original sized objects at 0.85 of the road's on-screen half-width, but its player car was 0.55 of that half-width where this engine's is 0.33. Copying 0.85 across made palms tower over the car, so `TUNE.SCENERY_SIZE` is 0.51 — the value that preserves the original's scenery-to-car proportion, which is what the art was drawn against.
- **Night.** Nothing in the original was drawn at night, so Providence Night dims the ported daylight backdrop rather than inventing a palette for it.

Car, paint and race number are chosen in the garage and saved with the career.
