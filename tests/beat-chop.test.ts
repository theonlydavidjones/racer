import { describe, expect, it } from 'vitest';
import { beatInChop, speedInChop } from '../src/boat/seaway';
import { driveCurveFor, driveRatio } from '../src/boat/driveCurve';
import { beatAngle, polar } from '../src/boat/polar';
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
  // (searched to 90°: cut at 65°, light air in a chop gave 56° at 1 kt in 0.3 m where she made no headway, and gave up
  // 15% at 2 kt in 0.8 m; the physics review, 20 Nov 2026)
  it('the steady angle gives up under 0.9% of the most she could make good to windward from 4 kt, 1% from 3 kt, 3.1% from 2 kt (footing off past 65° in light air; it was 15%)', () => {
    for (const [hs, tp] of [[0.1, 1.8], [0.2, 2.2], [0.3, 2.5], [0.5, 3], [0.8, 3.5], [1.2, 4.5]]) for (let kt = 2; kt <= 30; kt += kt < 4 ? 0.25 : 0.5) {
      const a = beatInChop(kt, hs, tp), got = speedInChop(kt, a, hs, tp) * Math.cos(a * D2R);
      let top = 0; for (let t = 25; t <= 90; t += 0.25) top = Math.max(top, speedInChop(kt, t, hs, tp) * Math.cos(t * D2R));
      if (top > 0) expect(1 - got / top, `${kt} kt, ${hs} m at ${a.toFixed(1)}`).toBeLessThan(kt >= 4 ? 0.009 : kt >= 3 ? 0.01 : 0.031);
    }
  });
  // (the physics review of beat-chop, 20 Nov 2026: the smoothed top leaned 0.6–0.9° toward the wind of the polar's
  // flat-water angle, so as the chop passed 2 cm, where beatFor turns from one to the other, she stepped toward pinching)
  // (the v214 review: the chop is raised by the day's mean wind, the angle read in the wind at her, so a lull puts her in
  // 1–2 kt over 0.5 m: it gave 75° at 1.5 kt in 0.5 m where she's stopped, and 90.2° at 0.25 kt in 0.2 m, and in no wind
  // the flat-water lean, −43°, ran it 50–90° by the chop's depth)
  // (the v215 review: the first wider angle with any way on was taken, not a useful one)
  it('where the top found is one she\'s stopped at, the best she makes good footing off from it: 3 kt in 0.76 m and in 0.96 m', () => {
    for (const [kt, hs, tp] of [[3, 0.76, 2.5], [3, 0.96, 3]]) {
      const a = beatInChop(kt, hs, tp), got = speedInChop(kt, a, hs, tp) * Math.cos(a * D2R);
      let top = 0; for (let t = 25; t <= 90; t += 0.25) top = Math.max(top, speedInChop(kt, t, hs, tp) * Math.cos(t * D2R));
      expect(got / top, `${kt} kt, ${hs} m at ${a.toFixed(1)}`).toBeGreaterThan(0.95);
    }
  });
  it('in light air in a chop, an angle she makes way at wherever one exists, and within 30–90°', () => {
    for (let kt = 0; kt <= 2; kt += 0.125) for (let hs = 0.04; hs <= 1.2; hs += 0.04) {
      const tp = 2 + 2 * hs, a = beatInChop(kt, hs, tp);
      expect(a, `${kt} kt, ${hs.toFixed(2)} m`).toBeGreaterThanOrEqual(30); expect(a, `${kt} kt, ${hs.toFixed(2)} m`).toBeLessThanOrEqual(90);
      let way = false; for (let t = 30; t <= 90 && !way; t += 0.5) way = speedInChop(Math.round(kt * 4) / 4, t, Math.round(hs * 50) / 50, Math.round(tp * 10) / 10) > 0;
      if (way) expect(speedInChop(Math.round(kt * 4) / 4, a, Math.round(hs * 50) / 50, Math.round(tp * 10) / 10), `${kt} kt, ${hs.toFixed(2)} m at ${a.toFixed(1)}`).toBeGreaterThan(0);
    }
  });
  // (the v213 review: with no headway at any angle it gave 65°, 21–25° off its neighbors that made way at 86–90°)
  it('under 2 kt in a chop, no 20° jumps at the edge of headway: each 2 cm of chop moves it under 10°', () => {
    for (const kt of [0.5, 0.75, 1, 1.25, 1.5]) { let prev = beatInChop(kt, 0.1, 2.2);
      for (let hs = 0.12; hs <= 1.2; hs += 0.02) { const a = beatInChop(kt, hs, 2 + 2 * hs); expect(Math.abs(a - prev), `${kt} kt, ${hs.toFixed(2)} m`).toBeLessThan(10); prev = a; } }
  });
  it('as the chop gets up from nothing she doesn\'t step closer to the wind: at 2 cm, the flat-water angle within 0.15°', () => {
    for (let kt = 2; kt <= 30; kt += 0.5) expect(Math.abs(beatInChop(kt, 0.02, 1.5) - beatAngle(kt)), `${kt} kt`).toBeLessThan(0.15);
  });
  it('more chop moves it smoothly too: a step of the sea\'s height (0.02 m) or period (0.1 s) under a degree', () => {
    for (const [k0, k1, hs, tp] of SEAS) for (let kt = k0; kt <= k1; kt += 1) {
      const a = beatInChop(kt, hs, tp);
      expect(Math.abs(beatInChop(kt, hs + 0.02, tp) - a), `${kt} kt, ${hs} m, higher`).toBeLessThan(1);
      expect(Math.abs(beatInChop(kt, hs, tp + 0.1) - a), `${kt} kt, ${hs} m, longer`).toBeLessThan(1);
    }
  });
  it('the sails\' drive against her speed runs smoothly across the table\'s own lines (every 5°, every knot) and between them: no step', () => {
    let worst = 0;
    // (on the table's lines, 45° and 12 kt and the like, where a wrong neighbor row would show; and midway, where the
    // nearest row used to change)
    for (const kt of [6, 6.5, 9, 12, 12.5, 17.5, 22]) for (const a of [40, 42.5, 45, 47.5, 50, 90, 132.5, 135]) for (const x of [0.3, 0.6, 0.85, 1.1]) {
      const vt = polar(kt, a);
      worst = Math.max(worst, Math.abs(driveRatio(kt, a + 0.01, x * vt, vt) - driveRatio(kt, a - 0.01, x * vt, vt)), Math.abs(driveRatio(kt + 0.005, a, x * vt, vt) - driveRatio(kt - 0.005, a, x * vt, vt)));
    }
    expect(worst).toBeLessThan(0.002); // (it stepped by up to several percent midway between the lines)
    // (midway between two angles' rows, the mean of the two rows; and of two knots' rows: each read on its own line)
    const at = (kt: number, a: number, x: number) => { const vt = polar(kt, a); return driveRatio(kt, a, x * vt, vt); };
    for (const x of [0.3, 0.6, 0.85]) {
      expect(at(12, 47.5, x)).toBeCloseTo((at(12, 45, x) + at(12, 50, x)) / 2, 9);
      expect(at(12.5, 45, x)).toBeCloseTo((at(12, 45, x) + at(13, 45, x)) / 2, 9);
    }
    const vt = polar(12, 45); expect(driveCurveFor(12, 45, vt)(vt)).toBeCloseTo(1, 6);
  });
});
