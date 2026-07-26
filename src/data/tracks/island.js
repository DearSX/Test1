// Track 1: "Island Loop" — the M0 test track.
// Authored, fixed, repeatable. ~1600 segments per lap.
// Has long straights (slipstream, later), a genuinely hard hairpin,
// an S-complex, and real elevation. Turns net one full lap clockwise so the
// circuit closes — see the minimap note in render/minimap.js.

import { TrackBuilder, LEN, CURVE, HILL } from '../../game/track.js';

export function buildIslandTrack() {
  const t = new TrackBuilder();

  // Start/finish straight — the pit lane runs down the left of this (M4)
  t.addStraight(LEN.LONG);

  // Opening sweeper right over a crest
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.LOW);
  t.addStraight(LEN.SHORT);

  // Climb into the hills
  t.addHill(LEN.MEDIUM, HILL.HIGH);
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.LOW);

  // The hard one: downhill hairpin left. Flat-out = grass. This is the corner
  // TUNE.CENTRIFUGAL is tuned against — see tools/verify-m1.mjs.
  t.addDownhill(LEN.SHORT, HILL.UP);
  t.addHairpin(CURVE.LEFT);

  // Short chute, then the S-complex
  t.addStraight(LEN.SHORT);
  t.addSCurve(LEN.SHORT);

  // Back straight — the brave-overtake spot
  t.addStraight(LEN.LONG);

  // Fast right-right leading downhill toward home
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.NONE);
  t.addCurve(LEN.MEDIUM, CURVE.HARD_RIGHT, HILL.NONE);
  t.addDownhill(LEN.MEDIUM, HILL.HIGH);

  // Final right onto the start/finish straight
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.NONE);
  t.addStraight(LEN.SHORT);

  return t.build();
}
