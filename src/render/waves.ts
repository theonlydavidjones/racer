import { D2R, type Vec } from '../core/math';
import type { SeaHere } from '../environment/sea';

/**
 * The waves you see: a sum of Gerstner waves built from the sea state, the same on the GPU (the water
 * surface) and on the CPU (how the boats heave, pitch and roll). Twelve wind-sea components at fixed
 * wavelengths from 1.6 to 24 m (geometric steps), heights from the JONSWAP spectrum for the chop where you are,
 * and directions sampled from the cos^2s spreading of a young wind sea (s ≈ 8: most energy within ±30° of the
 * wind, a little out to ±60°), with irregular phases. Neighbouring wavelengths travel at different angles, so
 * the crests are short and broken (short-crested, as a real wind sea is) rather than long parallel rows. Three
 * swell components around the swell's period, from the swell's direction. Fixed wavelengths mean the pattern
 * never jumps as the sea changes: only the heights move. How big the waves are elsewhere on the water comes from
 * a sea map (wind-sea and swell scale per place).
 * (Spreading: Mitsuyasu et al. 1975, s ≈ 5–15 near the spectral peak for wind seas; Holthuijsen, Waves in
 * Oceanic and Coastal Waters, ch. 6.)
 */

const G = 9.81;
export const N_WAVES = 15;
const N_WIND = 12;
const WIND_L = Array.from({ length: N_WIND }, (_, i) => 1.6 * Math.pow(24 / 1.6, i / (N_WIND - 1)));
// directions: the twelve quantiles of a cos^2s(θ/2) spread with s = 8 (close to a normal spread of σ ≈ 27°: ±3, 9, 15,
// 22, 31, 47°), dealt out left and right of the wind so no two neighbours run within 10° of each other; the widest
// on the shortest waves (measured spreads widen away from the peak), the band round the usual peak (5–15 m on the
// Bay) still spread ±22°, so its crests stay short rather than lining up in rows
const WIND_SPREAD = [-47, 31, -31, 47, -9, 22, -15, 9, -22, 3, 15, -3];
const SWELL_F = [0.8, 1, 1.25]; // × the swell's wavelength
const SWELL_SPREAD = [-8, 0, 6];
const PHASES = [0.3, 2.1, 4.4, 1.2, 5.6, 3.3, 0.8, 2.7, 5.1, 1.9, 3.9, 0.1, 4.8, 2.4, 5.9];

export interface WaveComp { dir: number; k: number; w: number; amp: number; phase: number; q: number; swell: boolean; /** (sin, cos of dir, kept for the dir they were worked out for: height() is asked thousands of times a frame) */ sd?: number; cd?: number; at?: number }

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
    SWELL_F.forEach((_, i) => this.comps.push({ dir: 0, k: 1, w: 1, amp: 0, phase: PHASES[N_WIND + i], q: 0, swell: true }));
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
    this.comps.slice(0, N_WIND).forEach((c, i) => {
      const target = Math.sqrt(2 * raw[i] / tot) * hsW / 4; // Σ a²/2 = (Hs/4)²
      c.amp += (target - c.amp) * ease;
      c.dir = this.windDir + WIND_SPREAD[i];
      c.q = 0.45; // sharpen the crests of the chop (less with more components, so the sum never loops)
    });
    const hsS = s.hsS;
    this.comps.slice(N_WIND).forEach((c, i) => {
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
      if (c.at !== c.dir) { c.sd = Math.sin(c.dir * D2R); c.cd = Math.cos(c.dir * D2R); c.at = c.dir; }
      const dx = c.sd!, dy = c.cd!;
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

/** The water mesh: N cells a side, R m to each edge, spacing growing as exp(b·|t|). */
const GRID_N = 256, GRID_R = 60000, GRID_B = 7.8;
/** Its spacing at a distance d from the middle is GRID_DS · (d + GRID_D0) (from the derivative of the mapping below). */
const GRID_DS = 2 * GRID_B / GRID_N, GRID_D0 = GRID_R / (Math.exp(GRID_B) - 1);

/** The GLSL for the same waves: declarations, and the displacement and slope sums. */
export const WAVE_GLSL = /* glsl */`
uniform vec4 uWaveA[${N_WAVES}];
uniform vec4 uWaveB[${N_WAVES}];
uniform float uTime;
// p: sim coords (x east, y north); kW, kS: local scale; dist: from the camera (m)
// A wave moves the mesh only where the mesh is fine enough to draw it (the grid spacing at that distance is under a
// third of its wavelength): finer waves are left to the shading, or they alias into rings round the camera.
vec3 waveDisp(vec2 p, float kW, float kS, float dist) {
  vec3 d = vec3(0.0);
  float grid = ${GRID_DS.toFixed(5)} * (dist + ${GRID_D0.toFixed(2)}); // the water mesh's spacing here (waterGrid)
  for (int i = 0; i < ${N_WAVES}; i++) {
    vec4 A = uWaveA[i], B = uWaveB[i];
    float L = 6.2832 / A.z, fade = 1.0 - smoothstep(L * 0.18, L * 0.33, grid);
    float a = A.w * mix(kW, kS, B.w) * fade;
    float th = A.z * dot(A.xy, p) - B.x * uTime + B.y;
    d.xy += B.z * a * A.xy * cos(th);
    d.z += a * sin(th);
  }
  return d;
}
// surface slope (dh/dx, dh/dy) and height, all wavelengths, each faded out where it gets smaller than the patch of
// water one pixel covers (foot, m: long at a glancing angle), so the far water doesn't shimmer with aliased crests.
// For the light only, each wind-sea component also comes in groups: its height swells and fades over a few
// wavelengths, as in a real sea (wave groups: the sum of neighbouring frequencies beating), so the crests don't run
// on in endless even rows. (The boats ride the plain sum, waveDisp.)
float wgHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float wgNoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wgHash(i), wgHash(i + vec2(1.0, 0.0)), f.x), mix(wgHash(i + vec2(0.0, 1.0)), wgHash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 waveSlope(vec2 p, float kW, float kS, float foot) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < ${N_WAVES}; i++) {
    vec4 A = uWaveA[i], B = uWaveB[i];
    float L = 6.2832 / A.z, fade = 1.0 - smoothstep(L * 0.25, L * 0.7, foot);
    // the group envelope: elongated across the wave's travel, moving at the group speed (half the phase speed)
    vec2 along = A.xy, across = vec2(-A.y, A.x);
    float env = B.w > 0.5 ? 1.0 : 0.25 + 1.5 * wgNoise(vec2(dot(p, along) - 0.5 * B.x / A.z * uTime, dot(p, across) * 0.4) / (L * 4.0) + float(i) * 7.31);
    float a = A.w * mix(kW, kS, B.w) * fade * env;
    float th = A.z * dot(A.xy, p) - B.x * uTime + B.y;
    s.xy += a * A.z * A.xy * cos(th);
    s.z += a * sin(th);
  }
  return s;
}
`;

/** A water mesh centred on the camera: fine near the middle (about 1.5 m), coarse far out, 60 km to each edge. */
export function waterGrid(): { pos: Float32Array; index: Uint32Array } {
  const N = GRID_N, R = GRID_R, b = GRID_B, c = (t: number) => Math.sign(t) * R * (Math.exp(b * Math.abs(t)) - 1) / (Math.exp(b) - 1);
  const xs = Array.from({ length: N + 1 }, (_, i) => c(-1 + 2 * i / N));
  const pos = new Float32Array((N + 1) * (N + 1) * 3), index = new Uint32Array(N * N * 6);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = (j * (N + 1) + i) * 3; pos[k] = xs[i]; pos[k + 1] = 0; pos[k + 2] = xs[j]; }
  let n = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, bb = a + 1, cc = a + N + 1, d = cc + 1; index.set([a, cc, bb, bb, cc, d], n); n += 6; }
  return { pos, index };
}
