import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { boomAngle } from '../src/boat/controls';
import { allToCrew, takeLine } from '../src/boat/physics';
import { IDEAL_HELM } from '../src/boat/balance';
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

describe('the backstay for the helm ("pull the backstay until the rudder feels light again")', () => {
  // (on the behavior, not the wind it starts at: Deep Physics' weather-helm calibration will move that)
  it('the helm heavy with the backstay held off: handed back, the crew pull it on and the helm comes back toward light', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 20 });
    takeLine(b, 'backstay'); (b.ctlTarget ??= {}).backstay = 0;
    sail(b, 60, () => { b.h = courseHeading(b, 318); });
    const heavy = b.helmNeed ?? 0;
    expect(heavy).toBeGreaterThan(IDEAL_HELM + 2); // (heavy: past the light band's top)
    expect(b.helmBackstay).toBeGreaterThan(0.5); // (the crew want it on)
    allToCrew(b); sail(b, 40, () => { b.h = courseHeading(b, 318); });
    expect(b.ctl.backstay).toBeGreaterThan(0.6);
    expect(b.helmNeed ?? 0).toBeLessThan(heavy - 1);
  });
  it('more backstay really lowers the helm she needs (a flatter main, less heel)', () => {
    const at = (bs: number) => { const b = testBoat({ heading: 318, kt: 5, windKt: 18 }); takeLine(b, 'backstay'); (b.ctlTarget ??= {}).backstay = bs; sail(b, 60, () => { b.h = courseHeading(b, 318); }); return b.helmNeed ?? 0; };
    expect(at(1)).toBeLessThan(at(0) - 0.5);
  });
  it('light air or off the wind: no backstay for the helm', () => {
    for (const [h, kt] of [[318, 10], [250, 20]] as const) { const b = testBoat({ heading: h, kt: 5, windKt: kt }); sail(b, 60, () => { b.h = courseHeading(b, h); }); expect(b.helmBackstay ?? 0).toBe(0); }
  });
});
