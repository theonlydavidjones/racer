import { describe, expect, it } from 'vitest';
import { beatInChop, speedInChop } from '../src/boat/seaway';
import { polar } from '../src/boat/polar';
import { driveRatio, driveCurveFor } from '../src/boat/driveCurve';
import { HULL, hullResistance, resistanceParts } from '../src/boat/dynamics';
import { D2R, KT } from '../src/core/math';

/**
 * Her best angle to windward in a chop, steady in the wind (ROADMAP, "The beat angle in chop jumps"): it swung 5–7° on
 * a quarter-knot puff (42° at 6 kt, 49° at 7, 42° at 8 in 0.6 m of chop), the AI's target angle and the laylines with
 * it. Two causes: the hull's residuary resistance was joined by straight lines, so its slope jumped at each point of
 * the table (what a drag costs her in speed goes by that slope); and the sails' drive against her speed was read at the
 * nearest knot and the nearest 5°, unblended.
 */
const SEAS: [number, number][] = [[0.3, 2.5], [0.6, 3.2], [1.0, 4]];

describe('the beat angle in chop', () => {
  it('moves by a degree at most for a quarter of a knot of wind, 6 to 26 kt, in three seas (it jumped 4.5–7°)', () => {
    for (const [hs, tp] of SEAS) {
      let prev = beatInChop(6, hs, tp);
      for (let kt = 6.25; kt <= 26; kt += 0.25) { const b = beatInChop(kt, hs, tp); expect(Math.abs(b - prev), `${hs} m, ${kt} kt: ${prev}° to ${b}°`).toBeLessThanOrEqual(1); prev = b; }
    }
  });
  it('is the one peak of her speed made good: no second peak beside it', () => {
    for (const [hs, tp] of SEAS) for (const kt of [6, 7, 8, 10, 14, 20]) {
      const vmg = (t: number) => speedInChop(kt, t, hs, tp) * Math.cos(t * D2R), best = beatInChop(kt, hs, tp), top = vmg(best);
      // (falling away steadily either side, to a tenth of a percent (the polar has its own small ripples): by 8° off, down
      // by more than the half-degree search could mistake, and no
      // climb back toward the top on the way)
      for (const dir of [-1, 1]) { let last = top; for (let d = 1; d <= 8; d++) { const v = vmg(best + dir * d); expect(v, `${kt} kt, ${hs} m, ${best + dir * d}°`).toBeLessThanOrEqual(last + 0.001 * top); last = Math.min(last, v); } expect(last).toBeLessThan(0.995 * top); }
    }
  });
  it('her speed in chop against the polar\'s changes smoothly with the angle: a third of a percent at most across half a degree (it stepped 1.2%)', () => {
    let worst = 0;
    for (let kt = 8; kt <= 24; kt += 0.25) for (let t = 36; t <= 60; t += 0.5) worst = Math.max(worst, Math.abs(speedInChop(kt, t, 0.6, 3.2) / polar(kt, t) - speedInChop(kt, t + 0.5, 0.6, 3.2) / polar(kt, t + 0.5)));
    expect(worst).toBeLessThan(0.0035);
  });
});

describe('the sails\' drive against her speed, between the table\'s knots and angles', () => {
  it('is the table\'s own figure on a whole knot and a whole 5°, and blended between its neighbors off them', () => {
    const vt = polar(12, 45), at = (w: number, a: number) => driveRatio(w, a, 0.6 * polar(w, a), polar(w, a));
    // (halfway between two knots, halfway between two angles: the mean of the corners, at the same share of her speed)
    const r = (w: number, a: number) => driveRatio(w, a, 0.6 * vt, vt);
    expect(r(12.5, 45)).toBeCloseTo((r(12, 45) + r(13, 45)) / 2, 9);
    expect(r(12, 47.5)).toBeCloseTo((r(12, 45) + r(12, 50)) / 2, 9);
    expect(r(12.5, 47.5)).toBeCloseTo((r(12, 45) + r(13, 45) + r(12, 50) + r(13, 50)) / 4, 9);
    expect(at(12, 45)).toBeGreaterThan(0.5); expect(at(12, 45)).toBeLessThan(1.05); // (slowed to 0.6 of her speed close-hauled she has less drive, not more)
    // (no step at a bin's edge, where the nearest knot and the nearest 5° used to change)
    for (const [w, a] of [[12.5, 45], [12, 42.5], [12, 47.5], [7.5, 40]]) for (const [dw, da] of [[0.01, 0], [0, 0.01]]) expect(Math.abs(r(w + dw, a + da) - r(w - dw, a - da))).toBeLessThan(0.002);
    // (and the curve for one wind and angle is the same thing)
    const k = driveCurveFor(12.3, 43.7, polar(12.3, 43.7));
    for (const x of [0, 0.3, 0.77, 1, 1.2]) expect(k(x * polar(12.3, 43.7))).toBeCloseTo(driveRatio(12.3, 43.7, x * polar(12.3, 43.7), polar(12.3, 43.7)), 12);
  });
});

describe('the hull\'s wave-making resistance', () => {
  it('passes through its table\'s points, rises all the way, and has no corners: its slope doesn\'t jump at the points', () => {
    const W = HULL.displacement * 9.81, fn = (f: number) => resistanceParts(f * Math.sqrt(9.81 * HULL.length)).residuary / W;
    for (const [f, y] of [[0.15, 0.0003], [0.25, 0.0018], [0.3, 0.004], [0.35, 0.0085], [0.4, 0.019], [0.5, 0.062]]) expect(fn(f)).toBeCloseTo(y, 9);
    let prev = 0; for (let f = 0.01; f <= 0.6; f += 0.005) { const y = fn(f); expect(y, `Fn ${f.toFixed(3)}`).toBeGreaterThanOrEqual(prev); prev = y; }
    // (the slope just below and just above each point: equal, where straight lines gave it a jump of a half and more)
    for (const f of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45]) { const h = 1e-4, below = (fn(f) - fn(f - h)) / h, above = (fn(f + h) - fn(f)) / h; expect(Math.abs(above - below) / below, `Fn ${f}`).toBeLessThan(0.02); }
    // (and her whole resistance with it: between 3.5 and 4.7 kt, the 3.7 and 4.5 kt corners gone)
    for (let v = 3.5 * KT; v <= 4.7 * KT; v += 0.02) { const h = 0.005, a = hullResistance(v) - hullResistance(v - h), b = hullResistance(v + h) - hullResistance(v); expect(Math.abs(b - a) / a).toBeLessThan(0.05); }
  });
});
