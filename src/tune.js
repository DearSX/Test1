// Every magic number lives here. Section 10 of the build plan.
//
// Retuning must never mean hunting through source files. If you find yourself
// wanting a literal in physics.js or rivals.js, put it here instead.
export const TUNE = {
  // --- world / camera ---
  STEP: 1 / 60,
  SEGMENT_LEN: 200,
  DRAW_DISTANCE: 300,        // segments
  FOV: 100,                  // degrees
  CAMERA_HEIGHT: 1000,
  ROAD_WIDTH: 2000,          // half-width in world units
  RUMBLE_LEN: 3,             // segments per rumble stripe
  FOG_DENSITY: 5,            // distance haze; also hides far segments popping over crests
  MINIMAP_CURVE_SCALE: 0.0055,  // radians per curve-unit-per-segment on the minimap
  SCENERY_SPACING: 6,        // segments between candidate roadside slots
  SCENERY_DENSITY: 0.55,     // chance a slot is filled
  // The original sized scenery at 0.85 of the road's on-screen half-width, but
  // its player car was 0.55 of that half-width where ours is 0.33 — so copying
  // 0.85 across made palms tower over the car. 0.51 preserves the original's
  // scenery-to-car proportion, which is what the art was drawn against.
  SCENERY_SIZE: 0.51,
  SCENERY_MAX_SCREEN_FRAC: 1.6,  // cap on the nearest objects, in canvas heights

  // ===========================================================================
  // THE SOUL DIAL
  //
  // Rule it has to satisfy: holding full throttle through the hardest corner
  // puts you off the road EVERY TIME — even with perfect opposite lock — while
  // a driver who lifts and brakes can still get through cleanly.
  //
  // Both halves are asserted by tools/verify-m1.mjs. Change this number and run
  // it; if the corner becomes impossible rather than merely hard, that's just as
  // wrong as it being holdable.
  // ===========================================================================
  // Tuned by sweep (node tools/verify-m1.mjs --sweep). The valid window on the
  // Island Loop hairpin opens at 0.66 — below that, one entry line survives
  // full throttle. 0.78 sits inside it with margin: flat out reaches |x| 1.20
  // (well past the 1.0 edge) from every line, while a lifting driver gets
  // through at 54% of top speed.
  CENTRIFUGAL: 0.78,
  CENTRIFUGAL_ARCADE: 0.7,   // × CENTRIFUGAL in Arcade difficulty (section 7)

  // --- steering ---
  STEER_RATE: 2.2,           // full lock, lateral units per second at a standstill
  STEER_SPEED_FALLOFF: 0.35, // authority lost at max speed
  STEER_GRIP_FLOOR: 0.55,    // steering response left at zero grip
  STEER_RAMP: 4.0,           // keyboard: how fast a held key reaches full lock
  STEER_RETURN: 7.0,         // keyboard: how fast the wheel self-centres

  // --- longitudinal ---
  BASE_MAX_SPEED: 11000,     // world units/second at upgrade level 0
  BASE_ACCEL: 900,           // units/second², before gear multiplier
  BASE_BRAKING: 2600,        // units/second²
  ENGINE_BRAKE: 420,         // units/second² coasting
  DRAG_K: 1.0,               // drag at top speed == top-gear engine force
  SPEED_TO_KMH: 0.02727,     // 11000 units/s reads as 300 km/h

  // --- gearbox ---
  GEAR_TOP: [0.18, 0.34, 0.52, 0.70, 0.86, 1.0],   // top of each gear, × maxSpeed
  GEAR_ACCEL: [2.6, 1.9, 1.45, 1.15, 0.95, 0.8],   // accel multiplier per gear
  DOWNSHIFT_HYSTERESIS: 0.94,
  RPM_IDLE: 900,
  RPM_REDLINE: 8200,
  MANUAL_TOP_SPEED_BONUS: 1.04,   // ~4% for correct shifts, per section 3.1

  // --- surfaces (section 3.3) ---
  SURFACE_GRIP: { asphalt: 1.0, wet: 0.80, dirt: 0.65, ice: 0.40 },
  DAMAGE_GRIP_LOSS: 0.3,     // grip lost at 100% damage

  // --- off-road and crashing (section 3.4) ---
  OFFROAD_X: 1.0,            // |x| past this is grass
  // The spec's 0.99 was too weak to beat full throttle: the car settled at 58%
  // of max on the grass instead of the intended 40%. Stronger decay plus a
  // traction cut (grass doesn't put power down) makes OFFROAD_MAX actually mean
  // something.
  OFFROAD_DECEL: 0.97,       // per 60Hz step, toward OFFROAD_MAX
  OFFROAD_POWER: 0.3,        // × engine force while off-road
  OFFROAD_MAX: 0.4,          // × maxSpeed
  CRASH_X: 1.6,              // |x| past this hits scenery
  CRASH_SPEED_KEEP: 0.35,    // speed retained through a crash
  CRASH_DAMAGE: 0.12,
  CRASH_RECOVERY: 1.5,       // seconds

  // --- nitro (section 3.5) ---
  NITRO_BOOST: 1.35,
  NITRO_GRIP_PENALTY: 0.85,
  NITRO_DURATION: 2.5,       // seconds
  NITRO_CHARGES_START: 3,

  // --- racing (M2) ---
  FIELD_SIZE: 20,            // you + 19 rivals
  LAPS_DEFAULT: 3,
  COUNTDOWN: 3.2,            // seconds on the grid
  GRID_SPACING: 700,         // world units between grid slots (2.7 car lengths)
  GRID_STAGGER: 0.35,        // lateral offset, alternating left/right
  POST_FINISH_GRACE: 4,      // seconds of real sim after you finish, then extrapolate

  SLIPSTREAM: 1.08,
  SLIPSTREAM_RANGE: 25,      // segments
  SLIPSTREAM_WIDTH: 0.45,    // lateral offset within which the tow works

  // Collision box. CAR_LEN is world units along the track; CAR_WIDTH is in
  // lateral units, where 1.0 is half the road.
  CAR_LEN: 260,
  // Fraction of the road's on-screen HALF-width. Matches CAR_WIDTH (0.33 of the
  // half-road) so what you see is what the collision box uses.
  CAR_SCREEN_WIDTH: 0.33,
  CAR_MAX_SCREEN_FRAC: 0.75,  // cap, or a car one grid slot ahead fills the screen
  CAR_WIDTH: 0.33,
  COLLIDE_SPEED_LOSS: 0.82,  // × speed for both cars on contact
  COLLIDE_SHOVE: 0.28,       // lateral shove apart
  // A racy 3-lap stint from the back takes ~30 contacts. 0.04 wrecked the car
  // outright, 0.02 pinned it at 100%, and 0.012 still billed more than a
  // midfield prize every single race. At 0.006 a hard race runs ~20% damaged, so
  // a midfield finish roughly covers its own repair bill instead of going
  // backwards; getting properly wrecked takes crashes, at 0.12 each.
  COLLIDE_DAMAGE: 0.006,
  CONTACT_COOLDOWN: 0.6,     // seconds before the same pair can trade paint again
  SEPARATION_ITERATIONS: 6,  // relaxation passes to untangle a pile-up
  SEPARATION_MARGIN: 1.02,   // separate to slightly more than touching, not exactly

  // Rival AI
  // Rivals aim below the theoretical corner limit — an AI parked exactly on the
  // limit is faster than any human and makes the field unbeatable. At 0.94 a
  // competent driver finished 19th of 20; 0.88 puts them in the fight.
  RIVAL_CORNER_MARGIN: 0.88, // fraction of holdable corner speed they aim for
  RIVAL_MISTAKE_OVERSPEED: 1.18,
  RIVAL_MISTAKE_CHANCE: 0.02,  // per corner per rival (section 4)
  RIVAL_LOOKAHEAD: 30,       // segments
  RIVAL_AVOID_RANGE: 40,     // segments
  RIVAL_AVOID_WIDTH: 0.4,    // lateral gap counted as "in the way"
  LINE_PREFERENCE_WEIGHT: 0.35,  // how much the racing line is worth vs clear air
  RIVAL_STEER_GAIN: 2.4,

  // --- fuel and pit stops (M4, section 5.4) ---
  FUEL_CAPACITY: 100,          // display units; a full tank
  FUEL_RANGE_LAPS: 2.5,        // laps a stock tank covers AT RACE PACE
  // Burn scales with throttle, so "2.5 laps" has to be pinned to a realistic
  // average load. Calibrated at full throttle instead, a real racing lap (which
  // spends plenty of time off the throttle) stretched the tank to 3.4 laps and a
  // 3-lap race needed no stop at all — the whole strategy layer did nothing.
  FUEL_NOMINAL_LOAD: 0.75,     // average throttle load a racing lap actually uses
  FUEL_IDLE_BURN: 0.35,        // burn floor when coasting (× full-throttle rate)
  FUEL_NITRO_BURN: 3,          // × while nitro is lit
  FUEL_WARN: 0.25,             // bar turns amber
  FUEL_CRITICAL: 0.1,          // bar turns red

  PIT_WINDOW_SEGMENTS: 90,     // pit lane runs alongside the start/finish straight
  PIT_BOX_SEGMENT: 45,
  // Each car gets its own box down the lane. Sharing one box put two rivals in
  // the same square metre of pit lane, and separation could only ever push them
  // to exactly touching.
  PIT_BOX_SPACING: 400,      // world units between boxes
  PIT_X_INNER: 1.0,            // pit lane occupies x in [-OUTER, -INNER]...
  PIT_X_OUTER: 1.5,            // ...so the left verge of the straight IS the lane
  PIT_SPEED_LIMIT: 0.22,       // × maxSpeed, enforced in the lane
  PIT_STOP_SECONDS: 4,         // stationary time (section 5.4)
  PIT_REPAIR_SECONDS: 2.2,     // extra if you also take repairs
  RIVAL_PIT_FUEL: 0.18,        // rivals dive in below this fraction of a tank
  MODEL_PIT_FUEL: 0.35,        // the model driver's own call (used by the verifiers)
  PIT_APPROACH_SEGMENTS: 22,   // how early a car lines up for the pit entry

  // --- tyre wear (M4) ---
  TYRE_WEAR_PER_LAP: 0.30,     // at medium compound, cruising
  TYRE_WEAR_SCRUB: 1.6,        // × extra wear when the tyres are working hard

  // --- career (M3) ---
  // Enough for one good upgrade or two cheap ones before the first race. At
  // 5,000 a whole Rookie season bought only two levels, which reads as stuck
  // rather than as pressure.
  STARTING_MONEY: 7500,
  RACES_PER_SEASON: 8,
  PROMOTION_PLACES: 3,       // top 3 in the championship are promoted
  NEMESIS_PACE_BOOST: 1.03,  // the rival nearest you on points tries harder
  TYRE_WEAR_GRIP_LOSS: 0.18, // grip lost at fully worn tyres (M4)

  // --- M0 only: constant cruise speed for the scroll test ---
  M0_CRUISE_SPEED: 12000,
};
