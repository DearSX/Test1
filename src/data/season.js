// Season shape: divisions, points, prize money. Section 5.1 and 5.2.

export const DIVISIONS = [
  { id: 'rookie', name: 'Rookie', paceScale: 1.00, laps: 3, maxUpgradeLevel: 2 },
  { id: 'pro', name: 'Pro', paceScale: 1.06, laps: 4, maxUpgradeLevel: 3 },
  { id: 'elite', name: 'Elite', paceScale: 1.12, laps: 4, maxUpgradeLevel: 4 },
  { id: 'galactic', name: 'Galactic', paceScale: 1.18, laps: 5, maxUpgradeLevel: 5 },
];

// Championship points for the top 8.
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

// Prize money by finishing position. 1st-3rd from the spec table; 4th-8th walks
// 4,000 down to 1,500; everyone else takes the consolation.
const PRIZES = [12000, 8000, 6000, 4000, 3400, 2800, 2200, 1500];
const CONSOLATION = 500;

export function prizeFor(position) {
  return PRIZES[position - 1] ?? CONSOLATION;
}
