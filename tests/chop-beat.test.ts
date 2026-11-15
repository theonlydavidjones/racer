import { describe, expect, it } from 'vitest';
import { beatInChop, speedInChop } from '../src/boat/seaway';
import { beatAngle, polar } from '../src/boat/polar';
import { cubicBlend, driveRatio, driveCurveFor } from '../src/boat/driveCurve';
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
  it('moves by a degree at most for a quarter of a knot of wind, 6.5 to 26 kt, in three seas (it jumped 4.5–7°)', () => {
    for (const [hs, tp] of SEAS) {
      let prev = beatInChop(6.5, hs, tp);
      for (let kt = 6.75; kt <= 26; kt += 0.25) { const b = beatInChop(kt, hs, tp); expect(Math.abs(b - prev), `${hs} m, ${kt} kt: ${prev}° to ${b}°`).toBeLessThanOrEqual(1); prev = b; }
    }
  });
  it('... and from 4 kt in the chop light air makes (a fully grown sea in 4–6 kt is 0.1 m or so: sea.ts windSea)', () => {
    for (const [hs, tp] of [[0.05, 1.2], [0.1, 1.5], [0.15, 1.8]]) {
      let prev = beatInChop(4, hs, tp);
      for (let kt = 4.25; kt <= 26; kt += 0.25) { const b = beatInChop(kt, hs, tp); expect(Math.abs(b - prev), `${hs} m, ${kt} kt: ${prev}° to ${b}°`).toBeLessThanOrEqual(1); prev = b; }
    }
  });
  it('in a big chop in light air (below 6.5 kt: more chop than the wind there makes, sea.ts), footing wider as the wind drops, by up to 1.75° a quarter knot: accepted as physics, smoothly, no jumps back and forth', () => {
    // (underpowered, the same wave drag takes a bigger share of the sails' little drive, so the angle that pays widens fast
    // below 5–6 kt: a degree and a half a quarter knot at most, and steadily, the step from one quarter knot to the next
    // changing by under 0.75°)
    for (const [hs, tp] of SEAS) {
      let pp = beatInChop(4, hs, tp), p = beatInChop(4.25, hs, tp);
      expect(p).toBeLessThanOrEqual(pp + 0.25);
      for (let kt = 4.5; kt <= 6.5; kt += 0.25) { const b = beatInChop(kt, hs, tp); expect(b, `${hs} m, ${kt} kt`).toBeLessThanOrEqual(p + 0.25); expect(Math.abs(b - p)).toBeLessThan(1.75); expect(Math.abs(b - 2 * p + pp)).toBeLessThan(0.75); pp = p; p = b; }
      expect(beatInChop(4, hs, tp)).toBeGreaterThan(beatInChop(6, hs, tp) + 3);
    }
  });
  it('is never inside the flat-water beat angle, and runs into it as the chop dies away (no step where the chop starts)', () => {
    for (const kt of [5, 7, 10, 12, 16, 20, 25]) {
      expect(beatInChop(kt, 0.02, 1.2)).toBeCloseTo(beatAngle(kt), 1);
      for (const [hs, tp] of [[0.05, 1.2], [0.1, 1.5], [0.2, 2], [0.3, 2.5], [0.6, 3.2], [1, 4]]) expect(beatInChop(kt, hs, tp), `${kt} kt, ${hs} m`).toBeGreaterThanOrEqual(beatAngle(kt) - 0.01);
    }
  });
  it('her speed made good has one peak: no second peak beside it; and the angle she steers costs a few tenths of a percent of it at most', () => {
    for (const [hs, tp] of SEAS) for (const kt of [6, 7, 8, 10, 14, 20]) {
      const vmg = (t: number) => speedInChop(kt, t, hs, tp) * Math.cos(t * D2R);
      let best = 30, top = 0; for (let t = 30; t <= 65; t += 0.05) { const v = vmg(t); if (v > top) { top = v; best = t; } }
      // (falling away steadily either side of the top, to a tenth of a percent (the polar has its own small ripples): by
      // 8° off, down by more than the search could mistake, and no climb back toward the top on the way)
      for (const dir of [-1, 1]) { let last = top; for (let d = 1; d <= 8; d++) { const v = vmg(best + dir * d); expect(v, `${kt} kt, ${hs} m, ${best + dir * d}°`).toBeLessThanOrEqual(last + 0.001 * top); last = Math.min(last, v); } expect(last).toBeLessThan(0.995 * top); }
      // (the beat angle is the flat water's moved by the chop's footing: with the polar's top smooth it lands within 0.3° of
      // the true best, a hundredth of a percent of her VMG at most; on its old corner it cost 0.27%)
      expect(vmg(beatInChop(kt, hs, tp)), `${kt} kt, ${hs} m`).toBeGreaterThan(0.9995 * top);
    }
  });
  it('in any chop the wind can make (up to half again a fully grown sea, for a current steepening it), a degree a quarter knot at most, 6.5 to 26 kt', () => {
    // (the review's scan: with the polar's top a corner at its beat angle, 0.5–0.7 m in 8 kt stepped 1.16° at some periods;
    // the polar's smooth top takes it under 0.65°. Fully grown: Hs = 0.243·U²/g, U the wind in m/s)
    let worst = 0;
    for (let hs = 0.1; hs <= 1.2; hs += 0.1) for (let tp = 1.5; tp <= 4.5; tp += 0.5) {
      if (hs > 0.1 * 9.81 * tp * tp / (2 * Math.PI)) continue; // (steeper than breaking: sea.ts caps it)
      let prev = beatInChop(6.5, hs, tp);
      for (let kt = 6.75; kt <= 26; kt += 0.25) { const b = beatInChop(kt, hs, tp), U = kt * KT; if (hs <= 1.5 * 0.243 * U * U / 9.81) worst = Math.max(worst, Math.abs(b - prev)); prev = b; }
    }
    expect(worst).toBeLessThan(1);
  }, 120_000);
  it('her speed in chop against the polar\'s changes smoothly with the angle: a third of a percent at most across half a degree (it stepped 1.2%)', () => {
    let worst = 0;
    for (let kt = 8; kt <= 24; kt += 0.25) for (let t = 36; t <= 60; t += 0.5) worst = Math.max(worst, Math.abs(speedInChop(kt, t, 0.6, 3.2) / polar(kt, t) - speedInChop(kt, t + 0.5, 0.6, 3.2) / polar(kt, t + 0.5)));
    expect(worst).toBeLessThan(0.0035);
  });
});

describe('the sails\' drive against her speed, between the table\'s knots and angles', () => {
  it('is the table\'s own figure on a whole knot and a whole 5°, and blended between its neighbors off them', () => {
    const vt = polar(12, 45), at = (w: number, a: number) => driveRatio(w, a, 0.6 * polar(w, a), polar(w, a));
    // (the cubic blend, halfway between two knots, halfway between two angles: Catmull-Rom's halfway,
    // (−p₋₁ + 9p₀ + 9p₁ − p₂)/16, of the table's points either side and one beyond each)
    const q = 12, cb = (w: number, a: number) => cubicBlend(w, a, q);
    const half = (f: (i: number) => number) => (-f(-1) + 9 * f(0) + 9 * f(1) - f(2)) / 16;
    expect(cb(12.5, 45)).toBeCloseTo(half(i => cb(12 + i, 45)), 12);
    expect(cb(12, 47.5)).toBeCloseTo(half(i => cb(12, 45 + 5 * i)), 12);
    expect(cb(12.5, 47.5)).toBeCloseTo(half(i => half(j => cb(12 + i, 45 + 5 * j))), 12);
    // (driveRatio reads it from the finer table: on its points (quarter knots, whole degrees) the cubic itself, and
    // between them within a part in ten thousand)
    const r = (w: number, a: number) => driveRatio(w, a, 0.6 * vt, vt);
    expect(r(12.25, 47)).toBeCloseTo(cb(12.25, 47), 6);
    for (const [w, a] of [[12.1, 47.5], [12.6, 43.3], [7.4, 61.7]]) expect(Math.abs(r(w, a) - cb(w, a))).toBeLessThan(1e-4);
    // (the straight-line blend's corner at 45°, 6 kt, −0.0084 to −0.0008 a degree, is down to the fine table's own:
    // under half the slope, where it was nine tenths)
    const v6 = polar(6, 45), sl = (a: number) => (driveRatio(6, a + 0.01, 0.8 * v6, v6) - driveRatio(6, a - 0.01, 0.8 * v6, v6)) / 0.02;
    expect(Math.abs(sl(45.03) - sl(44.97))).toBeLessThan(0.5 * Math.abs(sl(44.97)));
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
