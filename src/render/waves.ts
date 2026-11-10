import { D2R, type Vec } from '../core/math';
import type { SeaHere } from '../environment/sea';

/**
 * The waves you see: a sum of Gerstner waves built from the sea state, the same on the GPU (the water
 * surface) and on the CPU (how the boats heave, pitch and roll). Seven wind-sea components at fixed
 * wavelengths from 2 to 19 m, spread ±30° about the wind, with heights from the JONSWAP spectrum for the
 * chop where you are; three swell components around the swell's period, from the swell's direction.
 * Fixed wavelengths mean the pattern never jumps as the sea changes: only the heights move. How big the
 * waves are elsewhere on the water comes from a sea map (wind-sea and swell scale per place).
 */

const G = 9.81;
export const N_WAVES = 10;
const WIND_L = [2.2, 3.2, 4.6, 6.6, 9.5, 13.5, 19];
const WIND_SPREAD = [-28, 17, -9, 24, 4, -16, 11];
const SWELL_F = [0.8, 1, 1.25]; // × the swell's wavelength
const SWELL_SPREAD = [-8, 0, 6];
const PHASES = [0.3, 2.1, 4.4, 1.2, 5.6, 3.3, 0.8, 2.7, 5.1, 1.9];

export interface WaveComp { dir: number; k: number; w: number; amp: number; phase: number; q: number; swell: boolean }

/** JONSWAP spectral density (shape only) at frequency f for peak period tp. */
function jonswap(f: number, tp: number): number {
  const fp = 1 / tp, s = f <= fp ? 0.07 : 0.09, r = Math.exp(-((f - fp) ** 2) / (2 * s * s * fp * fp));
  return Math.pow(f, -5) * Math.exp(-1.25 * Math.pow(fp / f, 4)) * Math.pow(3.3, r);
}

export class WaveSet {
  readonly comps: WaveComp[] = [];
  /** The sea the component heights are set for (the reference the sea map scales from). */
  ref = { hsW: 0, hsS: 0 };
  private windDir = NaN;
  private swellL = 150;

  constructor() {
    WIND_L.forEach((L, i) => { const k = 2 * Math.PI / L; this.comps.push({ dir: 0, k, w: Math.sqrt(G * k), amp: 0, phase: PHASES[i], q: 0, swell: false }); });
    SWELL_F.forEach((_, i) => this.comps.push({ dir: 0, k: 1, w: 1, amp: 0, phase: PHASES[7 + i], q: 0, swell: true }));
  }

  /** Set the swell's period (fixed for a race: it comes from the buoy record for the day). */
  setSwellPeriod(tp: number): void {
    this.swellL = G * tp * tp / (2 * Math.PI);
    this.comps.filter(c => c.swell).forEach((c, i) => { c.k = 2 * Math.PI / (this.swellL * SWELL_F[i]); c.w = Math.sqrt(G * c.k); });
  }

  /**
   * Ease the component heights toward the sea at the focus (`s`), the chop running downwind of `windFrom`
   * (the course's mean wind, so the pattern doesn't swing with every shift).
   */
  update(s: SeaHere, windFrom: number, dt: number): void {
    const travel = windFrom + 180;
    if (Number.isNaN(this.windDir)) this.windDir = travel;
    this.windDir += (((travel - this.windDir + 540) % 360) - 180) * Math.min(1, dt * 0.05);
    const ease = Math.min(1, dt * 0.5);
    // wind sea: heights shaped by the spectrum, scaled so the sum has the right significant height
    const hsW = s.hsW, tp = Math.max(1, s.tpW);
    const raw = WIND_L.map((L, i) => {
      const f = Math.sqrt(G / (2 * Math.PI * L)), f0 = Math.sqrt(G / (2 * Math.PI * (WIND_L[i + 1] ?? L * 1.4))), f1 = Math.sqrt(G / (2 * Math.PI * (WIND_L[i - 1] ?? L / 1.4)));
      return jonswap(f, tp) * (f1 - f0) / 2;
    });
    const tot = raw.reduce((a, b) => a + b, 0) || 1;
    this.comps.slice(0, 7).forEach((c, i) => {
      const target = Math.sqrt(2 * raw[i] / tot) * hsW / 4; // Σ a²/2 = (Hs/4)²
      c.amp += (target - c.amp) * ease;
      c.dir = this.windDir + WIND_SPREAD[i];
      c.q = 0.55; // sharpen the crests of the chop
    });
    const hsS = s.hsS;
    this.comps.slice(7).forEach((c, i) => {
      const target = (i === 1 ? 0.75 : 0.47) * hsS / 4 * Math.SQRT2;
      c.amp += (target - c.amp) * ease; c.dir = s.fromS + 180 + SWELL_SPREAD[i]; c.q = 0.3;
    });
    this.ref.hsW += (hsW - this.ref.hsW) * ease; this.ref.hsS += (hsS - this.ref.hsS) * ease;
  }

  /** Sea surface height (m) at a point (sim coords) at time t, with the local scale of wind sea and swell. */
  height(p: Vec, t: number, kW: number, kS: number): number {
    let h = 0;
    for (const c of this.comps) {
      if (c.amp <= 0) continue;
      const dx = Math.sin(c.dir * D2R), dy = Math.cos(c.dir * D2R);
      h += c.amp * (c.swell ? kS : kW) * Math.sin(c.k * (dx * p.x + dy * p.y) - c.w * t + c.phase);
    }
    return h;
  }

  /** Uniform arrays for the water shader: (dir x, dir y, k, amp) and (ω, phase, Q, swell?). */
  pack(a: Float32Array, b: Float32Array): void {
    this.comps.forEach((c, i) => {
      a[i * 4] = Math.sin(c.dir * D2R); a[i * 4 + 1] = Math.cos(c.dir * D2R); a[i * 4 + 2] = c.k; a[i * 4 + 3] = c.amp;
      b[i * 4] = c.w; b[i * 4 + 1] = c.phase; b[i * 4 + 2] = c.q; b[i * 4 + 3] = c.swell ? 1 : 0;
    });
  }
}

/** How a boat sits on the waves: heave (m), pitch (bow up, rad) and roll (to starboard, rad), from the surface under her. */
export function boatOnWaves(ws: WaveSet, p: Vec, h: number, t: number, kW: number, kS: number): { heave: number; pitch: number; roll: number } {
  const f = { x: Math.sin(h * D2R), y: Math.cos(h * D2R) }, s = { x: f.y, y: -f.x }; // forward, starboard
  const at = (a: number, b: number) => ws.height({ x: p.x + f.x * a + s.x * b, y: p.y + f.y * a + s.y * b }, t, kW, kS);
  // a 6 m waterline and 2.2 m beam average out the shortest waves, as a real hull does
  const bow = at(2.6, 0), stern = at(-2.6, 0), port = at(0, -0.9), stbd = at(0, 0.9), mid = at(0, 0);
  return { heave: 0.25 * (bow + stern + port + stbd) * 0.8 + 0.2 * mid, pitch: Math.atan2(bow - stern, 5.2) * 0.8, roll: Math.atan2(port - stbd, 1.8) * 0.5 };
}

/** The GLSL for the same waves: declarations, and the displacement and slope sums. */
export const WAVE_GLSL = /* glsl */`
uniform vec4 uWaveA[${N_WAVES}];
uniform vec4 uWaveB[${N_WAVES}];
uniform float uTime;
// p: sim coords (x east, y north); kW, kS: local scale; fade: 0 far .. 1 near (per wavelength)
vec3 waveDisp(vec2 p, float kW, float kS, float dist) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < ${N_WAVES}; i++) {
    vec4 A = uWaveA[i], B = uWaveB[i];
    float L = 6.2832 / A.z, fade = 1.0 - smoothstep(L * 25.0, L * 70.0, dist);
    float a = A.w * mix(kW, kS, B.w) * fade;
    float th = A.z * dot(A.xy, p) - B.x * uTime + B.y;
    d.xy += B.z * a * A.xy * cos(th);
    d.z += a * sin(th);
  }
  return d;
}
// surface slope (dh/dx, dh/dy) and height, all wavelengths, each faded out where it gets smaller than a pixel
vec3 waveSlope(vec2 p, float kW, float kS, float dist) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < ${N_WAVES}; i++) {
    vec4 A = uWaveA[i], B = uWaveB[i];
    float L = 6.2832 / A.z, fade = 1.0 - smoothstep(L * 60.0, L * 220.0, dist);
    float a = A.w * mix(kW, kS, B.w) * fade;
    float th = A.z * dot(A.xy, p) - B.x * uTime + B.y;
    s.xy += a * A.z * A.xy * cos(th);
    s.z += a * sin(th);
  }
  return s;
}
`;

/** A water mesh centred on the camera: fine near the middle (about 1.3 m), coarse far out, 60 km to each edge. */
export function waterGrid(): { pos: Float32Array; index: Uint32Array } {
  const N = 256, R = 60000, b = 7.8, c = (t: number) => Math.sign(t) * R * (Math.exp(b * Math.abs(t)) - 1) / (Math.exp(b) - 1);
  const xs = Array.from({ length: N + 1 }, (_, i) => c(-1 + 2 * i / N));
  const pos = new Float32Array((N + 1) * (N + 1) * 3), index = new Uint32Array(N * N * 6);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = (j * (N + 1) + i) * 3; pos[k] = xs[i]; pos[k + 1] = 0; pos[k + 2] = xs[j]; }
  let n = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, bb = a + 1, cc = a + N + 1, d = cc + 1; index.set([a, cc, bb, bb, cc, d], n); n += 6; }
  return { pos, index };
}
