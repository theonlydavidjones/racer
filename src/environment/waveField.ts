import { D2R, type Vec } from '../core/math';
import type { SeaHere } from './sea';

/**
 * The waves on the water: one field, the same for the boats' motions (boat/seaway.ts) and the water you see
 * (render/waves.ts). A sum of wave components built from the sea state:
 * - Twelve wind-sea components at fixed frequencies, those of the waves 1.6 to 24 m long in deep water (geometric steps). Their heights come from the
 *   JONSWAP spectrum (Hasselmann et al. 1973, γ = 3.3) for the chop's peak period. Their directions come from the
 *   cos^2s spreading of a young wind sea (s ≈ 8: most energy within ±30° of the wind, a little out to ±60°; Mitsuyasu
 *   et al. 1975, s ≈ 5–15 near the spectral peak; Holthuijsen, Waves in Oceanic and Coastal Waters, ch. 6), with
 *   irregular phases. Neighbouring wavelengths travel at different angles, so the crests are short and broken, as a
 *   real wind sea's are, not long parallel rows.
 * - Three swell components around the swell's period, from the swell's direction.
 * Fixed frequencies mean the pattern never jumps as the sea changes: only the heights move (and the lengths, slowly,
 * with the depth, below). How big the waves are
 * elsewhere on the water scales from this field's reference sea, by the sea there (SeaHere), as a sea map does.
 *
 * It belongs to the World and steps with it, on the race's clock, so the race (in its worker) and the page's mirror
 * hold the same field (sim/sync.ts) and every boat rides the waves you see. The reference sea is the World's (World.waveRef:
 * the course's middle in a race, so the fleet's waves don't depend on where your boat is), eased in; the field turns with
 * the course's mean wind about your boat (so turning it doesn't sweep the pattern past you: the turn's slow, 5% of the
 * difference a second, so a boat a few hundred metres off sees her waves' phase run a little fast or slow for a while).
 * All of it is the World's own state, not the camera's.
 *
 * The depth (setDepth): each component keeps its frequency, and its wavenumber follows the water's depth at the
 * reference place by linear dispersion, ω² = g·k·tanh(k·d) (Airy wave theory: Dean & Dalrymple, Water Wave Mechanics
 * for Engineers and Scientists, ch. 3; Holthuijsen, Waves in Oceanic and Coastal Waters, ch. 5). Inside the Gate the
 * swell is a shallow-water wave: a 14 s swell in 14 m of water is 156 m long and runs at 11.2 m/s (toward √(g·d),
 * 11.7 m/s, the shallow-water limit), not its 306 m and 22 m/s offshore. The chop (2–4 s) shortens by more than 5% only in water under about
 * 1.7 m (2 s), 3.8 m (3 s) or 7 m (4 s): on the flats, not the Central Bay. One depth for the whole field: the sum is
 * of plane waves, so it can't bend crests toward a shoal (true refraction needs a field for each place, ROADMAP).
 */

const G = 9.81;
export const N_WAVES = 15;
export const N_WIND = 12;
/** The most any component's wavenumber changes with the depth, as a fraction a second (update). */
const DLNK = 1e-3;
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

/** The wavenumber (rad/m) of a wave of angular frequency w (rad/s) in water d m deep, by linear dispersion
 * ω² = g·k·tanh(k·d): Newton's method from Eckart's approximation (1952, within about 5%), a few steps to a part in a
 * million. Deep (d = Infinity, or more than half the deep-water wavelength): k = ω²/g. */
export function waveNumber(w: number, d: number): number {
  const k0 = w * w / G;
  if (!(d < Infinity) || k0 * d > 20) return k0;
  const h = Math.max(0.1, d);
  let k = k0 / Math.sqrt(Math.tanh(k0 * h));
  for (let i = 0; i < 8; i++) {
    const t = Math.tanh(k * h), f = G * k * t - w * w, df = G * t + G * k * h * (1 - t * t), dk = f / df;
    k -= dk; if (Math.abs(dk) < 1e-7 * k) break;
  }
  return k;
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
  /** The wind sea's mean direction of travel (deg), easing after the course's mean wind; the swell's, after the reference sea's. */
  windDir = NaN; swellDir = NaN;
  /** Set once the heights have been set (the first update sets them; later ones ease toward the sea). */
  primed = false;
  /** The water's depth the wavenumbers are for (m; Infinity: deep), easing toward depthTo, the reference place's (setDepth). */
  depth = Infinity; depthTo = Infinity;

  constructor(swellTp = 12) {
    // (each wind-sea component's frequency is that of its wavelength in deep water: in shallower water the same
    // frequency is a shorter wave, setDepth)
    WIND_L.forEach((L, i) => { this.k[i] = 2 * Math.PI / L; this.w[i] = Math.sqrt(G * this.k[i]); this.phase[i] = PHASES[i]; });
    for (let i = N_WIND; i < N_WAVES; i++) { this.swell[i] = 1; this.phase[i] = PHASES[i]; }
    this.setSwellPeriod(swellTp, 0);
    for (let i = 0; i < N_WAVES; i++) setDir(this, i, 0);
  }

  /** Set the swell's period (from the buoy record for the day). At wave time t each component's phase is carried over, so the surface doesn't jump where it is. */
  setSwellPeriod(tp: number, t: number, about: Vec = { x: 0, y: 0 }): void {
    const L = G * tp * tp / (2 * Math.PI);
    for (let j = 0; j < SWELL_F.length; j++) {
      const i = N_WIND + j, w0 = this.w[i], k0 = this.k[i];
      this.w[i] = Math.sqrt(G * 2 * Math.PI / (L * SWELL_F[j])); this.k[i] = waveNumber(this.w[i], this.depth);
      // (the surface held where you are, `about`: in time, and for the new wavenumber in place)
      if (w0 > 0) this.phase[i] = (this.phase[i] + (this.w[i] - w0) * t + (k0 - this.k[i]) * (this.sd[i] * about.x + this.cd[i] * about.y)) % (2 * Math.PI);
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
  /** The water's depth at the reference place (m, the chart's below MLLW and the tide's height; null off the chart:
   * deep). The field eases to it (update), so a boat sailing on into shoaler water sees the waves shorten, not jump. */
  setDepth(d: number | null): void { this.depthTo = d == null || Number.isNaN(d) ? Infinity : Math.max(0.3, d); } // (never under 0.3 m: a guard for the arithmetic, not a depth she sails in)

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
    // (the swell eases round as the chop does: a direction that jumped, even turned about `about`, swept the pattern past
    // everywhere else at many times its own speed: the owner's "rushing water", v176)
    const swellTravel = s.fromS + 180;
    if (Number.isNaN(this.swellDir)) this.swellDir = swellTravel;
    this.swellDir += (((swellTravel - this.swellDir + 540) % 360) - 180) * Math.min(1, dt * 0.05);
    const ease = this.primed ? Math.min(1, dt * 0.5) : 1; this.primed = true;
    // the depth: at once on the first update, then slowly: each component's wavenumber for it, and its phase taking up
    // the change at `about`, as for a turn, so the surface there doesn't move. Away from `about` the change runs the
    // pattern by at R·Δk/k a second, R from her: so no wavenumber changes by more than DLNK a second (at 1 km the
    // water then runs by at 1 m/s at most; eased as the turn is it reached 21 m/s, the physics review). Cruising from
    // 14 m to 95 m of water the swell takes some ten minutes to lengthen, as the field stands for the water about her.
    // (deep water, Infinity, eases from 1000 m: there even a 20 s swell is within 1e-8 of its deep-water length)
    const d0 = this.depth, dTo = Math.min(this.depthTo, 1e3), dFrom = Math.min(d0, 1e3);
    let d = dTo;
    if (ease < 1 && dFrom !== dTo) {
      // (the most change of any wavenumber going to depth x; as far toward dTo as keeps it within DLNK·dt, by halving)
      const most = (x: number) => { let m = 0; for (let i = 0; i < N_WAVES; i++) m = Math.max(m, Math.abs(Math.log(waveNumber(this.w[i], x) / this.k[i]))); return m; };
      const may = DLNK * dt;
      if (most(dTo) > may) {
        let lo = Math.log(dFrom), hi = Math.log(dTo);
        for (let n = 0; n < 16; n++) { const mid = (lo + hi) / 2; if (most(Math.exp(mid)) > may) hi = mid; else lo = mid; }
        d = Math.exp(lo);
      }
    }
    if (Math.abs(d - dTo) < 1e-4 * dTo) d = dTo;
    if (d >= 1e3) d = Infinity;
    if (d !== d0) {
      this.depth = d;
      for (let i = 0; i < N_WAVES; i++) {
        const k1 = waveNumber(this.w[i], d);
        this.phase[i] = (this.phase[i] + (this.k[i] - k1) * (this.sd[i] * about.x + this.cd[i] * about.y)) % (2 * Math.PI);
        this.k[i] = k1;
      }
    }
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
      this.amp[i] += (target - this.amp[i]) * ease; turn(i, this.swellDir + SWELL_SPREAD[j]); this.q[i] = 0.3;
    }
    // (in shoal water the same heights on shorter waves are steeper: the crests' sharpening, Σ Q·k·a, kept to what it is
    // in deep water, so the sum doesn't loop (at 0.3 m of water it doubled, the physics review). The heights themselves
    // limited by the depth are sea.ts's, ROADMAP)
    if (this.depth < Infinity) {
      let deep = 0, here = 0; for (let i = 0; i < N_WAVES; i++) { deep += this.q[i] * this.w[i] * this.w[i] / G * this.amp[i]; here += this.q[i] * this.k[i] * this.amp[i]; }
      if (here > deep && here > 0) { const f = deep / here; for (let i = 0; i < N_WAVES; i++) this.q[i] *= f; }
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
