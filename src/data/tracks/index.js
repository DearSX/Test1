// The calendar. One track per theme; the night variant joins at M6.
//
// Tracks are built on demand and cached — a build walks 2,000+ segments and
// there's no reason to redo it every time the season rolls over.

import { buildIslandTrack } from './island.js';
import { buildProvidenceTrack } from './providence.js';
import { buildDominicanTrack } from './dominican.js';
import { buildCostaRicaTrack } from './costarica.js';

export const TRACKS = [
  { id: 'island', name: 'Island Loop', theme: 'island', build: buildIslandTrack,
    blurb: 'Downhill hairpin. Lift, or walk home.' },
  { id: 'providence', name: 'Providence Point', theme: 'providence', build: buildProvidenceTrack,
    blurb: 'Two long straights. Slipstream country.' },
  { id: 'dominican', name: 'Dominican Ridge', theme: 'dominican', build: buildDominicanTrack,
    blurb: 'Dirt at the top of the mountain.' },
  { id: 'costarica', name: 'Costa Rica Jungle', theme: 'costarica', build: buildCostaRicaTrack,
    blurb: 'Wet, tight, unforgiving. Learn it.' },
];

const cache = new Map();

export function getTrack(id) {
  if (!cache.has(id)) {
    const def = TRACKS.find(t => t.id === id);
    if (!def) throw new Error(`unknown track: ${id}`);
    cache.set(id, def.build());
  }
  return cache.get(id);
}

export function trackDef(id) {
  return TRACKS.find(t => t.id === id);
}
