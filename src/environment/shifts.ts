import { KT, clamp, V, type Vec } from '../core/math';
import type { Rng } from '../core/rng';
import data from './data/sf-wind-shifts.json';
import { OPEN_WATER, type WindKind } from './wind';

/**
 * The wind's shifts: how its direction and strength wander over minutes to hours, as Fort Point's 6-minute record
 * shows them on each kind of day (scripts/fit-wind-shifts.mjs: the structure function over the racing hours since
 * 2021, fitted as two Ornstein–Uhlenbeck processes, the oscillating shifts of several minutes, T1 = 8 min, and the
 * persistent ones that last a race, their time scales fitted too). On a 10–15 kt westerly the direction changes by about
 * 13° rms over half an hour at the station (with its own quick turbulence); on a 6–10 kt day about 21°.
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
 * The lie of the crests across the wind (up to 60° either way, uniformly) is an assumption: nothing measured on the Bay
 * sets how alike the two sides of a course are. Deterministic: built from the race's own seed, and a pure function of
 * where and of how far the air has moved.
 */

interface Cls { kt: number; days: number; dir: number[]; dirT: number[]; spd: number[]; spdT: number[] }
const CLASSES = (data as unknown as { classes: Record<WindKind, Cls[]> }).classes;

/** One Ornstein–Uhlenbeck process: its size σ and its time scale T (min). */
export interface ShiftPart { s: number; T: number }
export interface ShiftStats { dir: ShiftPart[]; spd: ShiftPart[] }
/**
 * The shifts' sizes and time scales for a kind of day at an open-water mean speed (kt): direction (deg) and speed (share
 * of the mean), each the several-minute and the persistent part. (Between the classes' mean speeds, a straight line in
 * each; beyond them, the nearest.)
 */
export function shiftStats(kind: WindKind, openKt: number): ShiftStats {
  const cs = CLASSES[kind] ?? CLASSES.west, kt = openKt / OPEN_WATER; // (the classes are by the station's mean)
  let a = cs[0], b = cs[0], f = 0;
  if (kt >= cs[cs.length - 1].kt) a = b = cs[cs.length - 1];
  else if (kt > cs[0].kt) for (let i = 1; i < cs.length; i++) if (kt <= cs[i].kt) { a = cs[i - 1]; b = cs[i]; f = (kt - a.kt) / (b.kt - a.kt); break; }
  const mix = (x: number, y: number) => x + (y - x) * f;
  const parts = (sa: number[], ta: number[], sb: number[], tb: number[]) => [0, 1].map(j => ({ s: mix(sa[j + 1], sb[j + 1]), T: mix(ta[j], tb[j]) }));
  return { dir: parts(a.dir, a.dirT, b.dir, b.dirT), spd: parts(a.spd, a.spdT, b.spd, b.spdT) };
}

/** Waves per process: enough that the field looks like noise rather than a few sine waves. */
const WAVES = 24;
/** The quickest shift the field carries: 2 minutes (quicker is the puffs' and turbulence's). */
const QUICKEST = 2 * 60;

interface Wave { kx: number; ky: number; ph: number; a: number }

export class ShiftField {
  private dirW: Wave[] = [];
  private spdW: Wave[] = [];
  /** How far the air has moved since the start (m, east and north): the field moves with it. */
  moved = { x: 0, y: 0 };
  /** The field where the course was laid, when it was laid: the shifts are counted from there (zero()). */
  private zeroAt = { turn: 0, k: 0 };
  /**
   * `from`: the direction of the day's mean wind at the gun and `ms` its speed then (m/s), which set the waves' lengths
   * and lie; `ref`: where the course is laid, the origin of the field (the shifts there start at nothing: the committee
   * sets the course to the wind it has); sizes and time scales from shiftStats.
   */
  constructor(rng: Rng, from: number, ms: number, private ref: Vec, stats: ShiftStats) {
    const U0 = Math.max(1, ms), down = V(from + 180), across = { x: down.y, y: -down.x };
    const make = (parts: ShiftPart[], out: Wave[]) => parts.forEach(({ s, T: Tmin }) => {
      const T = Tmin * 60; if (!(s > 0) || !(T > 0)) return;
      // (frequencies by the inverse of the Lorentzian's distribution, cut at the quickest: ω = tan(u·atan(ωmax·T)) / T)
      const top = Math.atan(2 * Math.PI / QUICKEST * T);
      for (let i = 0; i < WAVES; i++) {
        const w = Math.tan(top * (i + rng()) / WAVES) / T, ang = (rng() * 2 - 1) * Math.PI / 3;
        // (crests passing a fixed point at ω in the gun's wind: k·cos(ang)·U0 = ω; in a fresher breeze they pass quicker;
        // the crests lie at `ang` to the wind's lie at the gun, fixed in the water's frame)
        const k = w / (U0 * Math.cos(ang)), ka = k * Math.cos(ang), kc = k * Math.sin(ang);
        out.push({ kx: ka * down.x + kc * across.x, ky: ka * down.y + kc * across.y, ph: rng() * 2 * Math.PI, a: s * Math.SQRT2 / Math.sqrt(WAVES) });
      }
    });
    make(stats.dir, this.dirW); make(stats.spd, this.spdW);
    this.zeroAt = this.raw(ref);
  }
  /** The air moves on downwind at `ms` (m/s) for `dt` s, the wind now from `from`: the field drifts with it. */
  step(dt: number, ms: number, from: number): void { const d = V(from + 180), u = Math.max(0.5, ms) * dt; this.moved.x += d.x * u; this.moved.y += d.y * u; }
  private raw(p: Vec): { turn: number; k: number } {
    const x = p.x - this.ref.x - this.moved.x, y = p.y - this.ref.y - this.moved.y;
    const sum = (ws: Wave[]) => { let v = 0; for (const q of ws) v += q.a * Math.sin(q.kx * x + q.ky * y + q.ph); return v; };
    return { turn: sum(this.dirW), k: sum(this.spdW) };
  }
  /**
   * The shift at p now, since the course was laid: the turn of the direction (deg, + veered) and the factor on the speed.
   * The waves are frozen in the air, which has moved on with the wind: a point `s` m downwind sees the same shift s/U
   * later. (Counted from the start, the shift since then has the record's statistics, D(t − t0), which is what Fort
   * Point's structure function measures.)
   */
  at(p: Vec): { turn: number; k: number } {
    const r = this.raw(p);
    return { turn: r.turn - this.zeroAt.turn, k: clamp(1 + r.k - this.zeroAt.k, 0.2, 2.5) };
  }
}

/** Metres per second, from knots. */
export const msOf = (kt: number) => kt * KT;
