// Track 4: "Costa Rica Jungle" — tight, technical, wet under the canopy.
// Two hairpins and barely a straight worth the name. Rewards the driver who
// knows where the road goes. 2,150 segments.

import { TrackBuilder, LEN, CURVE, HILL } from '../../game/track.js';

export function buildCostaRicaTrack() {
  const t = new TrackBuilder();

  t.addStraight(LEN.MEDIUM);
  t.addSCurve(LEN.SHORT);

  // Left-right flick
  t.addCurve(LEN.SHORT, CURVE.HARD_LEFT, HILL.LOW);
  t.addCurve(LEN.SHORT, CURVE.HARD_RIGHT, HILL.NONE);

  // Under the canopy — permanently damp
  t.addStraight(LEN.SHORT, 'wet');
  t.addHairpin(CURVE.RIGHT, 'wet');
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.NONE, 'wet');
  t.addDownhill(LEN.SHORT, HILL.LOW);

  // The only real straight, and the only real overtaking chance
  t.addStraight(LEN.LONG);
  t.addSCurve(LEN.SHORT);

  // Climb to the second hairpin, then drop back to the line
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.UP);
  t.addHairpin(CURVE.LEFT);
  t.addDownhill(LEN.MEDIUM, HILL.UP);
  t.addStraight(LEN.MEDIUM);

  return t.build();
}
