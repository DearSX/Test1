// Track 2: "Providence Point" — coastal, fast, flat-ish.
// The high-speed circuit: two long straights for slipstream duels, and a damp
// section where the fast right-hander suddenly isn't. 2,350 segments.

import { TrackBuilder, LEN, CURVE, HILL } from '../../game/track.js';

export function buildProvidenceTrack() {
  const t = new TrackBuilder();

  // Start/finish straight, into an easy opener
  t.addStraight(LEN.LONG);
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.NONE);
  t.addStraight(LEN.MEDIUM);

  // Hard left onto the seafront — brake or bounce off the wall
  t.addCurve(LEN.SHORT, CURVE.HARD_LEFT, HILL.NONE);
  t.addSCurve(LEN.SHORT);

  // The long one. Best overtaking spot on the calendar.
  t.addStraight(LEN.LONG);

  // Rise into the damp section
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.LOW);
  t.addStraight(LEN.SHORT, 'wet');
  t.addCurve(LEN.MEDIUM, CURVE.HARD_RIGHT, HILL.NONE, 'wet');
  t.addDownhill(LEN.MEDIUM, HILL.LOW);

  // Hairpin right, then the run home
  t.addHairpin(CURVE.RIGHT);
  t.addStraight(LEN.LONG);
  t.addCurve(LEN.MEDIUM, CURVE.EASY_LEFT, HILL.NONE);

  return t.build();
}
