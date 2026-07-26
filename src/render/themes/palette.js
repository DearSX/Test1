// Road-surface colours per theme — the values PORTED VERBATIM from
// top-flush-3-10.html's drawRoad(). Build plan non-negotiable #3.
//
// The original picked these inline with `if(theme === N)` and a `band` flag that
// alternates every few metres of track. This engine draws whole segments rather
// than scanlines, so the same values are keyed by theme and by that alternating
// band. Every literal is the original's, comment and all.

export const ROAD_PALETTES = [
  // theme 0 — tropical island
  {
    id: 'island',
    grassLight: '#57c651', grassDark: '#49b544',   // tropical grass
    roadLight: '#8e979e', roadDark: '#838c93',     // sunlit asphalt
    shoulder: 'rgba(120,110,90,.5)',
    fleck: 'rgba(255,255,255,.05)',
    fleckSeed: 53,
    sky: '#8fdcff',
  },
  // theme 1 — Providence, RI
  {
    id: 'providence',
    grassLight: '#abafb2', grassDark: '#9da1a4',   // city sidewalk concrete
    roadLight: '#6f767c', roadDark: '#666d73',     // urban asphalt
    shoulder: 'rgba(70,72,76,.6)',
    fleck: null,
    fleckSeed: 0,
    sky: '#8fdcff',
  },
  // theme 2 — Dominican Republic
  {
    id: 'dominican',
    grassLight: '#cf9a55', grassDark: '#c28e4b',   // sun-baked red-clay roadside
    roadLight: '#7c8388', roadDark: '#71777c',     // warm island asphalt
    shoulder: 'rgba(150,110,70,.55)',
    fleck: null,
    fleckSeed: 0,
    sky: '#8fdcff',
  },
  // theme 3 — Costa Rica
  {
    id: 'costarica',
    grassLight: '#2f9f57', grassDark: '#23873f',   // deep rainforest green
    roadLight: '#8a8f88', roadDark: '#7f857d',     // damp jungle asphalt
    shoulder: 'rgba(90,110,80,.5)',
    fleck: 'rgba(255,255,255,.06)',
    fleckSeed: 71,
    sky: '#8fdcff',
  },
];

// The road markings the original drew the same way on every theme.
export const MARKINGS = {
  curbLight: '#ffffff',
  curbDark: '#ff5050',
  lane: 'rgba(255,255,255,.8)',
  centreLine: 'rgba(255,210,61,.9)',
  reflectorPost: '#e8e8e8',
  reflectorLeft: '#ff4040',
  reflectorRight: '#ffd23d',
};

export function roadPalette(index) {
  return ROAD_PALETTES[index] ?? ROAD_PALETTES[0];
}

// The night variant reuses Providence's geography. Nothing in the original was
// drawn at night, so rather than invent a palette (which would be restyling),
// this dims the ported one and leaves every hue where it was.
export function nightVariant(palette) {
  const dim = (c, f) => {
    const m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) {
      const n = parseInt(m[1], 16);
      const s = v => Math.max(0, Math.min(255, Math.round(v * f)));
      return `rgb(${s((n >> 16) & 255)},${s((n >> 8) & 255)},${s(n & 255)})`;
    }
    return c;
  };
  return {
    ...palette,
    id: palette.id + '-night',
    night: true,
    grassLight: dim(palette.grassLight, 0.34),
    grassDark: dim(palette.grassDark, 0.30),
    roadLight: dim(palette.roadLight, 0.42),
    roadDark: dim(palette.roadDark, 0.38),
  };
}
