// Track 5: "Providence Night" — the night variant the plan asks for at M6.
//
// Same coastal geography as Providence Point, driven in the dark and cold: the
// damp section has frozen over. Ice is grip 0.40, which makes the fast right a
// genuine problem — the hairpin is holdable at 35% of top speed there against
// 61% on dry asphalt.
//
// Turns net one full lap clockwise so the circuit closes on the minimap.

import { TrackBuilder, LEN, CURVE, HILL } from '../../game/track.js';

export function buildNightTrack() {
  const t = new TrackBuilder();

  // Start/finish straight — pit lane down the left
  t.addStraight(LEN.LONG);
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.NONE);
  t.addStraight(LEN.MEDIUM);

  // Hard left onto the seafront
  t.addCurve(LEN.SHORT, CURVE.HARD_LEFT, HILL.NONE);
  t.addSCurve(LEN.SHORT);

  // The long straight, in the dark
  t.addStraight(LEN.LONG);

  // Up into the ice. Wet by day, frozen by night.
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.LOW);
  t.addStraight(LEN.SHORT, 'ice');
  t.addCurve(LEN.MEDIUM, CURVE.HARD_RIGHT, HILL.NONE, 'ice');
  t.addStraight(LEN.SHORT, 'ice');
  t.addDownhill(LEN.MEDIUM, HILL.LOW);

  // Hairpin right, then home
  t.addHairpin(CURVE.RIGHT);
  t.addStraight(LEN.LONG);
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.NONE);

  return t.build();
}
