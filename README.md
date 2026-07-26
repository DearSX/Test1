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
- M2 — Racing: next. 19 rivals on the same track model, swept collisions, positions, laps.

### Controls

`↑` throttle · `↓` brake · `←` `→` steer · `Shift` nitro · `M` toggle manual gears (`Q`/`E` to shift) · `R` restart.
On a phone: drag the left half of the screen to steer, hold the lower right for throttle, below that for brake, upper right for nitro.

## Tuning

Every magic number is in `src/tune.js`. `M0_CRUISE_SPEED` controls the scroll speed for the M0 test; it goes away at M1.

`CENTRIFUGAL` is the one that matters. The rule it has to satisfy: **holding full throttle through the hardest corner puts you off the road every single time.** If throttle can be held everywhere, the game has no soul — retune before building anything else.

## Verifying a milestone

Each milestone has a headless check that runs the real game modules under Node against a recording canvas, so the "done when" test is repeatable instead of eyeballed:

```
node tools/verify-m0.mjs
```

Exit code is non-zero if any check fails. `tools/harness.mjs` holds the fake canvas and the assertion helpers.

## Lateral position

Position across the road is a continuous `-1.0 … 1.0`, not a lane index. Nothing snaps. `|x| > 1.0` is off-road, `|x| > 1.6` is a crash into scenery. The centre paint in `render/road.js` is decoration — there are no lanes to be in.

## Structure

Per the build plan (`velocity-3000-build-plan.md`), milestones M0→M6. Files fill in at their milestone. Theme scenery ports **verbatim** from `top-flush-3-10.html` at M6 — keep that file available; it is not in the repo yet.
