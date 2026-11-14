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
/**
 * The table's rows (up to 16) that a wind and an angle read, and each one's weight, into rows/ws/ks; returns how many.
 * Points beyond the table's edge (2 and 40 kt, 30° and 180°) are its edge repeated. A point with no weight is left out:
 * on a whole knot and a whole 5°, the one row.
 */
function taps(tws: number, twa: number, rows: Int32Array, ks: Float64Array): number {
  const w = clamp(tws, 2, 40), a = clamp(twa, 30, 180) / 5;
  const w0 = Math.floor(w), a0 = Math.floor(a);
  cubic(w - w0, W); cubic(a - a0, WA);
  let n = 0;
  for (let i = 0; i < 4; i++) {
    if (W[i] === 0) continue;
    const wi = clamp(w0 + i - 1, 2, 40);
    for (let j = 0; j < 4; j++) {
      const k = W[i] * WA[j];
      if (k === 0) continue;
      const aj = clamp(a0 + j - 1, 6, 36);
      rows[n] = (wi * 64 + aj) * 32; ks[n] = k; n++;
    }
  }
  return n;
}
const ROWS = new Int32Array(16), KS = new Float64Array(16);
/** Drive at speed v over drive at the polar's speed vt (both m/s), for tws kt at the course's angle twa. 1 at v = vt. */
export function driveRatio(tws: number, twa: number, v: number, vt: number): number {
  if (vt <= 0.05) return 1;
  const n = taps(tws, twa, ROWS, KS), x = clamp(v / vt * 20, 0, 29.999), q = Math.floor(x), f = x - q;
  let s0 = 0, s1 = 0;
  for (let i = 0; i < n; i++) { s0 += KS[i] * row(ROWS[i], q); s1 += KS[i] * row(ROWS[i], q + 1); }
  return s0 * (1 - f) + s1 * f;
}
/**
 * driveRatio as a curve for one wind, angle and polar speed: the rows and their weights worked out once, and each
 * look a few multiplies and reads (the AI's predictions step a speed along it hundreds of times).
 */
export function driveCurveFor(tws: number, twa: number, vt: number): (v: number) => number {
  if (vt <= 0.05) return () => 1;
  const n = taps(tws, twa, ROWS, KS), rows = ROWS.slice(0, n), ks = KS.slice(0, n), s = 20 / vt;
  const col = (q: number) => { let t = 0; for (let i = 0; i < n; i++) t += ks[i] * row(rows[i], q); return t; };
  return (v: number) => {
    const x = clamp(v * s, 0, 29.999), q = Math.floor(x), f = x - q;
    return col(q) * (1 - f) + col(q + 1) * f;
  };
}
/** One table entry by its row's base and the speed's twentieth: cached, else worked out. */
function row(r: number, q: number): number {
  const k = cache[r + q];
  return k !== 0 ? k : fill(r, q);
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
