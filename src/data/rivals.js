// The named roster. Section 4: 6-8 recurring rivals with names, colours and
// personalities. These are the ones you learn to hate.
//
// personality drives behaviour, not just flavour text:
//   aggressive — blocks, holds the inside line, leans on you in traffic
//   clean      — gives room, yields the line rather than trade paint
//   erratic    — quick but makes more mistakes
//   steady     — slower peak pace, almost never wrong

export const NAMED_RIVALS = [
  { id: 'vasquez',  name: 'R. Vásquez',  paint: '#2f6fd0', number: 7,  pace: 1.02, consistency: 0.94, personality: 'aggressive',
    blurb: 'Leads from the front and closes the door.' },
  { id: 'okonkwo',  name: 'A. Okonkwo',  paint: '#e0a51f', number: 21, pace: 1.00, consistency: 0.97, personality: 'clean',
    blurb: 'Fast and fair. Will leave you a car width.' },
  { id: 'lindqvist',name: 'M. Lindqvist',paint: '#37a05a', number: 3,  pace: 0.99, consistency: 0.90, personality: 'erratic',
    blurb: 'Brilliant on a good day. Not every day is good.' },
  { id: 'takahashi',name: 'K. Takahashi',paint: '#d9d9de', number: 44, pace: 0.98, consistency: 0.99, personality: 'steady',
    blurb: 'Never makes a mistake. Never lets you past either.' },
  { id: 'duarte',   name: 'L. Duarte',   paint: '#8d43c4', number: 11, pace: 0.97, consistency: 0.93, personality: 'aggressive',
    blurb: 'Treats the rumble strips as part of the road.' },
  { id: 'baptiste', name: 'J. Baptiste', paint: '#e2653b', number: 18, pace: 0.95, consistency: 0.95, personality: 'clean',
    blurb: 'Quietly quick. Turns up in the top five from nowhere.' },
  { id: 'moreau',   name: 'C. Moreau',   paint: '#1fb5c4', number: 9,  pace: 0.94, consistency: 0.91, personality: 'erratic',
    blurb: 'Late on the brakes, often too late.' },
  { id: 'sorenson', name: 'E. Sorenson', paint: '#c4416a', number: 27, pace: 0.92, consistency: 0.96, personality: 'steady',
    blurb: 'Backmarker with ambitions and a long memory.' },
];

// The rest of the 20-car field. Filler, but named filler — a position you gained
// should have a name attached to it.
const FILLER_NAMES = [
  'D. Rojas', 'T. Abara', 'S. Petrov', 'N. Halvorsen', 'V. Castillo',
  'P. Mwangi', 'H. Dubois', 'I. Karlsen', 'F. Almeida', 'G. Novak',
  'B. Ferreira', 'O. Lindgren',
];

const FILLER_PAINTS = [
  '#6b7280', '#9a5b2f', '#4a7c59', '#7a5ea8', '#b8863b',
  '#3f5f8a', '#8a3f4f', '#5f8a3f', '#3f8a8a', '#8a6f3f',
  '#6f3f8a', '#8a8a3f',
];

// Builds the full field of rivals for a division. `paceScale` raises the whole
// grid as divisions progress (section 5.1: rival cars get faster).
export function buildRoster(fieldSize, paceScale = 1, rng) {
  const roster = NAMED_RIVALS.map(r => ({ ...r, named: true }));

  for (let i = 0; roster.length < fieldSize - 1; i++) {
    roster.push({
      id: `filler${i}`,
      name: FILLER_NAMES[i % FILLER_NAMES.length],
      paint: FILLER_PAINTS[i % FILLER_PAINTS.length],
      number: 30 + i,
      pace: rng ? rng.range(0.85, 0.95) : 0.9,
      consistency: rng ? rng.range(0.88, 0.97) : 0.93,
      personality: rng ? rng.pick(['clean', 'steady', 'aggressive', 'erratic']) : 'steady',
      blurb: '',
      named: false,
    });
  }

  return roster.slice(0, fieldSize - 1).map(r => ({ ...r, pace: r.pace * paceScale }));
}
