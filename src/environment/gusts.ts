import { V, type Vec } from '../core/math';
import type { Rng } from '../core/rng';

/**
 * Gusts: the wind's turbulence, the seconds-to-a-minute gusting a boat feels in her heel and her helm.
 *
 * Over open water in a neutral wind the turbulence is set by the sea's roughness. The wind at 10 m follows the log law,
 * U = (u∗/κ)·ln(z/z0), with the sea's roughness length from Charnock's relation, z0 = α·u∗²/g (Charnock 1955; α = 0.011
 * over the open sea, as in Larsén et al., Wind Energ. Sci. 2026's offshore atlas); and the gusts along the wind are
 * σu = 2.5·u∗ (Panofsky & Dutton, Atmospheric Turbulence, 1984), so the turbulence intensity σu/U = 1/ln(z/z0): about
 * 0.09 at 10 m in 12 kt. Across the wind σv = 0.8·σu (IEC 61400-1, the Kaimal model). Their size: the integral length
 * scale along the wind, 8.1·Λ1 with Λ1 = 0.7·z (IEC 61400-1, Kaimal): 57 m at 10 m. Fort Point's record (NOAA 9414290,
 * its 5-second gusts against its 2-minute means) reads about 2.4 times that intensity, its air coming over the Presidio
 * and the bridge's anchorage, not open water; and its gusts keep their size in knots as the wind falls (3.75–4.75 kt
 * over the mean at 4–6 kt, about 6 kt from 8 to 18 kt), so in light air they don't die away with the mean: here a floor
 * of 0.35 m/s on σu, the station's light-air σu (gust over mean / a peak factor of about 2.2) scaled by open water's
 * intensity against the station's.
 *
 * The field is frozen in the air and carried with it (Taylor's hypothesis), a sum of waves with random phases whose
 * wavenumbers along the wind follow the von Kármán spectrum F(k) ∝ (1 + (1.339·L·k)²)^(−5/6), at random angles across
 * it (up to 45° either way), so a gust you see coming down the course arrives. Deterministic: its own seeded random
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
/** σu (m/s) over open water for a 10 m wind of U m/s: the intensity's, or the light-air floor. */
export const sigmaU = (U: number) => Math.max(seaTI(U) * U, GUSTS.sigmaFloor);

const WAVES = 64;
interface Wave { kx: number; ky: number; ph: number }

export class GustField {
  private uW: Wave[] = [];
  private vW: Wave[] = [];
  /** How far the air has moved (m, east and north). */
  moved = { x: 0, y: 0 };
  /** `from`: the wind's direction when it's laid out (the crests' lie); its waves are frozen in the air. */
  constructor(rng: Rng, from: number) {
    const down = V(from + 180), across = { x: down.y, y: -down.x }, L = GUSTS.L;
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
    const pick = (u: number) => { const t = u * acc; let i = 1; while (i < cdf.length - 1 && cdf[i] < t) i++; return ks[i]; };
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
   * The gust at p, in units of σ: along the wind (+ stronger) and across it (+ from the right of downwind, veering the
   * wind), each with unit variance. Scale by sigmaU for the wind there.
   */
  at(p: Vec): { u: number; v: number } {
    const x = p.x - this.moved.x, y = p.y - this.moved.y, a = Math.SQRT2 / Math.sqrt(WAVES);
    let u = 0, v = 0;
    for (const q of this.uW) u += Math.cos(q.kx * x + q.ky * y + q.ph);
    for (const q of this.vW) v += Math.cos(q.kx * x + q.ky * y + q.ph);
    return { u: u * a, v: v * a };
  }
}
