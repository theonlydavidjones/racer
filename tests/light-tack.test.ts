import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { wrap } from '../src/core/math';
import type { Boat } from '../src/boat/boat';

/**
 * AI steering in a dying breeze (ROADMAP; the Coordinator, 19 Nov 2026): in 1-4 kt her close-hauled speed is 0.5-1.2 m/s,
 * all under the old fixed SLOW_TACK of 1.3 m/s, so every tack her plan asked for the helm turned into a gybe right round
 * (250-280°, 100 s at 0.3 m/s in seed 4's 6 kt race when it died to 1-1.5 kt), and on the layline she bore away to build
 * a speed the wind couldn't give her. Measured in this sim in flat water, a committed tack from her own close-hauled speed
 * gets through in 1-10 kt, in 6-24 s (from 0.3 of it, in 17-29 s; sculling round the last of it, rule 42.3(d)). So in
 * light air she tacks.
 */
describe('A tack in light air (physics.ts slowTack)', () => {
  for (const kt of [1.5, 2, 3, 4]) it(`in ${kt} kt, close-hauled at her own speed and asked for the other tack, she tacks, not gybes`, () => {
    const a = beatAngle(kt), b = testBoat({ heading: 360 - a, kt: 1, windKt: kt });
    sail(b, 90); // (settled close-hauled on starboard: wind from 0, heading 360 - a)
    b.isUser = false; b.ai = { turnCommit: 0, commitFor: 0 } as unknown as NonNullable<Boat['ai']>;
    b.desired = a; // (port close-hauled)
    let far = 0, round = -1;
    sail(b, 60, t => { far = Math.max(far, Math.abs(wrap(b.h - 180))< 90 ? 1 : 0); if (Math.abs(wrap(b.h - a)) < 10) { round = t; return true; } });
    expect(far, `in ${kt} kt she bore away past the beam (a gybe round), from ${(b.v).toFixed(2)} m/s`).toBe(0);
    expect(round, 'round onto port close-hauled within 40 s').toBeGreaterThan(0);
    expect(round).toBeLessThan(40);
  });
  it('in 12 kt, slowed to 1 m/s, she still bears away round (above SLOW_TACK\'s reach, as before)', () => {
    const a = beatAngle(12), b = testBoat({ heading: 360 - a, kt: 1, windKt: 12 });
    sail(b, 60); b.v = 1.0;
    b.isUser = false; b.ai = { turnCommit: 0, commitFor: 0 } as unknown as NonNullable<Boat['ai']>;
    b.desired = a;
    let far = false;
    sail(b, 60, () => { if (Math.abs(wrap(b.h - 180)) < 60) far = true; });
    expect(far, 'gybed round').toBe(true);
  });
});
