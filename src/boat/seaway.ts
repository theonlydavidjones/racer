import { D2R, KT, wrap } from '../core/math';
import type { SeaHere } from '../environment/sea';
import { HULL, driveFrom, hullResistance, type DriveCurve } from './dynamics';
import { driveCurveFor } from './driveCurve';
import { beatAngle as beatAngleCalm, polar } from './polar';

/**
 * What waves do to a Folkboat.
 *
 * Added resistance: a boat driving into waves pitches and heaves, and the energy that goes into the waves
 * she makes doing it is drag. It scales as ρ·g·H²·B²/L (the standard form, from Gerritsma–Beukelman and
 * its descendants), is worst when the waves are about a boat-length long (she can't ride over them and
 * pitches hardest), worst head-on, and small from astern. The boat settles where the sails' drive meets
 * calm-water drag plus this. A slower boat (pinching) loses a bigger share of her speed to the same added
 * drag, so in a seaway it pays to sail a little lower and keep her going: footing beats pinching. In flat
 * water it's the other way. Calibrated so 2 ft (0.6 m) of boat-length chop costs a Folkboat about 12%
 * of her upwind speed: a judgement, not a measurement.
 *
 * Waves also push her bow around: the yaw is worst with the sea on the quarter, which is why steering
 * downwind in a seaway takes work.
 */

const RHO = 1025, G = 9.81, BEAM = 2.21, LWL = HULL.length;
/** Added-resistance coefficient (dimensionless): the calibration knob. */
export const C_AW = 0.034; // (0.045 with the old flat ×1.6 drive at rest; 0.034 since the drive's shape comes from the sail model, driveCurve.ts, which upwind gives a slowed boat less push: the same 12%)

/** Added resistance (N) in waves of height H (m) and period T (s) meeting the bow at `enc` deg (0 head-on, 180 from astern), at speed v (m/s). */
export function addedResistance(H: number, T: number, enc: number, v: number): number {
  if (H < 0.01) return 0;
  return awAt(H, T, enc) * awSpeed(v);
}
/** The part of addedResistance that doesn't depend on her speed (H ≥ 0.01): worked out once for a search over speed. */
function awAt(H: number, T: number, enc: number): number {
  const lambda = G * T * T / (2 * Math.PI), r = lambda / LWL;
  const len = Math.exp(-((Math.log(r / 1.2)) ** 2) / (2 * 0.6 * 0.6)); // worst at about a boat-length
  const head = 0.05 + 0.95 * Math.pow((1 + Math.cos(enc * D2R)) / 2, 1.3);
  return C_AW * RHO * G * H * H * BEAM * BEAM / LWL * len * head;
}
/** ... and how it grows with her speed (slow, she pitches less into each wave). */
const awSpeed = (v: number): number => 0.4 + 0.6 * Math.min(1, v / 2.5);

/** Added resistance from the whole sea (chop from the wind's direction, swell from its own) for heading h, at speed v. */
export function seaDrag(s: SeaHere, h: number, v: number): number {
  return addedResistance(s.hsW, s.tpW, Math.abs(wrap(s.fromW - h)), v) + addedResistance(s.hsS, s.tpS, Math.abs(wrap(s.fromS - h)), v)
    + (s.wake ? addedResistance(s.wake.h, s.wake.t, Math.abs(wrap(s.wake.from - h)), v) : 0);
}

/** Steady speed (m/s) when the sails would drive her at `vt` in flat water and the sea adds `drag(v)` newtons. */
export function steadySpeed(vt: number, drag: (v: number) => number, k?: DriveCurve): number {
  if (vt <= 0) return 0;
  const rvt = hullResistance(vt), f = (v: number) => driveFrom(rvt, v, vt, k) - hullResistance(v) - drag(v);
  // (the one crossing between rest and vt, by false position with the Illinois step: to 1 ppm of vt in a handful of
  // looks where bisection took 30; it's asked for every boat in the sea, every step)
  let a = 0, fa = f(0), c = vt, fc = f(c), side = 0;
  if (fc >= 0) return vt;
  if (fa <= 0) return 0;
  for (let i = 0; i < 40; i++) {
    const m = (a * fc - c * fa) / (fc - fa), fm = f(m);
    if (Math.abs(c - a) < 1e-6 * vt || Math.abs(fm) < 1e-7 * rvt) return m;
    if (fm > 0) { a = m; fa = fm; if (side === 1) fc /= 2; side = 1; } else { c = m; fc = fm; if (side === -1) fa /= 2; side = -1; }
  }
  return (a + c) / 2;
}

/** Target speed (m/s) for wind `kt` at true wind angle `twa`, in chop of height `hs` and period `tp` coming from the wind's direction. */
export function speedInChop(kt: number, twa: number, hs: number, tp: number): number {
  const vt = polar(kt, twa);
  if (hs < 0.01) return vt;
  // (the AI asks again with the same numbers several times a step: the last few answers kept, exactly as worked out)
  for (let i = 0; i < CHOP_MEMO; i++) { const m = chopMemo[i]; if (m.kt === kt && m.twa === twa && m.hs === hs && m.tp === tp) return m.v; }
  const k = awAt(hs, tp, twa);
  const v = steadySpeed(vt, u => k * awSpeed(u), driveCurveFor(kt, twa, vt)); // (addedResistance(hs, tp, twa, v), its fixed part worked out once; slowed by the sea, the sails' drive as the apparent wind then gives it)
  const m = chopMemo[chopNext]; chopNext = (chopNext + 1) % CHOP_MEMO;
  m.kt = kt; m.twa = twa; m.hs = hs; m.tp = tp; m.v = v;
  return v;
}
const CHOP_MEMO = 16, chopMemo = Array.from({ length: CHOP_MEMO }, () => ({ kt: NaN, twa: NaN, hs: NaN, tp: NaN, v: 0 }));
let chopNext = 0;

function beatSearch(kt: number, hs: number, tp: number): number {
  let best = 40, bestV = -1;
  for (let t = 30; t <= 65; t += 0.5) { const v = speedInChop(kt, t, hs, tp) * Math.cos(t * D2R); if (v > bestV) { bestV = v; best = t; } }
  return best;
}
const beatCache = new Map<number, number>();
/** Best upwind VMG angle (true) in chop: wider than in flat water, by how much the chop punishes pinching. */
export function beatInChop(kt: number, hs: number, tp: number): number {
  // (a number for the key, each rounded value in its own field: kt·4 < 4096, hs·50 and tp·10 < 2^20; no string per look)
  if (!Number.isFinite(kt + hs + tp)) return beatSearch(kt, hs, tp); // (no key for a NaN: worked out, not cached)
  const k4 = Math.round(kt * 4), h50 = Math.round(hs * 50), t10 = Math.round(tp * 10), key = (k4 * 1048576 + h50) * 1048576 + t10;
  let a = beatCache.get(key);
  if (a === undefined) {
    // (worked out from the rounded values the key holds, not the first caller's exact ones: otherwise the angle cached
    // for everyone after depends on which boat, in which World, asked first, and the same seed sails a different race)
    a = beatSearch(k4 / 4, h50 / 50, t10 / 10);
    if (beatCache.size > 20000) beatCache.clear();
    beatCache.set(key, a);
  }
  return a;
}

/**
 * Yaw the sea puts into her heading (deg/s) at time t: a wave-by-wave push. The yaw moment a wave puts on a slender hull
 * is the sway force along her length (the wave's pressure difference across her, Froude–Krylov: ρ·g·ζ·k·sin β per
 * metre of side, fading with depth as e^(−kT)) times its lever about her middle. A wave meets her bow and stern in
 * different phases, so integrated over her length, ∫ x·sin(ωt − k·x·cos β) dx, the moment goes as
 * 2(sin q − q·cos q)/a², a = k·cos β, q = a·L/2 (strip theory: Faltinsen, Sea Loads on Ships and Offshore Structures,
 * 1990, ch. 3; Newman, Marine Hydrodynamics, §6.17). That is nothing head-on, beam-on or dead astern, most with the sea
 * on the bow or the quarter, and next to nothing in a long swell (as k² once the wave is much longer than she is): a
 * 13 s ocean swell, 260 m long, lifts her whole and barely turns her; a boat-length chop on the quarter slews her about.
 * Its size is kept where the sim had it for a boat-length chop on the quarter (about 3.2°/s per metre of wave height, peaks to 4.9:
 * a judgement, not a measurement: she has no yaw inertia while sailing, so the moment is felt as a rate). Deterministic
 * (the same race replays the same).
 */
const YAW_DEPTH = 0.6; // (m: the mean depth of her side area, hull and keel, for e^(−kT): about half her 1.2 m draft)
function yawMoment(H: number, k: number, encRad: number): number {
  const a = k * Math.cos(encRad), q = a * LWL / 2;
  // (the length integral, 2(sin q − q cos q)/a², tends to a·L³/12 for a short boat in a long wave)
  const lever = Math.abs(q) < 1e-3 ? a * LWL ** 3 / 12 : 2 * (Math.sin(q) - q * Math.cos(q)) / (a * a);
  return H * k * Math.abs(Math.sin(encRad)) * Math.exp(-k * YAW_DEPTH) * Math.abs(lever);
}
/** The moment for a boat-length wave on the quarter (135°), 1 m high: the scale's reference. */
const YAW_REF = yawMoment(1, 2 * Math.PI / LWL, 135 * D2R);
/** Yaw rate (deg/s) per metre of wave height for that reference wave, as the sim had it (7 × the old 0.463; its peak
 * half as much again with the second harmonic). */
const YAW_RATE = 3.24;
export function waveYaw(s: SeaHere, h: number, v: number, t: number, seed: number): number {
  const one = (H: number, T: number, from: number, ph: number) => {
    if (H < 0.03) return 0;
    const enc = Math.abs(wrap(from - h)) * D2R, k = 2 * Math.PI / (G * T * T / (2 * Math.PI));
    const we = Math.abs(2 * Math.PI / T + k * v * Math.cos(enc)) + 0.3; // encounter frequency
    return YAW_RATE * yawMoment(H, k, enc) / YAW_REF * (Math.sin(we * t + ph) + 0.5 * Math.sin(1.7 * we * t + 2 * ph));
  };
  return one(s.hsW, s.tpW, s.fromW, seed * 1.7) + one(s.hsS, s.tpS, s.fromS, seed * 2.9 + 1) + (s.wake ? 1.6 * one(s.wake.h, s.wake.t, s.wake.from, seed * 4.1 + 2) : 0);
}

/** Speed lost to the sea (fraction), for messages. */
export const chopLoss = (kt: number, twa: number, hs: number, tp: number) => 1 - speedInChop(kt, twa, hs, tp) / Math.max(1e-6, polar(kt, twa));
export const KNOTS = (v: number) => v / KT;

/** This boat's best upwind angle (true) in the chop she's in. */
export const beatFor = (b: { ww: { kt: number }; sea: SeaHere }): number => b.sea.hsW < 0.02 ? beatAngleCalm(b.ww.kt) : beatInChop(b.ww.kt, b.sea.hsW, b.sea.tpW);
/** This boat's target speed (m/s) at a true wind angle, in the chop she's in (the swell barely matters). */
export const targetFor = (b: { ww: { kt: number }; sea: SeaHere }, twa: number): number => speedInChop(b.ww.kt, twa, b.sea.hsW, b.sea.tpW);
