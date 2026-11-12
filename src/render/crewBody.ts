import './three-setup';
import * as THREE from 'three';
import type { Person } from '../boat/crewPhys';

/**
 * A sailor's body: one skinned mesh on eleven bones (hips, spine, head, shoulders, elbows, hips, knees), so a person is
 * one draw call however they're posed (tests/perf.test.ts and scripts/check/perf.cjs: draw calls in every view).
 * Proportions from body-segment lengths as fractions of height (Winter, Biomechanics and Motor Control of Human
 * Movement, fig. 4.1, after Drillis & Contini): thigh 0.245 H, shank 0.246 H, upper arm 0.186 H, forearm 0.146 H,
 * shoulder width 0.259 H, hip width 0.191 H; built for 1.75 m and scaled to the person.
 *
 * Dressed for racing on the Bay, garment by garment (the owner's choice of look, proposals crew-art 1 and 2, November
 * 2026): a foul-weather jacket zipped to the chin, salopettes with reinforced knees, sea boots, gloves, a life jacket (an
 * inflatable's lobes and harness, or a foam vest), and a cap, a knit beanie or the jacket's hood up over a cap, with
 * wraparound sunglasses. How it's built, and why (four earlier rounds of looks were rejected as uncanny):
 * - Every garment is its own surface with its own vertices, so a colour ends exactly at the garment's edge, the way
 *   cloth does (colour painted per vertex on one continuous body smears across every triangle that straddles two
 *   garments). Each takes its colour and roughness from a small palette texture, one texel per material: wet nylon
 *   shines, a knit beanie and skin don't.
 * - Normals are smooth within a garment and hard between garments: cloth, not facets.
 * - Eyewear, peaks, collars and the hood are geometry standing off the face, not marks painted on it: they catch the
 *   sun, cast shadow and keep their shape from the side.
 * - Skin colours are chosen for the sim's own light (render/scene.ts: a blue-white sky light, a dark sea-teal ground
 *   light and a warm sun; colour used as-is with no tone mapping), which lifts a face turned to the sky by about 1.4
 *   and cools the shade side: albedos a little warmer than the tones they're meant to read as.
 * - The neck is short and hidden in the collar, the head a smooth egg of a real head's size, the face plain: no eyes or
 *   mouth drawn, the eyes behind sunglasses, the brow under a peak, a beanie's cuff or a hood.
 * - The body under the clothes is shaped from cross-section profiles: thighs wider than knees, calves, the forearm's
 *   swell, a chest, waist and hips, shoulders sloping to the neck; loose cloth hangs in soft folds at the hems.
 */

/** Bone lengths (m at 1.75 m tall): hip to knee, knee to ankle, shoulder to elbow, elbow to wrist (Winter, above). */
export const BONE = { thigh: 0.43, shin: 0.43, upper: 0.30, fore: 0.255, shoulderY: 0.47, hipX: 0.095, shoulderX: 0.2, headY: 0.57 };

export interface Limb { root: THREE.Object3D; mid: THREE.Object3D }
export interface Body { root: THREE.Group; torso: THREE.Bone; head: THREE.Bone; arm: [Limb, Limb]; leg: [Limb, Limb]; scale: number; mesh: THREE.SkinnedMesh }

type V3 = THREE.Vector3;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Bone indices, in the skeleton's order (below). */
const HIPS = 0, SPINE = 1, HEAD = 2, SH = [3, 5], EL = [4, 6], HP = [7, 9], KN = [8, 10];
type W = [number, number][];
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const blend = (a: number, b: number, t: number): W => t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]];
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

// ———————————————————————————— materials: one palette texel each ————————————————————————————

/** A material: its colour (as-is, the sim's r128 colour handling) and how rough (1 matte … 0.1 glossy). */
interface Mat { c: number; r: number }
const PAL_W = 32;

/** The geometry being built: positions, palette slot, skin weights and a shade (a darkening for the inside of a collar,
 * a cuff or a hood, where little light gets in). */
class Mesh {
  P: number[] = []; UV: number[] = []; SI: number[] = []; SW: number[] = []; C: number[] = []; I: number[] = [];
  mats: Mat[] = [];
  slot(m: Mat): number { const i = this.mats.findIndex(q => q.c === m.c && q.r === m.r); if (i >= 0) return i; this.mats.push(m); return this.mats.length - 1; }
  vert(p: V3, slot: number, w: W, shade = 1): number {
    const n = this.P.length / 3; this.P.push(p.x, p.y, p.z); this.UV.push((slot + 0.5) / PAL_W, 0.5);
    const ws = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4); while (ws.length < 4) ws.push([0, 0]);
    const tot = ws.reduce((a, q) => a + q[1], 0) || 1;
    for (const [b, x] of ws) { this.SI.push(b); this.SW.push(x / tot); }
    this.C.push(shade, shade, shade); return n;
  }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  get tris() { return this.I.length / 3; }
}

interface PieceOpt { mat: Mat; w: (p: V3) => W; wrap?: boolean; capStart?: boolean; capEnd?: boolean; shade?: (p: V3, ring: number, j: number) => number }
/**
 * A surface through rings of points (each ring the same count): closed round (wrap) or an open strip, its ends capped
 * or open. Its triangles face outward (checked against its own centre; the material is drawn from both sides anyway,
 * for the open shells).
 */
function loft(M: Mesh, rings: V3[][], o: PieceOpt): void {
  const slot = M.slot(o.mat), wrap = o.wrap ?? true, n = rings[0].length, i0 = M.P.length / 3, t0 = M.I.length;
  const ids = rings.map((r, ri) => r.map((p, j) => M.vert(p, slot, o.w(p), o.shade ? o.shade(p, ri, j) : 1)));
  for (let r = 0; r + 1 < rings.length; r++) for (let j = 0; j < (wrap ? n : n - 1); j++) {
    const j1 = (j + 1) % n, a = ids[r][j], b = ids[r][j1], c = ids[r + 1][j1], d = ids[r + 1][j];
    M.tri(a, b, c); M.tri(a, c, d);
  }
  const cap = (ring: V3[], rid: number[], flip: boolean) => {
    const c = ring.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / ring.length);
    const ci = M.vert(c, slot, o.w(c), o.shade ? o.shade(c, -1, -1) : 1);
    for (let j = 0; j < n; j++) { const a = rid[j], b = rid[(j + 1) % n]; if (flip) M.tri(ci, b, a); else M.tri(ci, a, b); }
  };
  if (o.capStart) cap(rings[0], ids[0], false);
  if (o.capEnd) cap(rings[rings.length - 1], ids[rings.length - 1], true);
  orient(M, i0, t0);
}
/** Turn a piece's triangles outward if most face in (signed volume about its own centre). */
function orient(M: Mesh, i0: number, t0: number): void {
  const P = M.P, I = M.I; let cx = 0, cy = 0, cz = 0; const nv = P.length / 3 - i0;
  for (let i = i0; i < P.length / 3; i++) { cx += P[3 * i]; cy += P[3 * i + 1]; cz += P[3 * i + 2]; }
  cx /= nv; cy /= nv; cz /= nv;
  let vol = 0;
  for (let t = t0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = P[3 * a] - cx, ay = P[3 * a + 1] - cy, az = P[3 * a + 2] - cz, bx = P[3 * b] - cx, by = P[3 * b + 1] - cy, bz = P[3 * b + 2] - cz, qx = P[3 * c] - cx, qy = P[3 * c + 1] - cy, qz = P[3 * c + 2] - cz;
    vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
  }
  if (vol < 0) for (let t = t0; t < I.length; t += 3) { const q = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = q; }
}

/** A row of a cross-section profile: at height y, half-width rx, the front's depth (toward −z) and the back's, its
 * centre's z, and how square it is (2 an ellipse, higher squarer). */
type Row = [y: number, rx: number, rzF: number, rzB: number, cz?: number, p?: number, ox?: number];
/** A profile's row at any height: Catmull-Rom through the rows (smooth silhouettes from a few numbers). */
function profile(rows: Row[]): (y: number) => Row {
  const R = rows.map(r => [r[0], r[1], r[2], r[3], r[4] ?? 0, r[5] ?? 2, r[6] ?? 0] as number[]).sort((p, q) => p[0] - q[0]); // (by height, whichever way written)
  return (y: number) => {
    let k = 0; while (k < R.length - 2 && R[k + 1][0] < y) k++;
    const a = R[Math.max(0, k - 1)], b = R[k], c = R[k + 1], d = R[Math.min(R.length - 1, k + 2)];
    const t = Math.min(1, Math.max(0, (y - b[0]) / (c[0] - b[0] || 1)));
    const cr = (i: number) => { const p0 = a[i], p1 = b[i], p2 = c[i], p3 = d[i]; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); };
    return [y, cr(1), cr(2), cr(3), cr(4), cr(5), cr(6)];
  };
}
/** A point on a profile's cross-section at angle th (0 → +x, −π/2 → the front, −z), pushed out by d, then moved by
 * (ox, oz) and scaled across by gx, gz. */
function onRow(r: Row, th: number, d = 0, ox = 0, oz = 0, gx = 1, gz = 1): V3 {
  const e = 2 / (r[5] ?? 2), c = Math.cos(th), s = Math.sin(th);
  const x = (r[1] + d) * spow(c, e), z = (r[4] ?? 0) + (s < 0 ? r[2] + d : r[3] + d) * spow(s, e);
  return V(ox + x * gx, r[0], oz + z * gz);
}
const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const around = (n: number, a = 0, b = Math.PI * 2, open = false) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (open ? n - 1 : n));

/** A tube swept along a path (open or closed), its cross-section an ellipse `a` across and `b` out from the surface,
 * `out` saying which way is out at each point; its centre lifted `lift`·b off the path (so it sits on a surface). */
function sweep(M: Mesh, path: V3[], o: PieceOpt & { a: (t: number) => number; b: (t: number) => number; out: (p: V3) => V3; n?: number; closed?: boolean; lift?: number; sq?: number }): void {
  const n = o.n ?? 10, rings: V3[][] = [], L = path.length, e = 2 / (o.sq ?? 2);
  for (let k = 0; k < L; k++) {
    const p = path[k], prev = path[o.closed ? (k - 1 + L) % L : Math.max(0, k - 1)], next = path[o.closed ? (k + 1) % L : Math.min(L - 1, k + 1)];
    const T = next.clone().sub(prev).normalize(), O = o.out(p).normalize(), B = T.clone().cross(O).normalize(); O.copy(B.clone().cross(T)).normalize();
    const t = o.closed ? k / L : k / (L - 1), a = o.a(t), b = o.b(t), c = p.clone().addScaledVector(O, (o.lift ?? 1) * b);
    rings.push(around(n).map(th => c.clone().addScaledVector(B, a * spow(Math.cos(th), e)).addScaledVector(O, b * spow(Math.sin(th), e))));
  }
  if (o.closed) rings.push(rings[0]);
  loft(M, rings, { ...o, capStart: !o.closed && (o.capStart ?? true), capEnd: !o.closed && (o.capEnd ?? true) });
}
/** A box (flat faces), its centre, half-sizes and a turn about y then x. */
function box(M: Mesh, c: V3, h: V3, mat: Mat, w: W, ry = 0, rx = 0, shade = 1): void {
  const slot = M.slot(mat), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ'));
  const F: [V3, V3, V3][] = [[V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)], [V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)], [V(0, 1, 0), V(0, 0, 1), V(1, 0, 0)], [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)], [V(0, 0, 1), V(1, 0, 0), V(0, 1, 0)], [V(0, 0, -1), V(0, 1, 0), V(1, 0, 0)]];
  for (const [n, u, v] of F) {
    const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => M.vert(V(n.x * h.x + a * u.x * h.x + b * v.x * h.x, n.y * h.y + a * u.y * h.y + b * v.y * h.y, n.z * h.z + a * u.z * h.z + b * v.z * h.z).applyQuaternion(q).add(c), slot, w, shade));
    M.tri(ids[0], ids[1], ids[2]); M.tri(ids[0], ids[2], ids[3]);
  }
}
/** An ellipsoid (smooth). */
function blob(M: Mesh, c: V3, r: V3, mat: Mat, w: W, nu = 10, nv = 7, rot?: THREE.Euler): void {
  const q = rot ? new THREE.Quaternion().setFromEuler(rot) : null;
  const rings = range(-Math.PI / 2 + 0.25, Math.PI / 2 - 0.25, nv).map(ph => around(nu).map(th => { const p = V(r.x * Math.cos(ph) * Math.cos(th), r.y * Math.sin(ph), r.z * Math.cos(ph) * Math.sin(th)); if (q) p.applyQuaternion(q); return p.add(c); }));
  loft(M, rings, { mat, w: () => w, capStart: true, capEnd: true });
}

// ———————————————————————————— the person: kit ————————————————————————————

export interface Kit {
  name: string;
  skin: number;
  jacket: Mat; yoke: Mat; trim: Mat; tape: Mat;
  pants: Mat; patch: Mat;
  pfd: 'inflatable' | 'foam'; pfdBody: Mat; pfdTrim: Mat;
  boots: Mat; sole: Mat; gloves: Mat; palm: Mat;
  head: 'cap' | 'beanie' | 'hood'; hat: Mat; hair: Mat;
  lens: Mat; frame: Mat;
}
/** Skin under the sim's light: albedos a little warmer than the tones they're meant to read as, since the sky light
 * cools everything turned away from the sun (render/scene.ts hemisphere 0xe8f2ff over 0x29485a). */
export const SKIN = { fair: 0xd6a68c, light: 0xc8947a, medium: 0xae7a5e, tan: 0x8f6046, brown: 0x6c4430, dark: 0x4b2e20 };
const skinMat = (c: number): Mat => ({ c, r: 0.72 });

export const KITS: Kit[] = [
  { // A: helming in a breeze. Red offshore jacket with charcoal shoulders, an inflatable life jacket and harness, a cap.
    name: 'A', skin: SKIN.light,
    jacket: { c: 0xb2252b, r: 0.42 }, yoke: { c: 0x2c3037, r: 0.5 }, trim: { c: 0x1a1c20, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: 0x2f343c, r: 0.5 }, patch: { c: 0x1b1d21, r: 0.7 },
    pfd: 'inflatable', pfdBody: { c: 0x1e2942, r: 0.6 }, pfdTrim: { c: 0xd8a514, r: 0.55 },
    boots: { c: 0x1c1e21, r: 0.35 }, sole: { c: 0x8c9094, r: 0.8 }, gloves: { c: 0x1d1f23, r: 0.7 }, palm: { c: 0x4a4e54, r: 0.85 },
    head: 'cap', hat: { c: 0x1f2c48, r: 0.85 }, hair: { c: 0x6b4c32, r: 0.9 },
    lens: { c: 0x2c3846, r: 0.08 }, frame: { c: 0x141518, r: 0.4 }
  },
  { // B: trimming. Navy jacket, a foam buoyancy vest in orange with black sides, a charcoal knit beanie, leather boots.
    name: 'B', skin: SKIN.brown,
    jacket: { c: 0x1f3456, r: 0.42 }, yoke: { c: 0x18223a, r: 0.5 }, trim: { c: 0x15181c, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: 0x1e2a40, r: 0.5 }, patch: { c: 0x15181d, r: 0.7 },
    pfd: 'foam', pfdBody: { c: 0xd24a22, r: 0.75 }, pfdTrim: { c: 0x1a1c20, r: 0.75 },
    boots: { c: 0x5b3a22, r: 0.55 }, sole: { c: 0x2a2420, r: 0.8 }, gloves: { c: 0x23262b, r: 0.7 }, palm: { c: 0x55504a, r: 0.85 },
    head: 'beanie', hat: { c: 0x3a3e45, r: 0.95 }, hair: { c: 0x17120e, r: 0.9 },
    lens: { c: 0x303a44, r: 0.08 }, frame: { c: 0x2a2622, r: 0.4 }
  },
  { // C: a wet beat, hood up. Yellow jacket and salopettes, a red inflatable, grey boots.
    name: 'C', skin: SKIN.fair,
    jacket: { c: 0xd4a017, r: 0.4 }, yoke: { c: 0x3a3e45, r: 0.5 }, trim: { c: 0x1a1c20, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: 0xc99a1a, r: 0.45 }, patch: { c: 0x3a3e45, r: 0.7 },
    pfd: 'inflatable', pfdBody: { c: 0xa8262a, r: 0.6 }, pfdTrim: { c: 0x1a1c20, r: 0.55 },
    boots: { c: 0x464b52, r: 0.4 }, sole: { c: 0x1c1e21, r: 0.8 }, gloves: { c: 0x1d1f23, r: 0.7 }, palm: { c: 0x4a4e54, r: 0.85 },
    head: 'hood', hat: { c: 0x2a303c, r: 0.85 }, hair: { c: 0x8a6a3e, r: 0.9 },
    lens: { c: 0x283a4a, r: 0.08 }, frame: { c: 0x141518, r: 0.4 }
  }
];

// ———————————————————————————— the body's shapes (m, 1.75 m tall, hips' joint the origin) ————————————————————————————

/** The head, in the head bone's frame (its origin at the top of the neck, about the chin's height): a smooth egg,
 * 0.155 wide, 0.195 front to back, 0.23 chin to crown (a 1.75 m adult's head), a jaw narrowing to the chin. */
export const HEAD_P = profile([
  [-0.085, 0.052, 0.052, 0.05, 0.0],
  [-0.03, 0.054, 0.056, 0.052, -0.004],
  [0.0, 0.055, 0.06, 0.055, -0.006],
  [0.025, 0.05, 0.088, 0.062, -0.006, 2.2], // the chin and under the jaw
  [0.055, 0.061, 0.097, 0.078, -0.006, 2.3], // the mouth
  [0.095, 0.071, 0.101, 0.09, -0.006, 2.4], // the cheekbones
  [0.135, 0.077, 0.097, 0.097, -0.006, 2.4], // the eyes
  [0.17, 0.078, 0.1, 0.1, -0.006, 2.3], // the brow
  [0.2, 0.074, 0.092, 0.098, -0.002, 2.2],
  [0.225, 0.061, 0.074, 0.083, 0.002],
  [0.243, 0.038, 0.045, 0.054, 0.004],
  [0.252, 0.012, 0.014, 0.018, 0.004]
]);
/** A point on the head's surface at height y, angle th, pushed out by d. */
const headAt = (y: number, th: number, d = 0) => onRow(HEAD_P(y), th, d);
const FRONT = -Math.PI / 2;

/** The jacket's body, waist to collar: a long offshore cut to below the seat, squared off across the chest and
 * shoulders, the shoulders' width taking in the deltoids (the sleeves set in below them). */
const JACKET_P = profile([
  [-0.1, 0.18, 0.13, 0.146, 0.012, 2.3], // (the hem, hanging loose over the seat and the tops of the thighs)
  [-0.05, 0.17, 0.124, 0.138, 0.01, 2.4],
  [0.0, 0.159, 0.118, 0.13, 0.008, 2.5], // the hips
  [0.08, 0.152, 0.112, 0.12, 0.006, 2.5], // the waist
  [0.16, 0.153, 0.117, 0.116, 0.004, 2.5],
  [0.25, 0.162, 0.127, 0.115, 0.0, 2.5],
  [0.32, 0.17, 0.132, 0.117, -0.002, 2.5], // the chest
  [0.38, 0.177, 0.127, 0.118, 0.0, 2.5], // the armpits; the shoulder blades behind
  [0.425, 0.184, 0.115, 0.108, 0.002, 2.4],
  [0.455, 0.178, 0.104, 0.1, 0.004, 2.3], // the point of the shoulder
  [0.48, 0.16, 0.095, 0.092, 0.004, 2.2], // (the shoulders slope up to the neck, about 30°, as the trapezius does)
  [0.503, 0.13, 0.087, 0.085, 0.004, 2.1],
  [0.523, 0.102, 0.08, 0.078, 0.004, 2.05],
  [0.54, 0.084, 0.078, 0.074, 0.004, 2.0]
]);
/** The salopettes' seat (under the jacket's hem), to the crotch. */
const SEAT_P = profile([
  [0.12, 0.138, 0.098, 0.103, 0.0, 2.6],
  [0.0, 0.146, 0.104, 0.118, 0.004, 2.6],
  [-0.05, 0.15, 0.105, 0.128, 0.008, 2.5], // (the seat: the crotch is about 12 cm below the hips' joints, standing)
  [-0.09, 0.142, 0.1, 0.122, 0.008, 2.4],
  [-0.115, 0.118, 0.085, 0.095, 0.006, 2.2],
  [-0.13, 0.07, 0.05, 0.05, 0.004, 2.0],
  [-0.137, 0.02, 0.02, 0.02, 0.004, 2.0]
]);
/** A trouser leg (salopettes), centred on the hip joint: thigh to an ankle cuff wide enough to go over a sea boot. */
const LEG_P = profile([
  [0.0, 0.076, 0.086, 0.096, 0.006, 2, -0.008], // (under the jacket's hem, merging into the seat)
  [-0.08, 0.079, 0.092, 0.097, 0.002, 2, -0.008],
  [-0.18, 0.081, 0.092, 0.089, -0.004, 2, -0.006], // the thigh, fuller in front (the quadriceps), angling in to the knee;
  // (its outside, below the jacket's hem, kept a little inside the hem's line: the hips don't stand out past the jacket)
  [-0.28, 0.075, 0.083, 0.077, -0.006, 2, -0.006],
  [-0.36, 0.068, 0.073, 0.066, -0.004, 2, -0.005],
  [-0.43, 0.062, 0.072, 0.061, -0.002, 2.2, -0.007], // the knee, the kneecap in front (salopettes: room to bend)
  [-0.48, 0.061, 0.064, 0.067, 0.003, 2, -0.006],
  [-0.54, 0.065, 0.061, 0.075, 0.008, 2, -0.004], // the calf, swelling behind and outward
  [-0.61, 0.06, 0.059, 0.066, 0.006, 2, -0.002], // narrowing toward the ankle
  [-0.67, 0.058, 0.06, 0.064, 0.005, 2, -0.001], // (over the boot's shaft, the cloth bunching a little)
  [-0.72, 0.061, 0.063, 0.067, 0.004, 2, 0.0],
  [-0.745, 0.064, 0.066, 0.07, 0.004, 2, 0.0]
]);
/** A sleeve, centred on the shoulder joint, from inside the jacket's shoulder to a cuff at the wrist. */
const SLEEVE_P = profile([
  [0.47, 0.066, 0.066, 0.068, 0, 2, 0],
  [0.42, 0.067, 0.065, 0.066, 0, 2, 0.005], // the deltoid, round over the shoulder's point
  [0.36, 0.061, 0.061, 0.062, -0.002, 2, 0.003],
  [0.29, 0.057, 0.06, 0.058, -0.004, 2, 0.0], // the biceps, in front
  [0.22, 0.053, 0.054, 0.056, 0.0, 2, -0.001],
  [0.17, 0.05, 0.051, 0.059, 0.004, 2, -0.002], // the elbow, its point behind
  [0.12, 0.054, 0.055, 0.054, -0.002, 2, -0.001], // the forearm's swell below it
  [0.05, 0.051, 0.051, 0.05, -0.003, 2, 0],
  [-0.02, 0.046, 0.047, 0.046, -0.004, 2, 0], // narrowing to the wrist (the sleeve still loose)
  [-0.06, 0.045, 0.046, 0.045, -0.004, 2, 0],
  [-0.075, 0.048, 0.049, 0.048, -0.004, 2, 0] // the cuff, over the glove
]);
/** Cloth hanging loose: a ring's points pushed out in a few soft folds (amplitude `a`, `k` folds round). */
const drape = (r: V3[], a: number, k: number, ph: number) => {
  if (a <= 0) return r;
  const c = r.reduce((s2, q) => s2.add(q), V(0, 0, 0)).multiplyScalar(1 / r.length);
  return r.map((q, j) => { const th = (j / r.length) * Math.PI * 2, d = V(q.x - c.x, 0, q.z - c.z).normalize(); return q.addScaledVector(d, a * (0.5 + 0.5 * Math.sin(k * th + ph)) * (0.7 + 0.3 * Math.sin(2.3 * k * th + 2 * ph))); });
};

/** Skin weights. The torso: the hips' bone below the waist, the spine's above, blended over the waist. */
const wTorso = (p: V3): W => blend(HIPS, SPINE, ss(0.02, 0.22, p.y));
const wArm = (i: number) => (p: V3): W => p.y > 0.42 ? blend(SH[i], SPINE, 0.55 * ss(0.42, 0.51, p.y)) : blend(EL[i], SH[i], ss(0.13, 0.21, p.y));
// (the sleeve's head shares the spine's weight toward the top, so a raised arm stretches the shoulder rather than lifting
// the sleeve's head clear of the jacket)
const wLeg = (i: number) => (p: V3): W => p.y > -0.02 ? blend(HP[i], HIPS, ss(-0.02, 0.06, p.y)) : blend(KN[i], HP[i], ss(-0.47, -0.39, p.y));

/** One surface through rings, in material regions: each region its own piece (its own vertices along the seam), so a
 * colour stops at the seam the way a panel of cloth does, with no overlay and no smear. `parts`: [first ring, material]. */
function loftParts(M: Mesh, rings: V3[][], parts: [number, Mat][], o: Omit<PieceOpt, 'mat'>): void {
  parts.forEach(([a, mat], k) => {
    const b = k + 1 < parts.length ? parts[k + 1][0] : rings.length - 1;
    loft(M, rings.slice(a, b + 1), { ...o, mat, capStart: !!o.capStart && k === 0, capEnd: !!o.capEnd && k === parts.length - 1, shade: o.shade ? (q, r, j) => o.shade!(q, r < 0 ? r : r + a, j) : undefined });
  });
}

export function buildArtBody(p: Person, kit: Kit): Body & { tris: number } {
  const s = p.h / 1.75, g = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24)));
  const M = new Mesh();
  const skin = skinMat(kit.skin);
  const hx = BONE.hipX * g, sx = BONE.shoulderX * g;
  const HY = BONE.headY; // the head bone's height on the spine
  const TAU = Math.PI * 2;
  const rings = (P: (y: number) => Row, ys: number[], n: number, d = 0, ox = 0, oz = 0, th0 = 0, th1 = TAU, open = false) =>
    ys.map(y => { const r = P(y); return around(n, th0, th1, open).map(th => onRow(r, th, d, ox + Math.sign(ox) * (r[6] ?? 0) * g, oz, g, g)); });
  // (a limb's section centre moves out or in a little from its bone, by the profile's 7th number: + away from the body)
  const ring = (r: Row, n: number, d = 0, ox = 0) => around(n).map(th => onRow(r, th, d, ox + Math.sign(ox) * (r[6] ?? 0) * g, 0, g, g));

  // ——— the salopettes: seat, legs (reinforced at the knees and seat), ankle cuffs over the boots
  loft(M, rings(SEAT_P, [0.12, 0.04, -0.02, -0.05, -0.08, -0.1, -0.115, -0.128, -0.137], 20), { mat: kit.pants, w: () => [[HIPS, 1]], capEnd: true });
  for (const i of [0, 1]) {
    const xs = i ? 1 : -1, cx = xs * hx;
    const ys = [0.0, -0.08, -0.18, -0.28, -0.36, -0.43, -0.48, -0.54, -0.6, -0.64, -0.675, -0.705, -0.73, -0.745];
    const leg = rings(LEG_P, ys, 14, 0, cx).map((r, k) => drape(r, 0.0035 * ss(-0.58, -0.745, ys[k]) * (0.6 + 0.4 * Math.sin(ys[k] * 95)), 4, 1.3 + i + 3 * ys[k])); // (bunched folds above the boot)
    // (the cuff turns in: its inside, in shade)
    leg.push(drape(ring(LEG_P(-0.745), 14, -0.008, cx), 0.004, 4, 1.3 + i).map(q => q.setY(-0.75)), ring(LEG_P(-0.7), 14, -0.012, cx));
    loft(M, leg, { mat: kit.pants, w: wLeg(i), shade: (_q, r) => r >= ys.length ? 0.4 : 1 });
    loft(M, rings(LEG_P, [-0.35, -0.39, -0.43, -0.47, -0.51], 7, 0.004, cx, 0, FRONT - 0.95, FRONT + 0.95, true), { mat: kit.patch, w: wLeg(i), wrap: false }); // the knee's patch
    // ——— the sea boots: a shaft up under the trousers, the foot, a sole with a little lip
    loft(M, [-0.66, -0.76, -0.84, -0.875].map(y => ring([y, 0.046, 0.051, 0.054, 0.006, 2.2], 12, 0, cx)), { mat: kit.boots, w: () => [[KN[i], 1]] });
    const foot: [z: number, rx: number, yt: number, yb: number, yc: number][] = [
      [0.078, 0.03, 0.028, 0.028, -0.886], [0.064, 0.044, 0.052, 0.036, -0.884], [0.02, 0.049, 0.06, 0.04, -0.882], [-0.05, 0.052, 0.042, 0.034, -0.89],
      [-0.12, 0.052, 0.03, 0.031, -0.894], [-0.175, 0.046, 0.023, 0.028, -0.897], [-0.205, 0.033, 0.017, 0.024, -0.899], [-0.215, 0.014, 0.01, 0.016, -0.9]
    ];
    const fx = cx + xs * 0.006;
    loft(M, foot.map(f => around(10).map(th => { const c = Math.cos(th), sn = Math.sin(th); return V(fx + f[1] * spow(c, 0.8), f[4] + (sn > 0 ? f[2] : f[3]) * spow(sn, 0.8), f[0]); })), { mat: kit.boots, w: () => [[KN[i], 1]], capStart: true, capEnd: true });
    const sole = [[0.082, 0.032], [0.06, 0.05], [0.0, 0.054], [-0.1, 0.058], [-0.17, 0.052], [-0.205, 0.038], [-0.219, 0.018]];
    loft(M, sole.map(([z, rx]) => around(10).map(th => V(fx + rx * spow(Math.cos(th), 0.6), -0.917 + 0.011 * spow(Math.sin(th), 0.6), z))), { mat: kit.sole, w: () => [[KN[i], 1]], capStart: true, capEnd: true });
  }

  // ——— the jacket: a drawcord band at the hem, the body, the shoulders in a darker reinforcement, a collar zipped to
  // the chin with a reflective band, sleeves, cuffs, the zip's storm flap
  {
    const ys = [-0.105, -0.095, -0.075, -0.03, 0.02, 0.08, 0.16, 0.25, 0.32, 0.38, 0.4, 0.425, 0.455, 0.48, 0.503, 0.523, 0.54];
    const body = rings(JACKET_P, ys, 24).map((r, k) => drape(r, 0.006 * ss(0.03, -0.1, ys[k]), 5, 0.7));
    body.unshift(drape(ring(JACKET_P(-0.1), 24, -0.01), 0.006, 5, 0.7).map(q => q.setY(-0.08))); // (the hem turned up inside)
    loftParts(M, body, [[0, kit.trim], [3, kit.jacket], [11, kit.yoke]], { w: wTorso, shade: (_q, r) => r === 0 ? 0.45 : 1 });
  }
  const collarTop = (th: number) => 0.62 + 0.026 * Math.max(0, Math.sin(th)) + 0.012 * (1 - Math.abs(Math.sin(th))); // (front .612, sides .624, back .646)
  // (in the spine's frame: the neck's top, about the chin, at HY = 0.57, so the rim comes up over the chin in front)
  const COL_P = profile([[0.54, 0.084, 0.08, 0.076, 0.004], [0.57, 0.088, 0.1, 0.078, -0.004], [0.6, 0.09, 0.112, 0.08, -0.008], [0.64, 0.09, 0.116, 0.08, -0.01]]);
  const colRing = (f: number, d: number, n = 24) => around(n).map(th => { const q = onRow(COL_P(0.54 + 0.1 * f), th, d, 0, 0, g, g); q.y = 0.54 + (collarTop(th) - 0.54) * f; return q; });
  {
    const collar = [0, 0.3, 0.62, 0.84, 0.86, 0.94, 0.96, 1].map(f => colRing(f, 0));
    collar.push(colRing(1, -0.008).map(q => q.setY(q.y + 0.004)), colRing(0.8, -0.012));
    loftParts(M, collar, [[0, kit.jacket], [4, kit.tape], [5, kit.jacket]], { w: () => [[SPINE, 1]], shade: (_q, r) => r >= 8 ? 0.35 : 1 });
  }
  {
    const path = range(-0.095, 0.5, 10).map(y => onRow(JACKET_P(y), FRONT, 0.002, 0, 0, g, g));
    for (const f of [0.3, 0.7, 0.97]) path.push(colRing(f, 0.002)[18]);
    sweep(M, path, { mat: kit.trim, w: wTorso, a: () => 0.011, b: () => 0.0035, out: () => V(0, 0, -1), n: 4, lift: 0.6, sq: 4 });
  }
  for (const i of [0, 1]) {
    const xs = i ? 1 : -1, cx = xs * sx;
    // the sleeve: its head a dome set in under the jacket's shoulder, leaning in toward the neck
    const sy = [0.4, 0.36, 0.29, 0.22, 0.17, 0.12, 0.05, -0.02, -0.06, -0.078];
    const top: [y: number, shift: number, k: number][] = [[0.478, 0.052, 0.4], [0.466, 0.027, 0.74], [0.448, 0.008, 0.94], [0.425, 0, 1]];
    const sl = [...top.map(([y, sh, k]) => around(14).map(th => onRow(SLEEVE_P(Math.min(0.47, y)), th, 0, cx - xs * sh * g, 0, g * k, g * k).setY(y))), ...rings(SLEEVE_P, sy, 14, 0, cx).map((r, k) => drape(r, 0.003 * ss(0.05, -0.078, sy[k]), 3, 0.4 + i))];
    sl.push(drape(ring(SLEEVE_P(-0.075), 14, -0.01, cx), 0.003, 3, 0.4 + i).map(q => q.setY(-0.08)));
    loftParts(M, sl, [[0, kit.yoke], [3, kit.jacket]], { w: wArm(i), capStart: true, shade: (_q, r) => r >= sl.length - 1 ? 0.4 : 1 });
    loft(M, rings(SLEEVE_P, [0.25, 0.21, 0.17, 0.13, 0.09], 7, 0.003, cx, 0, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9, true), { mat: kit.yoke, w: wArm(i), wrap: false }); // the elbow's patch
    // the inner cuff (neoprene, at the wrist) and the outer cuff's tab
    loft(M, [-0.065, -0.095].map(y => around(12).map(th => onRow([y, 0.035, 0.036, 0.036], th, 0, cx, 0, g, g))), { mat: kit.trim, w: () => [[EL[i], 1]] });
    box(M, V(cx + xs * 0.045 * g, -0.062, -0.012), V(0.004, 0.012, 0.022), kit.trim, [[EL[i], 1]]);
    // ——— the glove: a relaxed hand, the fingers curled toward the palm (which faces the body), the thumb along the
    // front; a grip panel on the palm
    const inward = -xs, hand: [y: number, dx: number, rx: number, rz: number, dz: number][] = [
      [-0.085, 0, 0.029, 0.034, 0], [-0.11, 0.001, 0.025, 0.041, 0.002], [-0.14, 0.003, 0.025, 0.046, 0.004], [-0.168, 0.006, 0.028, 0.047, 0.004],
      [-0.19, 0.01, 0.03, 0.045, 0.004], [-0.206, 0.014, 0.026, 0.039, 0.003], [-0.215, 0.016, 0.016, 0.027, 0.002]
    ];
    const hring = (h: number[], d = 0, a0 = 0, a1 = TAU, open = false, n = 12) => around(n, a0, a1, open).map(th => V(cx + inward * h[1] + (h[2] + d) * spow(Math.cos(th), 0.8), h[0], h[4] + (h[3] + d) * spow(Math.sin(th), 0.8)));
    loft(M, hand.map(h => hring(h)), { mat: kit.gloves, w: () => [[EL[i], 1]], capEnd: true });
    const palm = inward > 0 ? 0 : Math.PI;
    loft(M, hand.slice(1, 6).map(h => hring(h, 0.002, palm - 0.9, palm + 0.9, true, 6)), { mat: kit.palm, w: () => [[EL[i], 1]], wrap: false });
    sweep(M, [V(cx + inward * 0.012, -0.1, -0.03), V(cx + inward * 0.016, -0.13, -0.046), V(cx + inward * 0.02, -0.158, -0.05), V(cx + inward * 0.024, -0.176, -0.043)], {
      mat: kit.gloves, w: () => [[EL[i], 1]], a: t => 0.014 - 0.003 * t, b: t => 0.012 - 0.002 * t, out: () => V(0, 0, -1), lift: 0, n: 8
    });
  }

  // ——— the life jacket
  if (kit.pfd === 'inflatable') {
    // an inflatable's two lobes in their cover, from behind the neck over the shoulders and down the chest to the belt
    for (const xs of [-1, 1]) {
      const path = [V(0, 0.522, 0.09), V(xs * 0.06, 0.532, 0.08), V(xs * 0.096, 0.525, 0.02), V(xs * 0.097, 0.5, -0.05), V(xs * 0.088, 0.455, -0.1), V(xs * 0.08, 0.38, -0.127), V(xs * 0.075, 0.29, -0.128), V(xs * 0.07, 0.205, -0.122)]
        .map(q => V(q.x * g, q.y, q.z * g));
      sweep(M, path, { mat: kit.pfdBody, w: wTorso, a: t => 0.036 - 0.006 * t, b: t => 0.016 - 0.004 * t, out: q => V(q.x, q.y - 0.36, q.z), n: 10, sq: 2.6 });
      box(M, V(xs * 0.084 * g, 0.39, -0.143 * g), V(0.012, 0.02, 0.004), kit.pfdTrim, [[SPINE, 1]], xs * -0.5); // the cover's tab
    }
    // the harness's waist belt and its buckle
    sweep(M, around(20).map(th => onRow(JACKET_P(0.19), th, 0.003, 0, 0, g, g)), { mat: kit.trim, w: wTorso, a: () => 0.02, b: () => 0.004, out: q => V(q.x, 0, q.z), closed: true, n: 4, sq: 4 });
    box(M, V(0, 0.19, (JACKET_P(0.19)[4]! - JACKET_P(0.19)[2]) * g - 0.009), V(0.022, 0.018, 0.006), { c: 0x6c7076, r: 0.3 }, [[SPINE, 1]]);
  } else {
    // a foam vest: front and back panels over the jacket, narrowed to straps over the shoulders and round the arms
    const VEST_X = (y: number) => Math.min(JACKET_P(y)[1] + 0.02, 0.19 - 0.6 * Math.max(0, y - 0.33));
    const vrow = (y: number): Row => { const r = JACKET_P(Math.min(0.53, y)); return [y, VEST_X(y), r[2] + 0.022, r[3] + 0.02, r[4], 2.6]; };
    const vy = [0.08, 0.1, 0.16, 0.24, 0.31, 0.36, 0.41, 0.45, 0.49, 0.515];
    const vr = vy.map(y => ring(vrow(y), 24));
    vr.unshift(ring([0.1, VEST_X(0.1) - 0.016, JACKET_P(0.1)[2] + 0.004, JACKET_P(0.1)[3] + 0.004, 0, 2.6], 24));
    vr.push(ring([0.512, 0.088, 0.086, 0.082, 0.004, 2.2], 24));
    loft(M, vr, { mat: kit.pfdBody, w: wTorso });
    // its black side panels and zip, a buckled strap at the waist, reflective patches high on the chest
    for (const xs of [-1, 1]) loft(M, [0.11, 0.18, 0.26, 0.33].map(y => around(6, xs > 0 ? -0.55 : Math.PI - 0.55, xs > 0 ? 0.55 : Math.PI + 0.55, true).map(th => onRow(vrow(y), th, 0.003, 0, 0, g, g))), { mat: kit.pfdTrim, w: wTorso, wrap: false });
    sweep(M, range(0.1, 0.5, 8).map(y => onRow(vrow(y), FRONT, 0, 0, 0, g, g)), { mat: kit.trim, w: wTorso, a: () => 0.008, b: () => 0.003, out: () => V(0, 0, -1), n: 4, sq: 4 });
    const yb = 0.15;
    sweep(M, around(20).map(th => onRow(vrow(yb), th, 0.003, 0, 0, g, g)), { mat: kit.trim, w: wTorso, a: () => 0.013, b: () => 0.003, out: q => V(q.x, 0, q.z), closed: true, n: 4, sq: 4 });
    box(M, V(0, yb, (vrow(yb)[4]! - vrow(yb)[2]) * g - 0.008), V(0.02, 0.014, 0.006), { c: 0x6c7076, r: 0.3 }, [[SPINE, 1]]);
    for (const xs of [-1, 1]) box(M, V(xs * 0.075 * g, 0.4, (vrow(0.4)[4]! - vrow(0.4)[2]) * g - 0.003), V(0.022, 0.009, 0.003), kit.tape, [[SPINE, 1]], xs * -0.4);
  }

  // ——— the head (built in the head bone's frame, moved up to it)
  const up = (q: V3) => q.setY(q.y + HY);
  const wHead = (q: V3): W => blend(SPINE, HEAD, ss(HY - 0.07, HY - 0.0, q.y));
  const hy = [-0.085, -0.03, 0.0, 0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.175, 0.2, 0.22, 0.236, 0.247, 0.252];
  // (the head's segments closer together toward the face, where the nose is modelled into the surface: a soft ridge
  // from the bridge to the tip, 2 cm out at the tip, under the glasses' bridge)
  const nose = (y: number, th: number) => {
    const t = (y - 0.08) / 0.066; if (t <= 0 || t >= 1.05) return 0;
    const prof = t < 0.18 ? Math.sin(t / 0.18 * Math.PI / 2) : Math.max(0, 1 - 0.7 * (t - 0.18) / 0.82), a = th - FRONT, w = 0.13 + 0.03 * (1 - t);
    return 0.021 * prof * Math.exp(-a * a / (2 * w * w));
  };
  const hth = Array.from({ length: 26 }, (_, k) => FRONT + Math.PI * spow(2 * k / 26 - 1, 1.7));
  loft(M, hy.map(y => hth.map(th => { const q = headAt(y, th), n = nose(y, th); q.x += n * Math.cos(th); q.z += n * Math.sin(th); return up(q); })), { mat: skin, w: wHead, capEnd: true });
  // the ears
  if (kit.head !== 'hood') for (const xs of [-1, 1]) blob(M, V(xs * 0.076, HY + 0.124, 0.006), V(0.01, 0.027, 0.017), skin, [[HEAD, 1]], 8, 5, new THREE.Euler(0, xs * 0.3, 0));
  // the sunglasses: a wraparound lens standing off the face, a frame along its top, arms back over the ears
  {
    const half = 1.02, cols = around(17, FRONT - half, FRONT + half, true);
    const lensTop = (th: number) => { const a = Math.abs(th - FRONT); return 0.155 - 0.005 * Math.exp(-a * a / 0.006) - 0.006 * a * a; };
    const lensBot = (th: number) => { const a = Math.abs(th - FRONT); return 0.119 + 0.024 * Math.exp(-a * a / 0.006) + 0.01 * a * a; };
    const lensPt = (th: number, f: number, d: number) => { const y = lensBot(th) + (lensTop(th) - lensBot(th)) * f; const q = headAt(y, th, d); q.y = y; return up(q); };
    const fr = [0, 0.5, 1], front = fr.map(f => cols.map(th => lensPt(th, f, 0.017))), back = fr.map(f => cols.map(th => lensPt(th, f, 0.013)));
    // (one closed strip: the front face bottom to top, over the top edge, down the back; the front lighter where it
    // reflects the sky)
    loft(M, [...front, ...back.reverse()], { mat: kit.lens, w: () => [[HEAD, 1]], wrap: false, shade: (_q, r) => r < 3 ? 0.55 + 0.75 * r / 2 : 0.35 });
    sweep(M, cols.map(th => lensPt(th, 1.05, 0.0155)), { mat: kit.frame, w: () => [[HEAD, 1]], a: () => 0.0035, b: () => 0.0028, out: q => V(q.x, 0, q.z), n: 4, lift: 0 });
    for (const xs of [-1, 1]) {
      const arm = [lensPt(FRONT + xs * half, 0.85, 0.0155), up(headAt(0.15, FRONT + xs * 1.3, 0.008)), up(headAt(0.146, FRONT + xs * 1.62, 0.006)), up(headAt(0.142, FRONT + xs * 1.95, 0.008))];
      sweep(M, arm, { mat: kit.frame, w: () => [[HEAD, 1]], a: () => 0.0025, b: () => 0.004, out: () => V(0, 1, 0), n: 4, lift: 0 });
    }
  }
  const cap = (hair: boolean) => {
    // short hair under the cap: down to the nape behind, to the top of the ear at the sides, a short sideburn
    const lowY = (th: number) => { const b = Math.max(0, Math.sin(th)); return 0.062 + 0.06 * (1 - b) * (1 - b); };
    const band = (th: number) => 0.168 + 0.022 * Math.max(0, -Math.sin(th)) - 0.01 * Math.max(0, Math.sin(th));
    if (hair) loft(M, [0, 0.35, 0.7, 1].map(f => around(14, FRONT + 1.42, FRONT + TAU - 1.42, true).map(th => { const y = lowY(th) + (band(th) + 0.01 - lowY(th)) * f; const q = headAt(y, th, 0.0035 + 0.003 * ss(0, 0.5, f)); q.y = y; return up(q); })), { mat: kit.hair, w: () => [[HEAD, 1]], wrap: false });
    // the crown: fuller than the head, six panels' shape, its band lower behind than in front; a button on top
    const crown = [0, 0.3, 0.58, 0.8, 0.93, 1].map(f => around(hair ? 24 : 16).map(th => { const y0 = band(th), y = y0 + (0.258 - y0) * f; const q = headAt(Math.min(0.249, y), th, 0.008 + 0.006 * Math.sin(Math.PI * f)); q.y = y + 0.004 * f; if (f === 1) { q.x *= 0.15; q.z *= 0.15; } return up(q); }));
    loft(M, crown, { mat: kit.hat, w: () => [[HEAD, 1]], capEnd: true });
    blob(M, up(V(0, 0.263, 0.0)), V(0.009, 0.004, 0.009), kit.hat, [[HEAD, 1]], 6, 4);
    // the peak: 7 cm forward of the band, curved down at its sides, a few mm thick, darker beneath
    const us = range(-1, 1, 11), vs = [0, 0.4, 0.8, 1];
    const peak = (u: number, v: number, top: boolean) => {
      const th = FRONT + u * 0.82, root = headAt(band(th), th, 0.008); root.y = band(th);
      const out = V(Math.cos(th) * 0.8, 0, Math.sin(th) * 1.3).normalize(), len = 0.076 * Math.pow(Math.max(0, 1 - u * u), 0.42);
      const q = root.clone().addScaledVector(out, len * v); q.y -= 0.012 * v + 0.026 * u * u * Math.sqrt(v) + (top ? 0 : 0.005) - 0.004 * v * v;
      return up(q);
    };
    loft(M, us.map(u => [...vs.map(v => peak(u, v, true)), ...[...vs].reverse().map(v => peak(u, v, false))]), { mat: kit.hat, w: () => [[HEAD, 1]], wrap: false, capStart: true, capEnd: true, shade: (_q, _r, j) => j >= vs.length ? 0.6 : 1 });
  };
  if (kit.head === 'cap') cap(true);
  else if (kit.head === 'beanie') {
    // a knit beanie pulled down over the tops of the ears, its cuff turned up, a little slouch at the back
    const band = (th: number) => 0.112 + 0.046 * Math.max(0, -Math.sin(th)) + 0.004 * Math.max(0, Math.sin(th));
    const crown = [0, 0.22, 0.44, 0.62, 0.76, 0.87, 0.94, 0.98].map(f => around(24).map(th => { const y0 = band(th) + 0.042, y = y0 + (0.264 - y0) * f; const slouch = 0.007 * Math.max(0, Math.sin(th)) * Math.sin(Math.PI * Math.min(1, f * 1.1)); const q = headAt(Math.min(0.24, y), th, 0.009 + slouch + 0.003 * Math.sin(Math.PI * f)); q.y = y; const k = 1 - 0.75 * ss(0.8, 1, f); q.x *= k; q.z *= k; return up(q); }));
    loft(M, crown, { mat: kit.hat, w: () => [[HEAD, 1]], capEnd: true });
    // the cuff: ribbed knit (in the geometry), a little thicker, its fold rounded over at the top
    const cuffRing = (f: number, d: number, rib = 1) => around(40).map(th => { const y = band(th) + 0.044 * f; const q = headAt(y, th, d + rib * 0.0012 * Math.cos(20 * th)); q.y = y; return up(q); });
    loft(M, [cuffRing(0, 0.004, 0), cuffRing(0.08, 0.011), cuffRing(0.5, 0.0125), cuffRing(0.92, 0.012), cuffRing(1.0, 0.008, 0)], { mat: kit.hat, w: () => [[HEAD, 1]], shade: (_q, r) => r === 0 ? 0.75 : 1 });
    { const q = up(headAt(band(FRONT) + 0.022, FRONT, 0.0135)); q.y = HY + band(FRONT) + 0.022; box(M, q, V(0.01, 0.0055, 0.0015), { c: 0x6a665f, r: 0.9 }, [[HEAD, 1]]); } // a small woven label
    loft(M, [0.07, 0.09, 0.12].map(y => around(10, FRONT + 2.1, FRONT + TAU - 2.1, true).map(th => up(headAt(y, th, 0.0035)))), { mat: kit.hair, w: () => [[HEAD, 1]], wrap: false }); // hair at the nape
  } else {
    // the jacket's hood, up, over a cap (its peak out under the hood's edge, shading the face, as sailors wear them):
    // slices across the hood front to back, each an arch over the head from inside the collar on one side round to
    // inside it on the other; its lip turned in, the inside in shade
    cap(false);
    // the hood: rings round the head 2 cm out (fuller behind, where it's cut for the head's back and a cap), from inside
    // the collar (zipped up over it, so no edge of the hood shows below) up over the crown; the face's opening an oval
    // from the chin to the brow, its edge rolled over the drawcord
    const hood = (y: number, th: number) => { const back = Math.max(0, Math.sin(th)); const q = headAt(Math.min(0.245, Math.max(-0.03, y)), th, 0.02 + 0.012 * back * ss(0.02, 0.15, y)); q.y = y; return q; };
    const OY = 0.132, OH = 0.083, OA = 0.98; // (the opening: its middle's height, half its height, half its width round the head)
    const open = (y: number) => { const t = (y - OY) / OH; return Math.abs(t) >= 1 ? 0 : OA * Math.sqrt(1 - t * t); };
    const hy2 = [-0.015, 0.02, 0.04, 0.052, 0.065, 0.085, 0.11, 0.135, 0.16, 0.185, 0.205, 0.22, 0.235, 0.25, 0.262, 0.27];
    const hr = hy2.map(y => { const a = open(y), r = around(21, FRONT + a, FRONT + Math.PI * 2 - a, true).map(th => { const q = hood(y, th); if (y > 0.25) { const k = 1 - 0.8 * ss(0.25, 0.272, y); q.x *= k; q.z *= k; } return up(q); }); return r; });
    loft(M, hr, { mat: kit.jacket, w: (q: V3) => blend(SPINE, HEAD, ss(HY + 0.03, HY + 0.09, q.y)), wrap: false, capEnd: true });
    // the rolled edge round the opening
    const edge = range(0, 1, 23).map(t => { const ang = Math.PI * 2 * t - Math.PI / 2, y = OY + OH * Math.sin(ang) * 0.985, side = Math.cos(ang) >= 0 ? 1 : -1, a = Math.max(0.04, open(y)); return up(hood(y, FRONT + side * a)); });
    sweep(M, edge, { mat: kit.jacket, w: () => [[HEAD, 1]], a: () => 0.008, b: () => 0.006, out: q => V(q.x, 0, q.z - 0.02), closed: true, n: 4, lift: 0.3 });
    for (const xs of [-1, 1]) blob(M, up(V(xs * 0.05, 0.048, -0.106)), V(0.006, 0.011, 0.006), kit.trim, [[SPINE, 1]], 6, 4); // the drawcord's toggles
  }

  // ——— into one skinned mesh on the eleven bones
  const root = new THREE.Group(); root.scale.setScalar(s);
  const B = (parent: THREE.Object3D | null, x: number, y: number, z: number) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent?.add(b); return b; };
  const hips = B(null, 0, 0, 0), spine = B(hips, 0, 0, 0), head = B(spine, 0, HY, 0);
  const sh = [-1, 1].map(q => B(spine, q * sx, BONE.shoulderY, 0)), el = sh.map(b => B(b, 0, -BONE.upper, 0));
  const hp = [-1, 1].map(q => B(hips, q * hx, 0, 0)), kn = hp.map(b => B(b, 0, -BONE.thigh, 0));
  head.rotation.order = 'YXZ';
  const bones = [hips, spine, head, sh[0], el[0], sh[1], el[1], hp[0], kn[0], hp[1], kn[1]];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(M.P, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(M.UV, 2));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(M.C, 3));
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(M.SI, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(M.SW, 4));
  geom.setIndex(M.I); geom.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geom, material(M.mats));
  mesh.add(hips); root.add(mesh); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { root, torso: spine, head, arm: [{ root: sh[0], mid: el[0] }, { root: sh[1], mid: el[1] }], leg: [{ root: hp[0], mid: kn[0] }, { root: hp[1], mid: kn[1] }], scale: s, mesh, tris: M.tris };
}

/** The palette: colour and roughness, one texel per material (nearest-filtered: a colour stops at its texel). */
function material(mats: Mat[]): THREE.MeshStandardMaterial {
  const col = new Uint8Array(PAL_W * 4), rough = new Uint8Array(PAL_W * 4);
  mats.forEach((m, i) => {
    const c = new THREE.Color(m.c);
    col.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4);
    rough.set([0, m.r * 255, 0, 255], i * 4);
  });
  const tex = (a: Uint8Array) => { const t = new THREE.DataTexture(a, PAL_W, 1, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  return new THREE.MeshStandardMaterial({ map: tex(col), roughnessMap: tex(rough), roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
}

// ———————————————————————————— who they are: a kit for each person ————————————————————————————

/** A hash of a seed and a salt to 0..1 (each choice independent of the others). */
const hash = (seed: number, salt: number) => { let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const pick = <T,>(arr: readonly T[], seed: number, salt: number) => arr[Math.floor(hash(seed, salt) * arr.length)];
const darker = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
/** Foul-weather jackets in the colours they come in (the makers' usual reds, navies, yellows, greys, whites). */
const TOPS = [0xb2252b, 0x1f3456, 0xd4a017, 0x3a3f47, 0xaeb0ad, 0x2b6f86, 0xd2561e, 0x23272e, 0x7a2236, 0x3f6a3a];
/** Salopettes: mostly dark, sometimes the jacket's own colour (sold as a set). */
const BIBS = [0x2f343c, 0x1e2a40, 0x23272e, 0x3a3f47, 0x1b2230];
/** Inflatables' covers, and foam vests' colours. */
const COVERS = [0x1e2942, 0x1a1c20, 0xa8262a, 0x3a3f47, 0x23324f];
const VESTS = [0xd24a22, 0xc8372d, 0xd4a017, 0x1f3456, 0x23272e, 0x2b6f86];
const TRIMS = [0xd8a514, 0xd24a22, 0x2e8fbf, 0x8fc93a, 0xb9bcbf];
const BOOTS: [Mat, Mat][] = [[{ c: 0x1c1e21, r: 0.35 }, { c: 0x8c9094, r: 0.8 }], [{ c: 0x464b52, r: 0.4 }, { c: 0x1c1e21, r: 0.8 }], [{ c: 0x5b3a22, r: 0.55 }, { c: 0x2a2420, r: 0.8 }], [{ c: 0x1e2942, r: 0.4 }, { c: 0xb0b3b6, r: 0.8 }]];
/** Caps (a white one kept a little grey: under the sky's light it would read as pure white), and knit beanies. */
const CAPS = [0x1f2c48, 0xb7b5ad, 0xa8262a, 0x2a303c, 0xb9a88a, 0x2b4f8a];
const KNITS = [0x3a3e45, 0x1d2330, 0x7a2236, 0x2b4f8a, 0x4f5a3a, 0x8a8478];
/** Skin from very fair to very dark, about evenly across the range (the Bay's sailors aren't all one people); hair by
 * skin (dark hair with dark skin, the full range with fair). */
const SKINS = [SKIN.fair, SKIN.light, SKIN.medium, SKIN.tan, SKIN.brown, SKIN.dark];
const HAIR_FAIR = [0x3b2a1e, 0x6b4c32, 0x8a6a3e, 0xb89466, 0x5a4636, 0x8c8a86];
const HAIR_DARK = [0x17120e, 0x1d1712, 0x2b2018, 0x3b2a1e];
const LENSES = [0x303a44, 0x2c3846, 0x3a2e26, 0x26303a];

/**
 * A person's kit from their seed (a boat's crew have consecutive seeds: stable race to race) and their boat's team
 * colour: a cap, a beanie or the hood up over a cap; their jacket in the team colour or their own; salopettes; an
 * inflatable or a foam vest; boots, skin, hair and lenses.
 */
export function kitFor(seed: number, team: number): Kit {
  const jc = hash(seed, 10) < 0.5 ? team : pick(TOPS, seed, 11);
  const jacket: Mat = { c: jc, r: 0.42 }, yoke: Mat = { c: hash(seed, 12) < 0.6 ? 0x2c3037 : darker(jc, 0.55), r: 0.5 };
  const pc = hash(seed, 13) < 0.3 ? darker(jc, 0.95) : pick(BIBS, seed, 14);
  const tone = Math.floor(hash(seed, 1) * SKINS.length);
  const head = (['cap', 'cap', 'cap', 'beanie', 'beanie', 'hood'] as const)[Math.floor(hash(seed, 6) * 6)];
  const foam = hash(seed, 3) < 0.4, [boots, sole] = pick(BOOTS, seed, 9);
  return {
    name: String(seed), skin: SKINS[tone],
    jacket, yoke, trim: { c: 0x1a1c20, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: pc, r: 0.5 }, patch: { c: darker(pc, 0.6), r: 0.7 },
    pfd: foam ? 'foam' : 'inflatable', pfdBody: foam ? { c: pick(VESTS.filter(v => v !== jc), seed, 4), r: 0.75 } : { c: pick(COVERS.filter(v => v !== jc), seed, 4), r: 0.6 },
    pfdTrim: foam ? { c: 0x1a1c20, r: 0.75 } : { c: pick(TRIMS, seed, 5), r: 0.55 },
    boots, sole, gloves: { c: hash(seed, 15) < 0.7 ? 0x1d1f23 : 0x3a3f47, r: 0.7 }, palm: { c: 0x4a4e54, r: 0.85 },
    head, hat: head === 'beanie' ? { c: pick(KNITS, seed, 7), r: 0.95 } : { c: pick(CAPS, seed, 7), r: 0.85 },
    hair: { c: pick(tone >= 4 ? HAIR_DARK : HAIR_FAIR, seed, 2), r: 0.9 },
    lens: { c: pick(LENSES, seed, 8), r: 0.08 }, frame: { c: 0x141518, r: 0.4 }
  };
}

/** A sailor's body for a person, in their kit (kitFor), on the eleven bones. */
export function buildBody(p: Person, jacket: number, seed: number): Body {
  return buildArtBody(p, kitFor(seed, jacket));
}
