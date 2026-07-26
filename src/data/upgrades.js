// Upgrade tree and cost curve. Section 5.3.
//
// Every upgrade must visibly change physics — `stat` names the multiplier it
// feeds in game/garage.js, which is the only path from money to lap time. If an
// upgrade doesn't appear here with a stat, it doesn't exist.
//
// Costs are the spec's L1->L5 endpoints with a curve between them. They are
// explicitly an educated starting point, not verified balance.

export const UPGRADES = {
  engine: {
    name: 'Engine',
    effect: 'Top speed +6% per level',
    stat: 'topSpeedMul',
    per: 0.06,
    costs: [3000, 6500, 11000, 17000, 24000],
  },
  gearbox: {
    name: 'Gearbox',
    effect: 'Acceleration +8% per level',
    stat: 'accelMul',
    per: 0.08,
    costs: [2500, 5500, 9500, 14500, 20000],
  },
  tyres: {
    name: 'Tyres',
    effect: 'Grip +7% per level',
    stat: 'gripMul',
    per: 0.07,
    costs: [2000, 4500, 7500, 11500, 16000],
  },
  brakes: {
    name: 'Brakes',
    effect: 'Braking +10% per level',
    stat: 'brakingMul',
    per: 0.10,
    costs: [1500, 3200, 5500, 8500, 12000],
  },
  armor: {
    name: 'Armor',
    effect: 'Damage taken -15% per level',
    stat: 'damageTakenMul',
    per: -0.15,
    costs: [2000, 4500, 7500, 11500, 16000],
  },
  fuel: {
    name: 'Fuel tank',
    effect: 'Capacity +12% per level',
    stat: 'fuelCapacityMul',
    per: 0.12,
    costs: [1500, 3200, 5500, 8500, 12000],
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);
export const MAX_LEVEL = 5;

// Consumables, bought between races (section 5.3).
export const CONSUMABLES = {
  nitro: { name: 'Nitro charge', cost: 800, max: 6 },
  // Calibrated against the section 5.2 tension: a fully wrecked car must cost
  // more than a 4th-place cheque ($4,000), so this cannot drop below ~40. At 50,
  // a typical scrappy midfield race (~25% damage) bills $1,250 and still leaves
  // something to upgrade with.
  repair: { name: 'Full repair', costPerPercent: 50 },
};
