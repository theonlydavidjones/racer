import type { Vec } from '../core/math';
import { N_WAVES, type WaveField } from '../environment/waveField';

/**
 * The waves you see: the World's wave field (environment/waveField.ts), the same one the boats' heave and pitch come
 * from (boat/seaway.ts waveMotion), drawn as Gerstner waves on the GPU (the water surface, below).
 */
export { N_WAVES } from '../environment/waveField';

/**
 * Uniform arrays for the water shader: (dir x, dir y, k, amp) and (ω, phase at the origin `o` now, Q, swell?).
 * The phase k·(d·p) − ωt + φ is worked out here, in double precision, at a local origin `o` near the camera (its
 * k·(d·o) − ωt + φ, wrapped to one turn), so the shader adds only k·(d·(p − o)): small numbers. Out at South Beach
 * (6 km from the sim's origin) after an hour, the full phase of the shortest wave is ~50,000 rad, where float32 keeps
 * a few thousandths of a radian and a GPU's sin() isn't promised to be accurate at all.
 */
export function packWaves(f: WaveField, a: Float32Array, b: Float32Array, t: number, o: Vec): void {
  for (let i = 0; i < N_WAVES; i++) {
    a[i * 4] = f.sd[i]; a[i * 4 + 1] = f.cd[i]; a[i * 4 + 2] = f.k[i]; a[i * 4 + 3] = f.amp[i];
    const th = f.k[i] * (f.sd[i] * o.x + f.cd[i] * o.y) - f.w[i] * t + f.phase[i];
    b[i * 4] = f.w[i]; b[i * 4 + 1] = th - 2 * Math.PI * Math.floor(th / (2 * Math.PI)); b[i * 4 + 2] = f.q[i]; b[i * 4 + 3] = f.swell[i];
  }
}

/**
 * How a hull with no motion of its own sits on the waves (the ghost of an earlier run: its track has no heave or pitch):
 * heave (m), pitch (bow up, rad) and roll (to starboard, rad) from the surface under her. The boats themselves ride on
 * their own heave and pitch (Boat.heave, Boat.pitch).
 */
export function boatOnWaves(f: WaveField, p: Vec, h: number, t: number, kW: number, kS: number): { heave: number; pitch: number; roll: number } {
  const D = Math.PI / 180, fw = { x: Math.sin(h * D), y: Math.cos(h * D) }, s = { x: fw.y, y: -fw.x }; // forward, starboard
  const at = (a: number, b: number) => f.height({ x: p.x + fw.x * a + s.x * b, y: p.y + fw.y * a + s.y * b }, t, kW, kS);
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
uniform vec2 uWaveO; // the local origin the phases in uWaveB are for (packWaves)
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
    float th = A.z * dot(A.xy, p - uWaveO) + B.y;
    d.xy += B.z * a * A.xy * cos(th);
    d.z += a * sin(th);
  }
  return d;
}
// surface slope (dh/dx, dh/dy) and height, all wavelengths, each faded out where it gets smaller than the patch of
// water one pixel covers (foot, m: long at a glancing angle), so the far water doesn't shimmer with aliased crests.
// For the light only, each wind-sea component also comes in groups: its height swells and fades over a few
// wavelengths, as in a real sea (wave groups: the sum of neighboring frequencies beating), so the crests don't run
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
    float th = A.z * dot(A.xy, p - uWaveO) + B.y;
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
