import { KT, clamp, V, type Vec } from '../core/math';
import type { Rng } from '../core/rng';
import data from './data/sf-wind-shifts.json';
import { OPEN_WATER, type WindKind } from './wind';

/**
 * The wind's shifts: how its direction and strength wander over minutes to hours, as Fort Point's 6-minute record
 * shows them on each kind of day (scripts/fit-wind-shifts.mjs: the structure function over the racing hours since
 * 2021, fitted as two Ornstein–Uhlenbeck processes, the oscillating shifts of several minutes, T1 = 8 min, and the
 * persistent ones that last a race, T2 = 120 min). On a 10–15 kt westerly that's about 6.5° and 8.5° (an rms change of
 * 13.5° over half an hour at the station, with its own quick turbulence); on a 6–10 kt day about twice that.
 *
 * The shifts are carried down the course with the wind (Taylor's frozen-turbulence hypothesis: G. I. Taylor, Proc. R.
 * Soc. A 164, 1938), so the boat to windward gets a header before the boat to leeward, as you see it come down the
 * course; and they vary across the wind as well as along it, so one side of the course can be lifted while the other
 * is headed. The field is a sum of waves with random phases (the spectral method: Shinozuka & Deodatis, Appl. Mech.
 * Rev. 44, 1991) whose frequencies are drawn from each process's spectrum, S(ω) ∝ T / (1 + (ωT)²), so at a fixed
 * point it has exactly that autocorrelation, e^(−τ/T), on average; each wave's crests lie at a random angle to the wind,
 * up to 60° either way, and travel downwind at the wind's speed. Quicker than about two minutes is the puffs' and the
 * turbulence's (wind.ts), not this.
 *
 * Deterministic: built from the race's own seed, and a pure function of where and of how far the air has travelled.
 */

interface Cls { kt: number; days: number; dir: number[]; spd: number[] }
const CLASSES = (data as unknown as { classes: Record<WindKind, Cls[]>; T: [number, number] }).classes;
export const SHIFT_T: [number, number] = (data as unknown as { T: [number, number] }).T;

/** The shifts' sizes for a kind of day at an open-water mean speed (kt): direction (deg) and speed (share of the mean), each [σ1, σ2]. */
export function shiftStats(kind: WindKind, openKt: number): { dir: [number, number]; spd: [number, number] } {
  const cs = CLASSES[kind] ?? CLASSES.west, kt = openKt / OPEN_WATER; // (the classes are by the station's mean)
  // (between the classes' mean speeds, a straight line; beyond them, the nearest)
  let a = cs[0], b = cs[0], f = 0;
  if (kt >= cs[cs.length - 1].kt) a = b = cs[cs.length - 1];
  else if (kt > cs[0].kt) for (let i = 1; i < cs.length; i++) if (kt <= cs[i].kt) { a = cs[i - 1]; b = cs[i]; f = (kt - a.kt) / (b.kt - a.kt); break; }
  const mix = (x: number[], y: number[], i: number) => x[i] + (y[i] - x[i]) * f;
  return { dir: [mix(a.dir, b.dir, 1), mix(a.dir, b.dir, 2)], spd: [mix(a.spd, b.spd, 1), mix(a.spd, b.spd, 2)] };
}

/** Waves per process: enough that the field looks like noise rather than a few sine waves. */
const WAVES = 24;
/** The quickest shift the field carries: 2 minutes (quicker is the puffs' and turbulence's). */
const QUICKEST = 2 * 60;

interface Wave { kx: number; ky: number; ph: number; a: number }

export class ShiftField {
  private dirW: Wave[] = [];
  private spdW: Wave[] = [];
  /** How far the air has travelled downwind since the start (m): the field moves with it. */
  travelled = 0;
  private ux: number; private uy: number;
  /**
   * `from`: the direction the field is carried from (the day's mean at the gun) and `ms` its speed then (m/s), which
   * sets the waves' lengths; `ref`: a point on the course, the origin of the field's waves; sizes from shiftStats.
   */
  constructor(rng: Rng, from: number, ms: number, private ref: Vec, stats: { dir: [number, number]; spd: [number, number] }) {
    const U0 = Math.max(1, ms);
    const d = V(from + 180); this.ux = d.x; this.uy = d.y;
    const make = (sig: [number, number], out: Wave[]) => SHIFT_T.forEach((Tmin, j) => {
      const T = Tmin * 60, s = sig[j]; if (!(s > 0)) return;
      // (frequencies by the inverse of the Lorentzian's distribution, cut at the quickest: ω = tan(u·atan(ωmax·T)) / T)
      const top = Math.atan(2 * Math.PI / QUICKEST * T);
      for (let i = 0; i < WAVES; i++) {
        const w = Math.tan(top * (i + rng()) / WAVES) / T, ang = (rng() * 2 - 1) * Math.PI / 3;
        // (crests passing a fixed point at ω in the gun's wind: k·cos(ang)·U0 = ω; in a fresher breeze they pass quicker)
        const k = w / (U0 * Math.cos(ang));
        out.push({ kx: k * Math.cos(ang), ky: k * Math.sin(ang), ph: rng() * 2 * Math.PI, a: s * Math.SQRT2 / Math.sqrt(WAVES) });
      }
    });
    make(stats.dir, this.dirW); make(stats.spd, this.spdW);
  }
  /** The air moves on downwind at `ms` (m/s) for `dt` s. */
  step(dt: number, ms: number): void { this.travelled += Math.max(0.5, ms) * dt; }
  /**
   * The shift at p now: the turn of the direction (deg, + veered) and the factor on the speed. The waves are frozen in
   * the air, which has moved `travelled` metres downwind: a point `s` m downwind sees the same shift s/U later.
   */
  at(p: Vec): { turn: number; k: number } {
    const dx = p.x - this.ref.x, dy = p.y - this.ref.y;
    const along = dx * this.ux + dy * this.uy - this.travelled, across = dx * this.uy - dy * this.ux;
    const sum = (ws: Wave[]) => { let v = 0; for (const q of ws) v += q.a * Math.sin(q.kx * along + q.ky * across + q.ph); return v; };
    return { turn: sum(this.dirW), k: clamp(1 + sum(this.spdW), 0.2, 2.5) };
  }
}

/** Metres per second, from knots. */
export const msOf = (kt: number) => kt * KT;
