// Track 3: "Dominican Ridge" — mountain road, real climbs, and a dirt sector
// where the grip falls off a cliff. The hardest track in the Rookie division.
// 2,125 segments.

import { TrackBuilder, LEN, CURVE, HILL } from '../../game/track.js';

export function buildDominicanTrack() {
  const t = new TrackBuilder();

  t.addStraight(LEN.LONG);

  // The climb
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.HIGH);
  t.addCurve(LEN.SHORT, CURVE.HARD_RIGHT, HILL.LOW);

  // Dirt sector at the top of the ridge — grip 0.65, and it bites
  t.addStraight(LEN.SHORT, 'dirt');
  t.addHairpin(CURVE.LEFT, 'dirt');
  t.addCurve(LEN.MEDIUM, CURVE.MEDIUM_RIGHT, HILL.NONE, 'dirt');

  // Back onto asphalt and down the mountain
  t.addDownhill(LEN.MEDIUM, HILL.HIGH);
  t.addSCurve(LEN.SHORT);

  // Valley straight
  t.addStraight(LEN.LONG);
  t.addCurve(LEN.MEDIUM, CURVE.HARD_RIGHT, HILL.NONE);
  t.addDownhill(LEN.SHORT, HILL.LOW);
  t.addStraight(LEN.MEDIUM);
  t.addCurve(LEN.MEDIUM, CURVE.EASY_RIGHT, HILL.NONE);

  return t.build();
}
