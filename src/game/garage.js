// The car you own: upgrade levels, and the mapping from those levels into the
// physics stats PlayerCar reads. Section 5.3.
//
// This module is the only bridge between money and lap time. Buying a level here
// must show up in physics.js, or the upgrade is decoration.

import { UPGRADES, UPGRADE_KEYS, MAX_LEVEL, CONSUMABLES } from '../data/upgrades.js';
import { TUNE } from '../tune.js';

export const TYRE_COMPOUNDS = {
  soft: { name: 'Soft', gripMul: 1.08, wearRate: 1.9 },
  medium: { name: 'Medium', gripMul: 1.0, wearRate: 1.0 },
  hard: { name: 'Hard', gripMul: 0.94, wearRate: 0.6 },
};

export class Garage {
  constructor(init = {}) {
    // Feeds the ported paint + number-decal system in render/themes/sprites.js.
    // paint === null means the car's stock paint, exactly as the original meant it.
    this.model = init.model ?? 'celica';
    this.paint = init.paint ?? null;
    this.number = init.number ?? null;
    this.damage = init.damage ?? 0;
    this.nitroCharges = init.nitroCharges ?? TUNE.NITRO_CHARGES_START;
    this.tyreCompound = init.tyreCompound ?? 'medium';
    this.tyreWear = init.tyreWear ?? 0;

    this.upgrades = {};
    for (const key of UPGRADE_KEYS) this.upgrades[key] = init.upgrades?.[key] ?? 0;
  }

  level(key) { return this.upgrades[key] ?? 0; }

  // Cost of the NEXT level, or null if maxed / above the division's cap.
  costFor(key, maxAllowed = MAX_LEVEL) {
    const lvl = this.level(key);
    if (lvl >= MAX_LEVEL || lvl >= maxAllowed) return null;
    return UPGRADES[key].costs[lvl];
  }

  buy(key, money, maxAllowed = MAX_LEVEL) {
    const cost = this.costFor(key, maxAllowed);
    if (cost === null || cost > money) return { ok: false, spent: 0 };
    this.upgrades[key]++;
    return { ok: true, spent: cost };
  }

  repairCost() {
    return Math.round(this.damage * 100) * CONSUMABLES.repair.costPerPercent;
  }

  repair(money) {
    const cost = this.repairCost();
    if (cost > money) return { ok: false, spent: 0 };
    this.damage = 0;
    return { ok: true, spent: cost };
  }

  buyNitro(money) {
    if (this.nitroCharges >= CONSUMABLES.nitro.max) return { ok: false, spent: 0 };
    if (CONSUMABLES.nitro.cost > money) return { ok: false, spent: 0 };
    this.nitroCharges++;
    return { ok: true, spent: CONSUMABLES.nitro.cost };
  }

  // The stats object PlayerCar consumes. Every field here is read by physics.js.
  stats() {
    const s = {
      topSpeedMul: 1,
      accelMul: 1,
      brakingMul: 1,
      gripMul: 1,
      damageTakenMul: 1,
      fuelCapacityMul: 1,
    };
    for (const key of UPGRADE_KEYS) {
      const u = UPGRADES[key];
      s[u.stat] = 1 + u.per * this.level(key);
    }

    // Compound choice rides on top of the tyre upgrade. Wear itself is NOT
    // folded in here — it changes during a race, and PlayerCar owns it so the
    // grip you have in lap 4 differs from the grip you started with.
    const compound = TYRE_COMPOUNDS[this.tyreCompound] ?? TYRE_COMPOUNDS.medium;
    s.gripMul *= compound.gripMul;
    s.tyreWearRate = compound.wearRate;

    return s;
  }

  // A one-line summary for the shop screen.
  summary() {
    return UPGRADE_KEYS.map(key => ({
      key,
      name: UPGRADES[key].name,
      effect: UPGRADES[key].effect,
      level: this.level(key),
      cost: this.costFor(key),
    }));
  }

  toJSON() {
    return {
      model: this.model, paint: this.paint, number: this.number,
      damage: this.damage, nitroCharges: this.nitroCharges,
      tyreCompound: this.tyreCompound, tyreWear: this.tyreWear,
      upgrades: { ...this.upgrades },
    };
  }
}
