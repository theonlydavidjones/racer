import { D2R, type Vec } from '../core/math';
import type { SeaHere } from './sea';

/**
 * The waves on the water: one field, the same for the boats' motions (boat/seaway.ts) and the water you see
 * (render/waves.ts). A sum of wave components built from the sea state:
 * - Twelve wind-sea components at fixed wavelengths from 1.6 to 24 m (geometric steps). Their heights come from the
 *   JONSWAP spectrum (Hasselmann et al. 1973, γ = 3.3) for the chop's peak period. Their directions come from the
 *   cos^2s spreading of a young wind sea (s ≈ 8: most energy within ±30° of the wind, a little out to ±60°; Mitsuyasu
 *   et al. 1975, s ≈ 5–15 near the spectral peak; Holthuijsen, Waves in Oceanic and Coastal Waters, ch. 6), with
 *   irregular phases. Neighbouring wavelengths travel at different angles, so the crests are short and broken, as a
 *   real wind sea's are, not long parallel rows.
 * - Three swell components around the swell's period, from the swell's direction.
 * Fixed wavelengths mean the pattern never jumps as the sea changes: only the heights move. How big the waves are
 * elsewhere on the water scales from this field's reference sea, by the sea there (SeaHere), as a sea map does.
 *
 * It belongs to the World and steps with it, on the race's clock, so the race (in its worker) and the page's mirror
 * hold the same field (sim/sync.ts) and every boat rides the waves you see. The reference sea is the World's (World.waveRef:
 * the course's middle in a race, so the fleet's waves don't depend on where your boat is), eased in; the field turns with
 * the course's mean wind about your boat (so turning it doesn't sweep the pattern past you: the turn's slow, 5% of the
 * difference a second, so a boat a few hundred metres off sees her waves' phase run a little fast or slow for a while).
 * All of it is the World's own state, not the camera's.
 */

const G = 9.81;
export const N_WAVES = 15;
export const N_WIND = 12;
const WIND_L = Array.from({ length: N_WIND }, (_, i) => 1.6 * Math.pow(24 / 1.6, i / (N_WIND - 1)));
// directions: the twelve quantiles of a cos^2s(θ/2) spread with s = 8 (close to a normal spread of σ ≈ 27°: ±3, 9, 15,
// 22, 31, 47°), dealt out left and right of the wind so no two neighbours run within 10° of each other; the widest
// on the shortest waves (measured spreads widen away from the peak), the band round the usual peak (5–15 m on the
// Bay) still spread ±22°, so its crests stay short rather than lining up in rows
const WIND_SPREAD = [-47, 31, -31, 47, -9, 22, -15, 9, -22, 3, 15, -3];
const SWELL_F = [0.8, 1, 1.25]; // × the swell's wavelength
const SWELL_SPREAD = [-8, 0, 6];
const PHASES = [0.3, 2.1, 4.4, 1.2, 5.6, 3.3, 0.8, 2.7, 5.1, 1.9, 3.9, 0.1, 4.8, 2.4, 5.9];

/** JONSWAP spectral density (shape only) at frequency f for peak period tp. */
function jonswap(f: number, tp: number): number {
  const fp = 1 / tp, s = f <= fp ? 0.07 : 0.09, r = Math.exp(-((f - fp) ** 2) / (2 * s * s * fp * fp));
  return Math.pow(f, -5) * Math.exp(-1.25 * Math.pow(fp / f, 4)) * Math.pow(3.3, r);
}

/** The wave time for the World's clock t (s): the waves' own clock, the race's plus a constant (so the pattern at the gun isn't its t = 0). */
export const waveTime = (t: number) => t + 600;

/** Set component i's direction, and its sin and cos with it. */
function setDir(f: WaveField, i: number, dir: number): void { f.dir[i] = dir; f.sd[i] = Math.sin(dir * D2R); f.cd[i] = Math.cos(dir * D2R); }
/** The wind sea's spectrum shares (JONSWAP over each component's band) for one peak period: kept for the last period
 *  asked, as update() asks every step and the period changes only with the sea. The same numbers, worked out once. */
let specTp = NaN, specTot = 1;
const spec = new Float64Array(N_WIND);
function windSpectrum(tp: number): void {
  if (tp === specTp) return;
  let tot = 0;
  for (let i = 0; i < N_WIND; i++) {
    const L = WIND_L[i], f = Math.sqrt(G / (2 * Math.PI * L)), f0 = Math.sqrt(G / (2 * Math.PI * (WIND_L[i + 1] ?? L * 1.4))), f1 = Math.sqrt(G / (2 * Math.PI * (WIND_L[i - 1] ?? L / 1.4)));
    spec[i] = jonswap(f, tp) * (f1 - f0) / 2; tot += spec[i];
  }
  specTot = tot || 1; specTp = tp;
}

export class WaveField {
  /** Per component (wind sea first, then swell): its direction of travel (deg), wavenumber (rad/m), frequency (rad/s), height (m), phase (rad), crest sharpening (Gerstner Q), and 1 for swell. */
  readonly dir = new Float64Array(N_WAVES);
  readonly k = new Float64Array(N_WAVES);
  readonly w = new Float64Array(N_WAVES);
  readonly amp = new Float64Array(N_WAVES);
  readonly phase = new Float64Array(N_WAVES);
  readonly q = new Float64Array(N_WAVES);
  readonly swell = new Float64Array(N_WAVES);
  /** sin and cos of each direction (kept with it: height() is asked thousands of times a frame). */
  readonly sd = new Float64Array(N_WAVES);
  readonly cd = new Float64Array(N_WAVES);
  /** The sea the heights are set for: the reference each place's sea scales them from. */
  refW = 0; refS = 0;
  /** The wind sea's mean direction of travel (deg), easing after the course's mean wind. */
  windDir = NaN;
  /** Set once the heights have been set (the first update sets them; later ones ease toward the sea). */
  primed = false;

  constructor(swellTp = 12) {
    WIND_L.forEach((L, i) => { this.k[i] = 2 * Math.PI / L; this.w[i] = Math.sqrt(G * this.k[i]); this.phase[i] = PHASES[i]; });
    for (let i = N_WIND; i < N_WAVES; i++) { this.swell[i] = 1; this.phase[i] = PHASES[i]; }
    this.setSwellPeriod(swellTp, 0);
    for (let i = 0; i < N_WAVES; i++) setDir(this, i, 0);
  }

  /** Set the swell's period (from the buoy record for the day). At wave time t each component's phase is carried over, so the surface doesn't jump where it is. */
  setSwellPeriod(tp: number, t: number): void {
    const L = G * tp * tp / (2 * Math.PI);
    for (let j = 0; j < SWELL_F.length; j++) {
      const i = N_WIND + j, w0 = this.w[i];
      this.k[i] = 2 * Math.PI / (L * SWELL_F[j]); this.w[i] = Math.sqrt(G * this.k[i]);
      if (w0 > 0) this.phase[i] = (this.phase[i] + (this.w[i] - w0) * t) % (2 * Math.PI);
    }
  }

  /**
   * Ease the heights toward the sea `s` (the reference: the sea at your boat), the chop running downwind of `windFrom`
   * (the course's mean wind, so the pattern doesn't swing with every shift), turning about `about` (your boat).
   * A wave's phase is k·(d·p) − ωt + φ at the world position p; swinging its direction d about the world's origin,
   * kilometres off on the Bay, would sweep the whole pattern past you (at 3.6 km a 10° swing over half a minute ran
   * the water by at many times the waves' own speed: the owner's "the water surface starts rushing by"). So as d turns,
   * φ takes up the change at `about`, and the pattern turns about there.
   */
  update(s: SeaHere, windFrom: number, dt: number, about: Vec): void {
    const turn = (i: number, dir: number) => {
      if (dir === this.dir[i]) return;
      // (the old direction's sine and cosine are the ones setDir kept, sd and cd; the new one's worked out once, for both)
      const a1 = dir * D2R, s1 = Math.sin(a1), c1 = Math.cos(a1);
      this.phase[i] = (this.phase[i] + this.k[i] * ((this.sd[i] - s1) * about.x + (this.cd[i] - c1) * about.y)) % (2 * Math.PI); // (kept small: float32 in the shader)
      this.dir[i] = dir; this.sd[i] = s1; this.cd[i] = c1;
    };
    const travel = windFrom + 180;
    if (Number.isNaN(this.windDir)) this.windDir = travel;
    this.windDir += (((travel - this.windDir + 540) % 360) - 180) * Math.min(1, dt * 0.05);
    const ease = this.primed ? Math.min(1, dt * 0.5) : 1; this.primed = true;
    // (never quite flat: a reference sea in a lee would leave nothing for the rougher water elsewhere to scale up)
    const hsW = Math.max(0.05, s.hsW), hsS = Math.max(0.05, s.hsS);
    // wind sea: heights shaped by the spectrum, scaled so the sum has the right significant height
    const tp = Math.max(1, s.tpW);
    windSpectrum(tp);
    for (let i = 0; i < N_WIND; i++) {
      const target = Math.sqrt(2 * spec[i] / specTot) * hsW / 4; // Σ a²/2 = (Hs/4)²
      this.amp[i] += (target - this.amp[i]) * ease;
      turn(i, this.windDir + WIND_SPREAD[i]);
      this.q[i] = 0.45; // sharpen the crests of the chop (less with more components, so the sum never loops)
    }
    for (let j = 0; j < SWELL_F.length; j++) {
      const i = N_WIND + j, target = (j === 1 ? 0.75 : 0.47) * hsS / 4 * Math.SQRT2;
      this.amp[i] += (target - this.amp[i]) * ease; turn(i, s.fromS + 180 + SWELL_SPREAD[j]); this.q[i] = 0.3;
    }
    this.refW += (hsW - this.refW) * ease; this.refS += (hsS - this.refS) * ease;
  }

  /** How the field scales at a place whose sea is `s`: (wind sea, swell) multipliers on the reference. */
  scaleFor(s: SeaHere): { kW: number; kS: number } {
    return { kW: this.refW > 0.01 ? s.hsW / this.refW : 0, kS: this.refS > 0.01 ? s.hsS / this.refS : 0 };
  }

  /** Sea surface height (m) at a point (sim coords) at wave time t, with the local scale of wind sea and swell. */
  height(p: Vec, t: number, kW: number, kS: number): number {
    let h = 0;
    for (let i = 0; i < N_WAVES; i++) {
      const a = this.amp[i]; if (a <= 0) continue;
      h += a * (this.swell[i] ? kS : kW) * Math.sin(this.k[i] * (this.sd[i] * p.x + this.cd[i] * p.y) - this.w[i] * t + this.phase[i]);
    }
    return h;
  }
}
