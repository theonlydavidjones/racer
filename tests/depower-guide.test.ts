import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { boomAngle } from '../src/boat/controls';
import type { Boat } from '../src/boat/boat';

/** Close-hauled in a steady `kt`, the crew trimming, for a minute. */
function beating(kt: number): Boat {
  const b = testBoat({ heading: 318, kt: 5, windKt: kt });
  sail(b, 60, () => { b.h = courseHeading(b, 318); });
  return b;
}

/** The crew's steady-wind settings upwind as the wind builds, against North Sails' Nordic Folkboat tuning guide. */
describe('depowering as North\'s Folkboat guide has it (steady wind, upwind)', () => {
  it('"Never use the kickingstrap upwind in less than 18 knots": off, not slack, to 16 kt', () => {
    for (const kt of [8, 12, 14, 16]) expect(beating(kt).ctl.vang).toBe(0);
  });
  it('"In higher wind the cars are eased to leeward": from 16 kt the traveller is down, and stays down as the wind builds', () => {
    let last = 0;
    for (const kt of [16, 18, 20, 22, 25]) { const t = beating(kt).ctl.traveller; expect(t).toBeGreaterThan(0.85); expect(t).toBeGreaterThanOrEqual(last - 0.05); last = t; }
  });
  it('"In heavy winds, sheet tight": the boom goes down on the traveller, the sheet only easing past the track\'s end', () => {
    for (const kt of [18, 20, 22, 25]) {
      const b = beating(kt), c = b.ctl;
      if (c.traveller < 0.99) expect(c.mainsheet).toBeLessThan(0.06); // (the car still has track: the sheet stays in hand)
      expect(Math.abs(boomAngle(c) - Math.abs(b.boom))).toBeLessThan(1);
    }
  });
  it('"the top batten is trimmed parallel to the boom in almost all wind strengths": the leech held (twist ≤ 11°) to 25 kt', () => {
    for (const kt of [16, 18, 20, 22, 25]) expect(beating(kt).shape.main.twist).toBeLessThanOrEqual(11);
  });
  it('the guide\'s line settings still hold: the outhaul on the mark above 12 kt, the Cunningham hard above 15', () => {
    for (const kt of [14, 18, 22]) expect(beating(kt).ctl.outhaul).toBeGreaterThan(0.95);
    for (const kt of [17, 20, 25]) expect(beating(kt).ctl.cunningham).toBeGreaterThan(0.85);
  });
});
