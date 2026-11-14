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
 * The table's points round a wind and an angle, and how much of each: the two knots either side and the two 5° either
 * side, and one more beyond each, blended by Catmull-Rom's cubic (it passes through the table's points, and its slope
 * runs on smoothly through them). The ratio used to be read at the nearest knot and the nearest 5° alone, which stepped
 * by a couple of percent at each bin's edge; read straight-line between them it still turned a corner at each 5°, and
 * either way her speed made good in chop grew two near-equal peaks either side of a table angle, and the beat angle found
 * from it jumped 2–7° on a quarter-knot puff, the AI's target angle and the laylines with it.
 */
const W = new Float64Array(4), WA = new Float64Array(4);
/** Catmull-Rom's weights for the points at −1, 0, 1 and 2 at t (0…1) between 0 and 1, into o. */
function cubic(t: number, o: Float64Array): void {
  const t2 = t * t, t3 = t2 * t;
  o[0] = (-t3 + 2 * t2 - t) / 2; o[1] = (3 * t3 - 5 * t2 + 2) / 2; o[2] = (-3 * t3 + 4 * t2 + t) / 2; o[3] = (t3 - t2) / 2;
}
/** Drive at speed v over drive at the polar's speed vt (both m/s), for tws kt at the course's angle twa. 1 at v = vt. */
export const driveRatio = (tws: number, twa: number, v: number, vt: number): number => driveCurveFor(tws, twa, vt)(v);
/**
 * driveRatio as a curve for one wind, angle and polar speed. Read from FINE, a finer table (a quarter knot by 1°) of
 * the cubic blend, worked out the first time each of its points is asked for and read straight-line between them. Its
 * corners are a fifth as far apart as the coarse table's and smaller (at 45°, 6 kt, the slope steps −0.0061 to −0.0033 a
 * degree, where the straight-line blend of the coarse table stepped −0.0084 to −0.0008), too small to make a second peak
 * of her speed made good; and a look is four reads where the cubic itself took sixteen (it's made for every boat
 * several times a step: read in full, the step was 3% slower).
 */
export function driveCurveFor(tws: number, twa: number, vt: number): (v: number) => number {
  if (vt <= 0.05) return () => 1;
  const w = (clamp(tws, 2, 40) - 2) * 4, a = clamp(twa, 30, 180) - 30, s = 20 / vt;
  const i = Math.min(Math.floor(w), FW - 2), j = Math.min(Math.floor(a), FA - 2), fw = w - i, fa = a - j;
  const k00 = (1 - fw) * (1 - fa), k01 = (1 - fw) * fa, k10 = fw * (1 - fa), k11 = fw * fa;
  const r00 = (i * FA + j) * 32, r01 = r00 + 32, r10 = r00 + FA * 32, r11 = r10 + 32;
  return (v: number) => {
    const x = clamp(v * s, 0, 29.999), q = Math.floor(x), f = x - q;
    return (k00 * fine(r00, q) + k01 * fine(r01, q) + k10 * fine(r10, q) + k11 * fine(r11, q)) * (1 - f)
      + (k00 * fine(r00, q + 1) + k01 * fine(r01, q + 1) + k10 * fine(r10, q + 1) + k11 * fine(r11, q + 1)) * f;
  };
}
/** The fine table's size: 2–40 kt by quarters, 30–180° by degrees. */
const FW = 153, FA = 151;
const FINE = new Float32Array(FW * FA * 32); // (3 MB, filled as asked for: single precision, a part in ten million, is far finer than the table)
/** One point of the fine table (r: its row's start, q: the speed's twentieth): cached, else the cubic blend there. */
function fine(r: number, q: number): number {
  const k = FINE[r + q];
  if (k !== 0) return k;
  const ij = r / 32, i = Math.floor(ij / FA), j = ij - i * FA;
  FINE[r + q] = cubicBlend(2 + i / 4, 30 + j, q);
  return FINE[r + q]; // (as stored, rounded to single precision: the same whoever asked first)
}
/** The coarse table blended by Catmull-Rom at a wind and an angle, at a speed's twentieth q. */
export function cubicBlend(tws: number, twa: number, q: number): number {
  const w = clamp(tws, 2, 40), a = clamp(twa, 30, 180) / 5, w0 = Math.floor(w), a0 = Math.floor(a);
  cubic(w - w0, W); cubic(a - a0, WA);
  const b0 = clamp(w0 - 1, 2, 40) * 2048 + q, b1 = w0 * 2048 + q, b2 = Math.min(w0 + 1, 40) * 2048 + q, b3 = Math.min(w0 + 2, 40) * 2048 + q;
  const c0 = Math.max(a0 - 1, 6) * 32, c1 = a0 * 32, c2 = Math.min(a0 + 1, 36) * 32, c3 = Math.min(a0 + 2, 36) * 32;
  const A0 = WA[0], A1 = WA[1], A2 = WA[2], A3 = WA[3];
  return W[0] * line(b0, c0, c1, c2, c3, A0, A1, A2, A3) + W[1] * line(b1, c0, c1, c2, c3, A0, A1, A2, A3) + W[2] * line(b2, c0, c1, c2, c3, A0, A1, A2, A3) + W[3] * line(b3, c0, c1, c2, c3, A0, A1, A2, A3);
}
/** One wind's row of the blend at one speed: its four angles, weighed. */
function line(b: number, c0: number, c1: number, c2: number, c3: number, A0: number, A1: number, A2: number, A3: number): number {
  return A0 * at(b + c0) + A1 * at(b + c1) + A2 * at(b + c2) + A3 * at(b + c3);
}
/** One table entry by its index: cached, else worked out. */
function at(i: number): number {
  const k = cache[i];
  return k !== 0 ? k : fill(i - (i & 31), i & 31);
}
function fill(r: number, q: number): number {
  // (r is (w·64 + a/5)·32: w ≤ 40, a/5 ≤ 36, q ≤ 30, each in its own field, no two conditions share a key)
  const w = Math.floor(r / 2048), a = (r / 32 - w * 64) * 5;
  const vt = polarSpeed(w, a), d1 = sailDrive(w, a, vt);
  // (at least a tenth: a sail model that turns the drive negative at some broad angle at speed mustn't stall the boat)
  const k = d1 > 1 ? clamp(sailDrive(w, a, q / 20 * vt) / d1, 0.1, 3) : 1;
  cache[r + q] = k;
  return k;
}
