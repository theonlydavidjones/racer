import { D2R, KT, clamp } from '../core/math';
import { CE_ABOVE_WL, sailForces } from './balance';
import { targetShape } from './controls';
import { optimalSheet, sailTrim } from './trim';
import { polar } from './polar';
const polarSpeed = (w: number, a: number) => polar(w, a, 'jib');

/**
 * How the sails' drive changes with her speed, at a true wind and angle, against what it is at the polar's speed: the
 * sail model's drive (balance.ts sailForces, ORC's coefficients, trimmed and shaped as the crew would for the apparent
 * wind at each speed) at speed v over the same at vt. Slow, the apparent wind is lighter and broader: close-hauled it
 * pushes less than at full speed (ORC's model gives 0.7–0.8 of it at rest), and only from about 120° does it push
 * more (and in a breeze on a beam reach, where at full speed the crew has her flattened and at a crawl needn't, a little
 * more). In place of a flat boost (×1.6 at rest at every angle, which the audit found too much push from rest and
 * through a tack). The drive at the polar's speed stays the polar's (dynamics.ts drive): this only shapes it below
 * and above that.
 *
 * The wind at the sails' height by ORC's log profile (VPP Documentation §7.1, z0 = 0.005 m), as physics.ts sailWind; her
 * course's angle (the polar's), upright. Tabled by the knot, 5° of angle and a twentieth of the speed ratio, and read
 * blended between the knots and the angles either side.
 */
const GRADIENT = Math.log(CE_ABOVE_WL / 0.005) / Math.log(10 / 0.005);
/** The ratios, filled in as asked for (0: not yet): a flat table, as the AI's predictions ask thousands of times a step. */
const cache = new Float64Array(41 * 64 * 32);

/** The sails' drive (N) along her course at speed u (m/s) in tws kt at twa deg, trimmed for that apparent wind. */
function sailDrive(tws: number, twa: number, u: number): number {
  const vt = tws * KT * GRADIENT, r = twa * D2R, along = vt * Math.cos(r) + u, across = vt * Math.sin(r);
  const aws = Math.hypot(along, across), awa = Math.atan2(across, along) / D2R;
  const sm = optimalSheet('main', awa), sj = optimalSheet('jib', awa);
  const sf = sailForces(aws, awa, { trim: sailTrim('main', awa, sm), shape: targetShape('main', tws, awa), out: sm }, { trim: sailTrim('jib', awa, sj), shape: targetShape('jib', tws, awa) }, false);
  return sf.main.drive + sf.jib.drive;
}

/**
 * The table's four corners round a wind and an angle, and how much of each: the knot below and above, the 5° below and
 * above, blended (bilinear). The ratio used to be read at the nearest knot and the nearest 5° alone, which stepped by a
 * couple of percent at each bin's edge: enough to give her speed made good in chop two near-equal peaks, and the beat
 * angle found from it swung 5–7° on a quarter-knot puff, the AI's target angle and the laylines with it.
 */
function corners(tws: number, twa: number): { w0: number; w1: number; a0: number; a1: number; fw: number; fa: number } {
  const w = clamp(tws, 2, 40), a = clamp(twa, 30, 180) / 5;
  const w0 = Math.floor(w), a0 = Math.floor(a), fw = w - w0, fa = a - a0;
  return { w0, w1: fw > 0 ? w0 + 1 : w0, a0: a0 * 5, a1: (fa > 0 ? a0 + 1 : a0) * 5, fw, fa };
}
/** Drive at speed v over drive at the polar's speed vt (both m/s), for tws kt at the course's angle twa. 1 at v = vt. */
export function driveRatio(tws: number, twa: number, v: number, vt: number): number {
  if (vt <= 0.05) return 1;
  const { w0, w1, a0, a1, fw, fa } = corners(tws, twa), x = clamp(v / vt * 20, 0, 29.999), q = Math.floor(x), f = x - q;
  const col = (k: number) => (at(w0, a0, k) * (1 - fa) + at(w0, a1, k) * fa) * (1 - fw) + (at(w1, a0, k) * (1 - fa) + at(w1, a1, k) * fa) * fw;
  return col(q) * (1 - f) + col(q + 1) * f;
}
/**
 * driveRatio as a curve for one wind, angle and polar speed: the corners and their weights worked out once, and the
 * blended row filled in as it's asked for, so each look after the first at a speed is a multiply and two reads (the AI's
 * predictions step a speed along it hundreds of times).
 */
export function driveCurveFor(tws: number, twa: number, vt: number): (v: number) => number {
  if (vt <= 0.05) return () => 1;
  const { w0, w1, a0, a1, fw, fa } = corners(tws, twa), s = 20 / vt;
  const k00 = (1 - fw) * (1 - fa), k01 = (1 - fw) * fa, k10 = fw * (1 - fa), k11 = fw * fa;
  const r00 = (w0 * 64 + a0 / 5) * 32, r01 = (w0 * 64 + a1 / 5) * 32, r10 = (w1 * 64 + a0 / 5) * 32, r11 = (w1 * 64 + a1 / 5) * 32;
  // (a corner with no weight isn't looked up: on a whole knot and a whole 5°, the one row as before)
  const cell = (r: number, w: number, a: number, q: number) => cache[r + q] || at(w, a, q);
  const col = (q: number) => (k00 ? k00 * cell(r00, w0, a0, q) : 0) + (k01 ? k01 * cell(r01, w0, a1, q) : 0) + (k10 ? k10 * cell(r10, w1, a0, q) : 0) + (k11 ? k11 * cell(r11, w1, a1, q) : 0);
  return (v: number) => {
    const x = clamp(v * s, 0, 29.999), q = Math.floor(x), f = x - q;
    return col(q) * (1 - f) + col(q + 1) * f;
  };
}
function at(w: number, a: number, q: number): number {
  const key = (w * 64 + a / 5) * 32 + q; // (w ≤ 40, a/5 ≤ 36, q ≤ 30: each in its own field, no two conditions share a key)
  let k = cache[key];
  if (k === 0) {
    const vt = polarSpeed(w, a), d1 = sailDrive(w, a, vt);
    // (at least a tenth: a sail model that turns the drive negative at some broad angle at speed mustn't stall the boat)
    k = d1 > 1 ? clamp(sailDrive(w, a, q / 20 * vt) / d1, 0.1, 3) : 1;
    cache[key] = k;
  }
  return k;
}
