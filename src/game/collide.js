// Swept collision in (trackPos, x) space. Section 4: "test the segment the car
// moved *through*, not the point it landed on. No pass-through, ever."
//
// Why sweeping is not optional: at 300 km/h a car covers ~183 world units in one
// 60Hz step while a car is only ~260 units long. Two cars closing head-to-tail
// can swap places inside a single step, and a test on landing positions alone
// would see nothing at all.
//
// Both cars move linearly across the step, so the exact overlap window is
// solvable rather than sampled. Everything here is pure — no game state — which
// is what makes it directly testable.

// Interval of t in [0,1] where |c0 + (c1-c0)·t| <= r. Returns null if never.
function overlapWindow(c0, c1, r) {
  const d = c1 - c0;
  if (Math.abs(d) < 1e-9) return Math.abs(c0) <= r ? [0, 1] : null;
  let t0 = (-r - c0) / d;
  let t1 = (r - c0) / d;
  if (t0 > t1) [t0, t1] = [t1, t0];
  const lo = Math.max(0, t0), hi = Math.min(1, t1);
  return lo <= hi ? [lo, hi] : null;
}

// Shortest signed distance from b to a on a looping track.
export function wrapDelta(dz, trackLength) {
  let d = dz % trackLength;
  if (d > trackLength / 2) d -= trackLength;
  if (d < -trackLength / 2) d += trackLength;
  return d;
}

// a, b: { z0, z1, x0, x1 } — position before and after the step.
// Returns { t, dz, dx } at first contact, or null.
export function sweptContact(a, b, { carLen, carWidth, trackLength }) {
  const dz0 = wrapDelta(a.z0 - b.z0, trackLength);
  const dz1 = wrapDelta(a.z1 - b.z1, trackLength);

  // A car that laps another must not register as a hit: if the gap is more than
  // half a lap the wrap has folded it, so treat the pair as far apart.
  if (Math.abs(dz0) > trackLength / 4 && Math.abs(dz1) > trackLength / 4) return null;

  const zWin = overlapWindow(dz0, dz1, carLen);
  if (!zWin) return null;

  const xWin = overlapWindow(a.x0 - b.x0, a.x1 - b.x1, carWidth);
  if (!xWin) return null;

  const t = Math.max(zWin[0], xWin[0]);
  if (t > Math.min(zWin[1], xWin[1])) return null;

  return {
    t,
    dz: dz0 + (dz1 - dz0) * t,
    dx: (a.x0 - b.x0) + ((a.x1 - b.x1) - (a.x0 - b.x0)) * t,
  };
}
