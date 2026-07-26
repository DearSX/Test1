// Seeded RNG. Races have to be reproducible: "the positions are honest" is only
// checkable if the same seed gives the same race, and the collision tests need
// to replay a scenario exactly.

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.pick = arr => arr[Math.floor(rng() * arr.length) % arr.length];
  rng.chance = p => rng() < p;
  return rng;
}
