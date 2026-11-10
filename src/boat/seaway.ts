import { D2R, KT, wrap } from '../core/math';
import type { SeaHere } from '../environment/sea';
import { HULL, drive, hullResistance } from './dynamics';
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
export const C_AW = 0.045;

/** Added resistance (N) in waves of height H (m) and period T (s) meeting the bow at `enc` deg (0 head-on, 180 from astern), at speed v (m/s). */
export function addedResistance(H: number, T: number, enc: number, v: number): number {
  if (H < 0.01) return 0;
  const lambda = G * T * T / (2 * Math.PI), r = lambda / LWL;
  const len = Math.exp(-((Math.log(r / 1.2)) ** 2) / (2 * 0.6 * 0.6)); // worst at about a boat-length
  const head = 0.05 + 0.95 * Math.pow((1 + Math.cos(enc * D2R)) / 2, 1.3);
  return C_AW * RHO * G * H * H * BEAM * BEAM / LWL * len * head * (0.4 + 0.6 * Math.min(1, v / 2.5));
}

/** Added resistance from the whole sea (chop from the wind's direction, swell from its own) for heading h, at speed v. */
export function seaDrag(s: SeaHere, h: number, v: number): number {
  return addedResistance(s.hsW, s.tpW, Math.abs(wrap(s.fromW - h)), v) + addedResistance(s.hsS, s.tpS, Math.abs(wrap(s.fromS - h)), v);
}

/** Steady speed (m/s) when the sails would drive her at `vt` in flat water and the sea adds `drag(v)` newtons. */
export function steadySpeed(vt: number, drag: (v: number) => number): number {
  if (vt <= 0) return 0;
  let lo = 0, hi = vt;
  for (let i = 0; i < 30; i++) { const v = (lo + hi) / 2; if (drive(v, vt) > hullResistance(v) + drag(v)) lo = v; else hi = v; }
  return (lo + hi) / 2;
}

/** Target speed (m/s) for wind `kt` at true wind angle `twa`, in chop of height `hs` and period `tp` coming from the wind's direction. */
export function speedInChop(kt: number, twa: number, hs: number, tp: number): number {
  const vt = polar(kt, twa);
  return hs < 0.01 ? vt : steadySpeed(vt, v => addedResistance(hs, tp, twa, v));
}

const beatCache = new Map<string, number>();
/** Best upwind VMG angle (true) in chop: wider than in flat water, by how much the chop punishes pinching. */
export function beatInChop(kt: number, hs: number, tp: number): number {
  const key = `${Math.round(kt * 4)}:${Math.round(hs * 50)}:${Math.round(tp * 10)}`;
  let a = beatCache.get(key);
  if (a === undefined) {
    let best = 40, bestV = -1;
    for (let t = 30; t <= 65; t += 0.5) { const v = speedInChop(kt, t, hs, tp) * Math.cos(t * D2R); if (v > bestV) { bestV = v; best = t; } }
    a = best;
    if (beatCache.size > 20000) beatCache.clear();
    beatCache.set(key, a);
  }
  return a;
}

/**
 * Yaw the sea puts into her heading (deg/s) at time t: a wave-by-wave push, worst with the sea on the
 * quarter and next to nothing head-on or dead astern. Deterministic (the same race replays the same).
 */
export function waveYaw(s: SeaHere, h: number, v: number, t: number, seed: number): number {
  const one = (H: number, T: number, from: number, ph: number) => {
    if (H < 0.03) return 0;
    const enc = Math.abs(wrap(from - h)) * D2R, k = 2 * Math.PI / (G * T * T / (2 * Math.PI));
    const we = Math.abs(2 * Math.PI / T + k * v * Math.cos(enc)) + 0.3; // encounter frequency
    const side = Math.sin(enc) ** 2 * (0.5 + 0.5 * (1 - Math.cos(enc)) / 2); // on the quarter most
    return 7 * H * side * (Math.sin(we * t + ph) + 0.5 * Math.sin(1.7 * we * t + 2 * ph));
  };
  return one(s.hsW, s.tpW, s.fromW, seed * 1.7) + one(s.hsS, s.tpS, s.fromS, seed * 2.9 + 1);
}

/** Speed lost to the sea (fraction), for messages. */
export const chopLoss = (kt: number, twa: number, hs: number, tp: number) => 1 - speedInChop(kt, twa, hs, tp) / Math.max(1e-6, polar(kt, twa));
export const KNOTS = (v: number) => v / KT;

/** This boat's best upwind angle (true) in the chop she's in. */
export const beatFor = (b: { ww: { kt: number }; sea: SeaHere }): number => b.sea.hsW < 0.02 ? beatAngleCalm(b.ww.kt) : beatInChop(b.ww.kt, b.sea.hsW, b.sea.tpW);
/** This boat's target speed (m/s) at a true wind angle, in the chop she's in (the swell barely matters). */
export const targetFor = (b: { ww: { kt: number }; sea: SeaHere }, twa: number): number => speedInChop(b.ww.kt, twa, b.sea.hsW, b.sea.tpW);
