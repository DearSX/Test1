// Track 1: "Island Loop" — the M0 test track.
// Authored, fixed, repeatable. ~1600 segments per lap.
// Has long straights (slipstream, later), a genuinely hard hairpin,
// an S-complex, and real elevation.

import { TrackBuilder, LEN, CURVE, HILL } from '../../game/track.js';

export function buildIslandTrack() {
  const t = new TrackBuilder();

  // Start/finish straight — pit lane lives here later (M4)
  t.addStraight(LEN.LONG);

  // Opening sweeper right over a crest
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.LOW);
  t.addStraight(LEN.SHORT);

  // Climb into the hills
  t.addHill(LEN.MEDIUM, HILL.HIGH);
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_LEFT, HILL.LOW);

  // The hard one: downhill hairpin left. Flat-out = grass (M1's test corner).
  t.addDownhill(LEN.SHORT, HILL.UP);
  t.addHairpin(CURVE.LEFT);

  // Short chute, then the S-complex
  t.addStraight(LEN.SHORT);
  t.addSCurve(LEN.SHORT);

  // Back straight — the brave-overtake spot
  t.addStraight(LEN.LONG);
  t.addStraight(LEN.MEDIUM);

  // Fast right-right leading downhill toward home
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.NONE);
  t.addCurve(LEN.SHORT, CURVE.HARD_RIGHT, HILL.NONE);
  t.addDownhill(LEN.MEDIUM, HILL.HIGH);

  // Final easy left onto the start/finish straight
  t.addCurve(LEN.MEDIUM, CURVE.EASY_LEFT, HILL.NONE);
  t.addStraight(LEN.SHORT);

  return t.build();
}
