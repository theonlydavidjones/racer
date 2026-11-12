import { V, type Vec } from '../core/math';
import type { Rng } from '../core/rng';

/**
 * Gusts: the wind's turbulence, the seconds-to-a-minute gusting a boat feels in her heel and her helm.
 *
 * Over open water in a neutral wind the turbulence is set by the sea's roughness. The wind at 10 m follows the log law,
 * U = (u∗/κ)·ln(z/z0), with the sea's roughness length from Charnock's relation, z0 = α·u∗²/g (Charnock 1955; α = 0.011
 * over the open sea: Smith, J. Geophys. Res. 93(C12), 1988); and the gusts along the wind are σu = 2.5·u∗ (Kaimal &
 * Finnigan, Atmospheric Boundary Layer Flows, 1994; Panofsky & Dutton give 2.39), so the turbulence intensity
 * σu/U = 1/ln(z/z0): 0.081 at 10 m in 12 kt, 0.09 in 25 kt. Across the wind σv = 0.8·σu (IEC 61400-1, the Kaimal model). Their size: the integral length
 * scale along the wind, 8.1·Λ1 with Λ1 = 0.7·z (IEC 61400-1, Kaimal): 57 m at 10 m. Fort Point's record (NOAA 9414290,
 * its 5-second gusts against its 2-minute means) reads about 2.4 times that intensity, its air coming over the Presidio
 * and the bridge's anchorage, not open water; and its gusts keep their size in knots as the wind falls (3.75–4.75 kt
 * over the mean at 4–6 kt, about 6 kt from 8 to 18 kt), so in light air they don't die away with the mean: here a floor
 * of 0.35 m/s on σu. A judgement: the station's light-air σu (gust over mean / a peak factor of about 2.2) scaled by
 * open water's intensity against the station's in a breeze (2.4×); the ratio isn't the same at every strength, and light
 * air over the Bay's cold water is often stable, not convective, so the floor is an estimate.
 *
 * The field is frozen in the air and carried with it (Taylor's hypothesis), a sum of waves with random phases whose
 * wavenumbers along the wind follow the von Kármán spectrum F(k) ∝ (1 + (1.339·L·k)²)^(−5/6), at random angles across
 * it (up to 45° either way), so a gust you see coming down the course arrives. Only eddies shorter than about 90 s of the
 * wind's travel: the minute-scale structures are the puffs' (wind.ts Puffs), so the field carries its spectrum's share
 * above that, not all of σu (the puffs carry the rest). Deterministic: its own seeded random
 * numbers, and a pure function of where and how far the air has moved.
 */
export const GUSTS = { kappa: 0.4, charnock: 0.011, z: 10, L: 8.1 * 0.7 * 10, sigmaFloor: 0.35, vOverU: 0.8 };

/** Turbulence intensity σu/U over open water for a 10 m wind of U m/s (the log law with Charnock's roughness). */
export function seaTI(U: number): number {
  const { kappa, charnock, z } = GUSTS;
  let us = U * kappa / Math.log(z / 2e-4); // (u∗ by iteration: z0 depends on it)
  for (let i = 0; i < 8; i++) { const z0 = Math.max(1e-6, charnock * us * us / 9.81); us = U * kappa / Math.log(z / z0); }
  const z0 = Math.max(1e-6, charnock * us * us / 9.81);
  return 1 / Math.log(z / z0);
}
/** σu (m/s) over open water for a 10 m wind of U m/s: the intensity's, or the light-air floor. (Tabled every 0.05 m/s
 * to 40 m/s and interpolated: it's asked for every boat, every step.) */
const SIG_STEP = 0.05, SIG = Float64Array.from({ length: 801 }, (_, i) => Math.max(seaTI(Math.max(0.05, i * SIG_STEP)) * i * SIG_STEP, GUSTS.sigmaFloor));
export const sigmaU = (U: number) => {
  const x = Math.max(0, U) / SIG_STEP, i = Math.min(SIG.length - 2, Math.floor(x)), f = Math.min(1, x - i);
  return SIG[i] + (SIG[i + 1] - SIG[i]) * f;
};

const WAVES = 16;
interface Wave { kx: number; ky: number; ph: number }

export class GustField {
  private uW: Wave[] = [];
  private vW: Wave[] = [];
  /** How far the air has moved (m, east and north). */
  moved = { x: 0, y: 0 };
  /** `from`: the wind's direction when it's laid out (the crests' lie); its waves are frozen in the air. */
  /** The share of σu² the field carries: its spectrum above the puffs' wavelengths. */
  readonly share: number;
  /** `ms`: the wind's speed when it's laid out (m/s), for the wavelength the puffs take over at (90 s of its travel). */
  constructor(rng: Rng, from: number, ms = 6) {
    const down = V(from + 180), across = { x: down.y, y: -down.x }, L = GUSTS.L, kCut = 2 * Math.PI / (Math.max(1, ms) * 90);
    // (wavenumbers along the wind by the inverse of the von Kármán spectrum's distribution, tabulated: k from 1/(50 L)
    // to the smallest eddy that matters to a 7.6 m boat, about 2π/8 m)
    const ks: number[] = [], cdf: number[] = [];
    let acc = 0;
    for (let i = 0; i <= 400; i++) {
      const k = Math.exp(Math.log(1 / (50 * L)) + (Math.log(2 * Math.PI / 8) - Math.log(1 / (50 * L))) * i / 400);
      const dk = i ? k - ks[i - 1] : 0;
      acc += Math.pow(1 + (1.339 * L * k) ** 2, -5 / 6) * dk;
      ks.push(k); cdf.push(acc);
    }
    // (from the puffs' cut up: the share of the spectrum's variance kept, and the pick among it)
    let i0 = 0; while (i0 < ks.length - 1 && ks[i0] < kCut) i0++;
    const lo = cdf[i0]; this.share = (acc - lo) / acc;
    const pick = (u: number) => { const t = lo + u * (acc - lo); let i = i0 + 1; while (i < cdf.length - 1 && cdf[i] < t) i++; return ks[i]; };
    const make = (out: Wave[]) => {
      for (let i = 0; i < WAVES; i++) {
        const k1 = pick((i + rng()) / WAVES), ang = (rng() * 2 - 1) * Math.PI / 4, k2 = k1 * Math.tan(ang);
        out.push({ kx: k1 * down.x + k2 * across.x, ky: k1 * down.y + k2 * across.y, ph: rng() * 2 * Math.PI });
      }
    };
    make(this.uW); make(this.vW);
  }
  /** The air moves on with the wind, from `from` at `ms` m/s, for `dt` s. */
  step(dt: number, ms: number, from: number): void { const d = V(from + 180), u = Math.max(0.3, ms) * dt; this.moved.x += d.x * u; this.moved.y += d.y * u; }
  /**
   * The gust at p, in units of σ: along the wind (+ stronger) and across it (+ veering the wind), each with variance
   * `share` (the field's part of σu²). Scale by sigmaU for the wind there.
   */
  at(p: Vec): { u: number; v: number } {
    const x = p.x - this.moved.x, y = p.y - this.moved.y, a = Math.sqrt(2 * this.share / WAVES);
    let u = 0, v = 0;
    for (const q of this.uW) u += Math.cos(q.kx * x + q.ky * y + q.ph);
    for (const q of this.vW) v += Math.cos(q.kx * x + q.ky * y + q.ph);
    return { u: u * a, v: v * a };
  }
}
