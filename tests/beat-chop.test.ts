import { describe, expect, it } from 'vitest';
import { beatInChop, speedInChop } from '../src/boat/seaway';
import { driveCurveFor, driveRatio } from '../src/boat/driveCurve';
import { polar } from '../src/boat/polar';
import { D2R } from '../src/core/math';

/**
 * The beat angle in chop held steady (ROADMAP: "The beat angle in chop jumps"). Her speed in a chop is worked from
 * tables read in straight lines (the sails' drive by the knot and 5° of angle, the polar's angles, the hull's
 * resistance), so the speed made good against the angle had steps and corners, two near-equal peaks 5° apart, and the
 * best angle swung 5 to 7° on a quarter-knot puff: the AI's target angle and the laylines with it. Now the drive is read
 * between its knots and angles, and the angle is the middle of the top of the curve, not its highest wrinkle.
 */
describe('the beat angle in chop holds steady through a puff', () => {
  // (the chop a wind raises on the Bay, about: the sea the sim's own boats meet)
  const SEAS: [number, number, number, number][] = [[6, 10, 0.1, 1.8], [8, 14, 0.2, 2.2], [10, 18, 0.3, 2.5], [14, 24, 0.5, 3], [18, 30, 0.8, 3.5]];
  it('a quarter knot more wind moves it under a degree, in every wind and the chop it raises', () => {
    for (const [k0, k1, hs, tp] of SEAS) for (let kt = k0; kt < k1; kt += 0.25) {
      expect(Math.abs(beatInChop(kt + 0.25, hs, tp) - beatInChop(kt, hs, tp)), `${kt} kt, ${hs} m`).toBeLessThan(1);
    }
  });
  it('and in any wind and chop at all, light air in a big chop too, by no more than a degree and a half (it was 7)', () => {
    for (const [hs, tp] of [[0.1, 1.8], [0.2, 2.2], [0.3, 2.5], [0.5, 3], [0.8, 3.5], [1.2, 4.5]]) for (let kt = 4; kt <= 30; kt += 0.25) {
      expect(Math.abs(beatInChop(kt + 0.25, hs, tp) - beatInChop(kt, hs, tp)), `${kt} kt, ${hs} m`).toBeLessThan(1.5);
    }
  });
  it('the steady angle gives up under 1% of the most she could make good to windward', () => {
    for (const [hs, tp] of [[0.1, 1.8], [0.3, 2.5], [0.5, 3], [0.8, 3.5], [1.2, 4.5]]) for (let kt = 4; kt <= 30; kt += 0.5) {
      const a = beatInChop(kt, hs, tp), got = speedInChop(kt, a, hs, tp) * Math.cos(a * D2R);
      let top = 0; for (let t = 30; t <= 65; t += 0.25) top = Math.max(top, speedInChop(kt, t, hs, tp) * Math.cos(t * D2R));
      if (top > 0) expect(1 - got / top, `${kt} kt, ${hs} m at ${a.toFixed(1)}`).toBeLessThan(0.01);
    }
  });
  it('the sails\' drive against her speed runs smoothly across the table\'s angles and knots: no step at a 5° or a whole-knot line', () => {
    let worst = 0;
    for (const kt of [6.5, 9.5, 12.5, 17.5, 22.5]) for (const a of [42.5, 47.5, 52.5, 87.5, 132.5]) for (const x of [0.3, 0.6, 0.85, 1.1]) {
      const vt = polar(kt, a);
      worst = Math.max(worst, Math.abs(driveRatio(kt, a + 0.01, x * vt, vt) - driveRatio(kt, a - 0.01, x * vt, vt)), Math.abs(driveRatio(kt + 0.005, a, x * vt, vt) - driveRatio(kt - 0.005, a, x * vt, vt)));
    }
    expect(worst).toBeLessThan(0.002); // (it stepped by up to several percent at each line)
    // (on a table line, exactly the table's own row: nothing changed there)
    const vt = polar(12, 45), k = driveCurveFor(12, 45, vt);
    expect(k(vt)).toBeCloseTo(1, 6); expect(driveRatio(12, 45, 0.5 * vt, vt)).toBeCloseTo(k(0.5 * vt), 12);
  });
});
