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
 * course's angle (the polar's), upright. Cached by the knot, 5° of angle and a twentieth of the speed ratio.
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

/** Drive at speed v over drive at the polar's speed vt (both m/s), for tws kt at the course's angle twa. 1 at v = vt. */
export function driveRatio(tws: number, twa: number, v: number, vt: number): number {
  if (vt <= 0.05) return 1;
  const w = Math.round(clamp(tws, 2, 40)), a = Math.round(clamp(twa, 30, 180) / 5) * 5, x = clamp(v / vt * 20, 0, 29.999), q = Math.floor(x), f = x - q;
  return at(w, a, q) * (1 - f) + at(w, a, q + 1) * f;
}
/**
 * driveRatio as a curve for one wind, angle and polar speed: the rounding and the row worked out once, so each look is
 * a multiply and two reads of the table (the AI's predictions step a speed along it hundreds of times).
 */
export function driveCurveFor(tws: number, twa: number, vt: number): (v: number) => number {
  if (vt <= 0.05) return () => 1;
  const w = Math.round(clamp(tws, 2, 40)), a = Math.round(clamp(twa, 30, 180) / 5) * 5, row = (w * 64 + a / 5) * 32, s = 20 / vt;
  return (v: number) => {
    const x = clamp(v * s, 0, 29.999), q = Math.floor(x), f = x - q;
    let k0 = cache[row + q], k1 = cache[row + q + 1];
    if (k0 === 0) k0 = at(w, a, q);
    if (k1 === 0) k1 = at(w, a, q + 1);
    return k0 * (1 - f) + k1 * f;
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
