// Every magic number lives here. Section 10 of the build plan.
export const TUNE = {
  STEP: 1 / 60,
  SEGMENT_LEN: 200,
  DRAW_DISTANCE: 300,        // segments
  FOV: 100,                  // degrees
  CAMERA_HEIGHT: 1000,
  ROAD_WIDTH: 2000,          // half-width in world units
  RUMBLE_LEN: 3,             // segments per rumble stripe
  FOG_DENSITY: 5,            // distance haze; also hides far segments popping over crests

  CENTRIFUGAL: 0.35,         // ← the soul dial. Tune this first, tune it most. (M1)
  STEER_RATE: 2.2,           // (M1)
  OFFROAD_DECEL: 0.99,       // (M1)
  OFFROAD_MAX: 0.4,          // × maxSpeed (M1)
  DRAG_K: 0.0009,            // (M1)
  SLIPSTREAM: 1.08,          // (M2)
  SLIPSTREAM_RANGE: 25,      // segments (M2)
  NITRO_BOOST: 1.35,         // (M1/M3)
  NITRO_GRIP_PENALTY: 0.85,
  NITRO_DURATION: 2.5,       // seconds
  CRASH_RECOVERY: 1.5,       // seconds

  // M0 only: constant cruise speed for the scroll test (world units / second)
  M0_CRUISE_SPEED: 12000,
};
