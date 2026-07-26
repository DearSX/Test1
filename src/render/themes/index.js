// Ties the ported art to this engine: which palette a track uses, and where its
// roadside objects stand.
//
// Placement is done once per track+theme and cached onto the track. The objects
// themselves are the original's — makeSideObj() decides the mix per theme, and
// scenery.js draws them — so the roadside of an island lap is palms, Providence
// is triplexes and bodegas, Dominican is colmados and royal palms, Costa Rica is
// jungle trees and sodas, exactly as before.

import { TUNE } from '../../tune.js';
import { makeRng } from '../../core/rng.js';
import { themeIndexFor, makeSideObj, setBackdrop, drawSky, buildBackdrop } from './backdrop.js';
import { roadPalette, nightVariant, MARKINGS } from './palette.js';
import { setSceneryContext, drawSceneryObject } from './scenery.js';

export { setBackdrop, drawSky, buildBackdrop, MARKINGS };
export { setSpriteContext, CARS, PAINT_OPTIONS, NUMBER_OPTIONS, carById, drawRivalBody } from './sprites.js';

const placed = new WeakMap();

// The palette and theme index for a track definition from data/tracks/index.js.
export function themeFor(def) {
  const index = themeIndexFor(def.theme);
  const base = roadPalette(index);
  return {
    index,
    palette: def.night ? nightVariant(base) : base,
    night: !!def.night,
  };
}

// Populates track.segments[].sprites once, using the original's per-theme mix.
// Seeded, so a track's roadside is the same every time you race it — you are
// supposed to be able to learn a circuit.
export function placeScenery(track, def) {
  if (placed.has(track)) return placed.get(track);

  const themeIndex = themeIndexFor(def.theme);
  const rng = makeRng(hash(def.id));
  // makeSideObj reads Math.random directly (it is verbatim), so swap the global
  // for the seeded stream while placing, then put it back.
  const realRandom = Math.random;
  Math.random = rng;

  const objects = [];
  try {
    for (let i = 0; i < track.segments.length; i += TUNE.SCENERY_SPACING) {
      for (const side of [-1, 1]) {
        if (rng() > TUNE.SCENERY_DENSITY) continue;
        const seg = track.segments[i];
        const obj = makeSideObjFor(themeIndex, i, side);
        // Spread them along the segment so rows don't line up perfectly.
        obj.offset = rng();
        seg.sprites.push(obj);
        objects.push(obj);
      }
    }
  } finally {
    Math.random = realRandom;
  }

  placed.set(track, objects);
  return objects;
}

// makeSideObj branches on the module-scoped `theme` inside backdrop.js, so the
// theme has to be set before calling it.
function makeSideObjFor(themeIndex, z, side) {
  setBackdrop(null, { theme: themeIndex });
  return makeSideObj(z, side);
}

// Draws the scenery for the visible segments, far to near, against the
// projection road.js wrote. Mirrors the original's drawPalm(): the object stands
// just outside the road edge, and its size scales with the road's on-screen
// half-width.
export function drawScenery(ctx, canvas, renderer, track) {
  const base = renderer.baseIndex;
  if (base === undefined) return 0;
  const segs = track.segments;
  const N = segs.length;
  let drawn = 0;

  setSceneryContext(ctx);

  for (let n = TUNE.DRAW_DISTANCE - 1; n >= 1; n--) {
    const seg = segs[(base + n) % N];
    if (!seg.sprites.length) continue;
    const p = seg.p1.screen;
    if (!p.scale || p.scale <= 0 || !p.w) continue;

    for (const obj of seg.sprites) {
      // roadHalf*pr.s in the original is the road's on-screen half-width, which
      // is exactly screen.w here.
      const x = p.x + obj.side * (p.w + p.w * 0.28);
      const size = Math.min(p.w * TUNE.SCENERY_SIZE, canvas.height * TUNE.SCENERY_MAX_SCREEN_FRAC);
      if (size < 4) continue;              // the original's own cutoff
      if (p.y > seg.clip) continue;        // hidden behind a crest
      drawSceneryObject(obj, x, p.y, size);
      drawn++;
    }
  }
  return drawn;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
