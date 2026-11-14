import './three-setup';
import * as THREE from 'three';
import type { Person } from '../boat/crewPhys';
import { warmDay, type DayWind } from '../environment/air';

/**
 * A sailor's body: one skinned mesh on fifteen bones (hips, spine, head, shoulders, elbows, wrists, hips, knees, ankles), so a person is
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
/** (`foot` and `hand`: the ankles' and wrists' bones, at the ends of the shins and forearms, for setting a foot flat on
 * the deck and a hand's angle at the wrist: render/crew.ts) */
export interface Body { root: THREE.Group; torso: THREE.Bone; head: THREE.Bone; arm: [Limb, Limb]; leg: [Limb, Limb]; foot: [THREE.Bone, THREE.Bone]; hand: [THREE.Bone, THREE.Bone]; scale: number; mesh: THREE.SkinnedMesh }

type V3 = THREE.Vector3;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Bone indices, in the skeleton's order (below). */
const HIPS = 0, SPINE = 1, HEAD = 2, SH = [3, 5], EL = [4, 6], HP = [7, 9], KN = [8, 10], ANK = [11, 12], WR = [13, 14];
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
  constructor(base: Mat[] = []) { base.forEach(m => this.slot(m)); }
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
/** How finely round things are divided, for the level of detail being built (1 near, less far off: buildArtBody). */
let SEG = 1;
const around = (n0: number, a = 0, b = Math.PI * 2, open = false) => { const n = Math.max(open ? 3 : 4, Math.round(n0 * SEG)); return Array.from({ length: n }, (_, i) => a + (b - a) * i / (open ? n - 1 : n)); };

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
  /** wraparound sunglasses, or round everyday glasses (the owner's photo, reference/photos/josephine-vang-to-mast-base.jpg) */
  eyes?: 'shades' | 'specs';
  /** a small badge on the cap's front, and a maker's logo on the jacket's chest (their colours) */
  badge?: Mat; logo?: Mat;
  /** shorts and sneakers (a warm, dry day: the owner's photo) instead of salopettes and sea boots; `boots`/`sole` are
   * then the sneakers' upper and sole, `pants` the shorts */
  shorts?: boolean;
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
  },
  { // D, E: the owner's photo of Josephine's crew on the foredeck (reference/photos/josephine-vang-to-mast-base.jpg): a
    // navy sailing jacket with its hood stowed in the collar, a navy inflatable, a black cap with a badge and sunglasses;
    name: 'D', skin: SKIN.light,
    jacket: { c: 0x1c2c4c, r: 0.42 }, yoke: { c: 0x16213a, r: 0.5 }, trim: { c: 0x15181c, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: 0x23272e, r: 0.5 }, patch: { c: 0x16181c, r: 0.7 },
    pfd: 'inflatable', pfdBody: { c: 0x22325a, r: 0.6 }, pfdTrim: { c: 0x2e8fbf, r: 0.55 },
    boots: { c: 0x1c1e21, r: 0.35 }, sole: { c: 0x8c9094, r: 0.8 }, gloves: { c: 0x1d1f23, r: 0.7 }, palm: { c: 0x4a4e54, r: 0.85 },
    head: 'cap', hat: { c: 0x18191c, r: 0.85 }, hair: { c: 0x8a6a3e, r: 0.9 },
    lens: { c: 0x2c3846, r: 0.08 }, frame: { c: 0x141518, r: 0.4 }, badge: { c: 0xd8611f, r: 0.7 }, logo: { c: 0xd8d8d2, r: 0.6 }
  },
  { // and a charcoal jacket, an orange inflatable harness, a navy cap and round everyday glasses
    name: 'E', skin: SKIN.fair,
    jacket: { c: 0x2e3238, r: 0.45 }, yoke: { c: 0x23262b, r: 0.5 }, trim: { c: 0x15181c, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: 0x1c1e22, r: 0.5 }, patch: { c: 0x141619, r: 0.7 },
    pfd: 'inflatable', pfdBody: { c: 0xd8611f, r: 0.6 }, pfdTrim: { c: 0x1a1c20, r: 0.55 },
    boots: { c: 0x1c1e21, r: 0.35 }, sole: { c: 0xd8d8d2, r: 0.8 }, gloves: { c: 0x1d1f23, r: 0.7 }, palm: { c: 0x4a4e54, r: 0.85 },
    head: 'cap', hat: { c: 0x1f2c48, r: 0.85 }, hair: { c: 0xb89466, r: 0.9 },
    eyes: 'specs', lens: { c: 0x6f7f8c, r: 0.06 }, frame: { c: 0x18191c, r: 0.4 }, badge: { c: 0xe8e4d8, r: 0.7 }, logo: { c: 0xd8d8d2, r: 0.6 }
  },
  { // F: the photo's helm on a warm, dry day: the navy jacket and inflatable, maroon shorts, white sneakers
    name: 'F', skin: SKIN.light,
    jacket: { c: 0x1c2c4c, r: 0.42 }, yoke: { c: 0x16213a, r: 0.5 }, trim: { c: 0x15181c, r: 0.55 }, tape: { c: 0xb9bcbf, r: 0.35 },
    pants: { c: 0x6a2a32, r: 0.85 }, patch: { c: 0x4a1e24, r: 0.85 }, shorts: true,
    pfd: 'inflatable', pfdBody: { c: 0x22325a, r: 0.6 }, pfdTrim: { c: 0x2e8fbf, r: 0.55 },
    boots: { c: 0xe9e8e2, r: 0.6 }, sole: { c: 0xdedcd4, r: 0.85 }, gloves: { c: 0x1d1f23, r: 0.7 }, palm: { c: 0x4a4e54, r: 0.85 },
    head: 'cap', hat: { c: 0x18191c, r: 0.85 }, hair: { c: 0x8a6a3e, r: 0.9 },
    lens: { c: 0x2c3846, r: 0.08 }, frame: { c: 0x141518, r: 0.4 }, badge: { c: 0xd8611f, r: 0.7 }, logo: { c: 0xd8d8d2, r: 0.6 }
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
  [-0.1, 0.173, 0.127, 0.143, 0.012, 2.3], // (the hem, hanging loose over the seat and the tops of the thighs)
  [-0.05, 0.166, 0.122, 0.137, 0.01, 2.4],
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
  [0.0, 0.07, 0.084, 0.094, 0.006, 2, -0.014], // (under the jacket's hem, merging into the seat: inside the jacket's sides)
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
/** A bare leg below a pair of shorts (centred on the hip joint, as LEG_P): the knee, the calf's swell behind, the shin,
 * a slim ankle (an adult's: about 11 cm across the knee, 12 the calf, 7 the ankle). */
const SHIN_P = profile([
  [-0.3, 0.06, 0.066, 0.06, -0.004, 2, -0.006],
  [-0.38, 0.051, 0.058, 0.05, -0.004, 2, -0.008],
  [-0.43, 0.047, 0.056, 0.046, -0.002, 2.1, -0.009], // the knee, the kneecap in front
  [-0.48, 0.046, 0.046, 0.053, 0.004, 2, -0.008],
  [-0.55, 0.05, 0.043, 0.062, 0.009, 2, -0.005], // the calf
  [-0.64, 0.042, 0.04, 0.048, 0.006, 2, -0.002],
  [-0.74, 0.033, 0.034, 0.036, 0.004, 2, 0.0],
  [-0.84, 0.03, 0.03, 0.032, 0.004, 2, 0.0] // the ankle
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
/** Two sets of weights mixed, `t` of the second. */
const mixW = (a: W, b: W, t: number): W => t <= 0 ? a : t >= 1 ? b : [...a.map(([i, x]) => [i, x * (1 - t)] as [number, number]), ...b.map(([i, x]) => [i, x * t] as [number, number])];
/** The jacket: as the torso, but its front below the waist rides partly with the thighs, so sitting down it comes up onto
 * the lap (the hem's front lies on the thighs) instead of hanging straight down through them. */
const wJacket = (p: V3): W => {
  // (the point of the shoulder rides partly with the arm: raised, the jacket's shoulder lifts with it instead of the
  // sleeve's head pulling away from it)
  const sh = 0.35 * ss(0.38, 0.46, p.y) * ss(0.13, 0.185, Math.abs(p.x));
  if (sh > 0) return mixW(wTorso(p), [[SH[p.x > 0 ? 1 : 0], 1]], sh);
  const f = 0.6 * ss(0.03, -0.1, p.y) * Math.min(1, Math.max(0, (-p.z - 0.02) / 0.1));
  if (f <= 0) return wTorso(p);
  const t = ss(-0.04, 0.04, p.x); // (the left thigh's, the right's, half each down the middle)
  return mixW(wTorso(p), [[HP[0], 1 - t], [HP[1], t]], f);
};
const wArm = (i: number) => (p: V3): W => {
  if (p.y <= 0.42) return blend(EL[i], SH[i], ss(0.13, 0.21, p.y));
  // (the sleeve's head: its inner, upper side, toward the neck, shares the spine's weight; its underside, the armpit,
  // stays with the arm)
  const xs = i ? 1 : -1, inward = Math.min(1, Math.max(0, (xs * 0.2 - p.x) * xs / 0.06));
  return blend(SH[i], SPINE, 0.6 * ss(0.42, 0.51, p.y) * (0.35 + 0.65 * inward));
};
// (the sleeve's head shares the spine's weight toward the top, so a raised arm stretches the shoulder rather than lifting
// the sleeve's head clear of the jacket)
const wLeg = (i: number) => (p: V3): W => {
  const w = p.y > -0.02 ? blend(HP[i], HIPS, ss(-0.02, 0.06, p.y)) : blend(KN[i], HP[i], ss(-0.47, -0.39, p.y));
  // (the back of the thigh's top, the buttock, stays with the hips: sitting, the thigh swings up in front of it rather
  // than folding the seat into a lump at the hip)
  const k = 0.5 * Math.min(1, Math.max(0, p.z / 0.08)) * ss(-0.18, -0.05, p.y);
  return mixW(w, [[HIPS, 1]], k);
};

/** One surface through rings, in material regions: each region its own piece (its own vertices along the seam), so a
 * colour stops at the seam the way a panel of cloth does, with no overlay and no smear. `parts`: [first ring, material]. */
function loftParts(M: Mesh, rings: V3[][], parts: [number, Mat][], o: Omit<PieceOpt, 'mat'>): void {
  parts.forEach(([a, mat], k) => {
    const b = k + 1 < parts.length ? parts[k + 1][0] : rings.length - 1;
    loft(M, rings.slice(a, b + 1), { ...o, mat, capStart: !!o.capStart && k === 0, capEnd: !!o.capEnd && k === parts.length - 1, shade: o.shade ? (q, r, j) => o.shade!(q, r < 0 ? r : r + a, j) : undefined });
  });
}

/** The materials a kit uses, in a fixed order (the palette's texels). */
const BUCKLE: Mat = { c: 0x6c7076, r: 0.3 }, LABEL: Mat = { c: 0x6a665f, r: 0.9 };
const kitMats = (k: Kit): Mat[] => [skinMat(k.skin), k.jacket, k.yoke, k.trim, k.tape, k.pants, k.patch, k.pfdBody, k.pfdTrim, k.boots, k.sole, k.gloves, k.palm, k.hat, k.hair, k.lens, k.frame, BUCKLE, LABEL, ...(k.badge ? [k.badge] : []), ...(k.logo ? [k.logo] : [])];

/** A person's geometry, garment by garment, in the bones' rest pose; `seg` how finely round things are divided. */
function bodyMesh(kit: Kit, g: number, seg: number): Mesh {
  SEG = seg;
  const M = new Mesh(kitMats(kit));
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
    const wAnk = (q: V3): W => blend(KN[i], ANK[i], ss(-0.8, -0.88, q.y));
    if (kit.shorts) {
      // shorts to just above the knee, a little loose, their hem turned; the bare leg below; low sneakers
      const sy = [0.0, -0.08, -0.16, -0.24, -0.3, -0.33];
      const sh = sy.map(y => ring(LEG_P(y), 14, 0.008 * ss(-0.08, -0.3, y), cx)).map((r, k) => drape(r, 0.004 * ss(-0.2, -0.33, sy[k]), 4, 0.9 + i)); // (as the trousers under the jacket's hem, a little looser lower down)
      sh.push(drape(ring(LEG_P(-0.33), 14, -0.004, cx), 0.004, 4, 0.9 + i).map(q => q.setY(-0.335)), ring(LEG_P(-0.3), 14, -0.01, cx));
      loft(M, sh, { mat: kit.pants, w: wLeg(i), shade: (_q, r) => r >= sy.length ? 0.4 : 1 });
      const ly = [-0.3, -0.36, -0.4, -0.43, -0.46, -0.5, -0.55, -0.6, -0.66, -0.72, -0.78, -0.82, -0.85];
      loft(M, rings(SHIN_P, ly, 12, 0, cx), { mat: skinMat(kit.skin), w: (q: V3) => q.y < -0.8 ? wAnk(q) : wLeg(i)(q) });
      // a white sock's cuff showing above the shoe
      loft(M, [-0.83, -0.855, -0.875].map(y => ring([y, 0.033, 0.034, 0.036, 0.004, 2], 12, 0.003, cx)), { mat: { c: 0xe6e5df, r: 0.9 }, w: wAnk });
    } else {
    const ys = [0.0, -0.08, -0.18, -0.28, -0.36, -0.43, -0.48, -0.54, -0.6, -0.64, -0.675, -0.705, -0.73, -0.745];
    const leg = rings(LEG_P, ys, 14, 0, cx).map((r, k) => drape(r, 0.0035 * ss(-0.58, -0.745, ys[k]) * (0.6 + 0.4 * Math.sin(ys[k] * 95)), 4, 1.3 + i + 3 * ys[k])); // (bunched folds above the boot)
    // (the cuff turns in: its inside, in shade)
    leg.push(drape(ring(LEG_P(-0.745), 14, -0.008, cx), 0.004, 4, 1.3 + i).map(q => q.setY(-0.75)), ring(LEG_P(-0.7), 14, -0.012, cx));
    loft(M, leg, { mat: kit.pants, w: wLeg(i), shade: (_q, r) => r >= ys.length ? 0.4 : 1 });
    loft(M, rings(LEG_P, [-0.35, -0.39, -0.43, -0.47, -0.51], 7, 0.004, cx, 0, FRONT - 0.95, FRONT + 0.95, true), { mat: kit.patch, w: wLeg(i), wrap: false }); // the knee's patch
    // ——— the sea boots: a shaft up under the trousers, the foot, a sole with a little lip
    // (the ankle's joint at the shin's end, 0.86 below the hips: the boot's shaft bends there, the foot and sole move with it)
    loft(M, [-0.66, -0.76, -0.82, -0.85, -0.875].map(y => ring([y, 0.046, 0.051, 0.054, 0.006, 2.2], 12, 0, cx)), { mat: kit.boots, w: wAnk });
    }
    // (sneakers: the same last, lower and a little slimmer; a sea boot's foot otherwise)
    const foot: [z: number, rx: number, yt: number, yb: number, yc: number][] = [
      [0.078, 0.03, 0.028, 0.028, -0.886], [0.064, 0.044, 0.052, 0.036, -0.884], [0.02, 0.049, 0.06, 0.04, -0.882], [-0.05, 0.052, 0.042, 0.034, -0.89],
      [-0.12, 0.052, 0.03, 0.031, -0.894], [-0.175, 0.046, 0.023, 0.028, -0.897], [-0.205, 0.033, 0.017, 0.024, -0.899], [-0.215, 0.014, 0.01, 0.016, -0.9]
    ];
    const fx = cx + xs * 0.006;
    loft(M, foot.map(f => around(10).map(th => { const c = Math.cos(th), sn = Math.sin(th); const lo = kit.shorts ? 0.82 : 1, nw = kit.shorts ? 0.94 : 1; return V(fx + f[1] * nw * spow(c, 0.8), f[4] + (sn > 0 ? f[2] * lo : f[3]) * spow(sn, 0.8), f[0]); })), { mat: kit.boots, w: () => [[ANK[i], 1]], capStart: true, capEnd: true });
    const sole = [[0.082, 0.032], [0.06, 0.05], [0.0, 0.054], [-0.1, 0.058], [-0.17, 0.052], [-0.205, 0.038], [-0.219, 0.018]];
    loft(M, sole.map(([z, rx]) => around(10).map(th => V(fx + rx * spow(Math.cos(th), 0.6), -0.917 + 0.011 * spow(Math.sin(th), 0.6), z))), { mat: kit.sole, w: () => [[ANK[i], 1]], capStart: true, capEnd: true });
  }

  // ——— the jacket: a drawcord band at the hem, the body, the shoulders in a darker reinforcement, a collar zipped to
  // the chin with a reflective band, sleeves, cuffs, the zip's storm flap
  {
    const ys = [-0.105, -0.095, -0.075, -0.03, 0.02, 0.08, 0.16, 0.25, 0.32, 0.38, 0.4, 0.425, 0.455, 0.48, 0.503, 0.523, 0.54];
    const body = rings(JACKET_P, ys, 24).map((r, k) => drape(r, 0.004 * ss(0.03, -0.1, ys[k]), 5, 0.7));
    body.unshift(drape(ring(JACKET_P(-0.1), 24, -0.01), 0.004, 5, 0.7).map(q => q.setY(-0.08))); // (the hem turned up inside)
    loftParts(M, body, [[0, kit.trim], [3, kit.jacket], [11, kit.yoke]], { w: wJacket, shade: (_q, r) => r === 0 ? 0.45 : 1 });
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
  if (kit.head !== 'hood') {
    // the hood down, rolled and stowed in the back of the collar (as in the owner's photo): a soft roll round the back
    // of the neck from one side of the collar to the other, sitting on the yoke
    const path = range(0.55, Math.PI - 0.55, 9).map(th => { const q = onRow(COL_P(0.56), th, 0.016, 0, 0, g, g); q.y = 0.548 + 0.012 * Math.sin(th); return q; });
    sweep(M, path, { mat: kit.jacket, w: () => [[SPINE, 1]], a: t => 0.008 + 0.018 * Math.sin(Math.PI * t), b: t => 0.006 + 0.014 * Math.sin(Math.PI * t), out: q => V(q.x, 0.4, q.z), n: 8, lift: 0.5 }); // (tapering into the collar at its ends)
  }
  if (kit.logo) {
    // the maker's logo on the left of the chest: a small flat mark on the jacket (no real maker's)
    // (out beside the life jacket's lobe, below the yoke)
    const r = JACKET_P(0.33), th = FRONT - 0.85, q = onRow(r, th, 0.003, 0, 0, g, g);
    box(M, q, V(0.018, 0.007, 0.0012), kit.logo, wJacket(q), Math.atan2(Math.cos(th), Math.sin(th))); // (turned to lie on the chest there)
  }
  {
    const path = range(-0.095, 0.5, 10).map(y => onRow(JACKET_P(y), FRONT, 0.002, 0, 0, g, g));
    for (const f of [0.3, 0.7, 0.97]) { const r = colRing(f, 0.002); path.push(r[Math.round(r.length * 0.75) % r.length]); } // (its front)
    sweep(M, path, { mat: kit.trim, w: wJacket, a: () => 0.011, b: () => 0.0035, out: () => V(0, 0, -1), n: 4, lift: 0.6, sq: 4 });
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
    // (the wrist's joint at the forearm's end: the glove's cuff bends there with the sleeve's, the hand moves with it)
    const wWr = (q: V3): W => blend(WR[i], EL[i], ss(-0.105, -0.07, q.y));
    loft(M, hand.map(h => hring(h)), { mat: kit.gloves, w: wWr, capEnd: true });
    const palm = inward > 0 ? 0 : Math.PI;
    loft(M, hand.slice(1, 6).map(h => hring(h, 0.002, palm - 0.9, palm + 0.9, true, 6)), { mat: kit.palm, w: wWr, wrap: false });
    sweep(M, [V(cx + inward * 0.012, -0.1, -0.03), V(cx + inward * 0.016, -0.13, -0.046), V(cx + inward * 0.02, -0.158, -0.05), V(cx + inward * 0.024, -0.176, -0.043)], {
      mat: kit.gloves, w: wWr, a: t => 0.014 - 0.003 * t, b: t => 0.012 - 0.002 * t, out: () => V(0, 0, -1), lift: 0, n: 8
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
    box(M, V(0, 0.19, (JACKET_P(0.19)[4]! - JACKET_P(0.19)[2]) * g - 0.009), V(0.022, 0.018, 0.006), BUCKLE, [[SPINE, 1]]);
  } else {
    // a foam vest: front and back panels over the jacket, narrowed to straps over the shoulders and round the arms
    const VEST_X = (y: number) => Math.min(JACKET_P(y)[1] + 0.02, 0.19 - 0.6 * Math.max(0, y - 0.33));
    const vrow = (y: number): Row => { const r = JACKET_P(Math.min(0.53, y)); return [y, VEST_X(y), r[2] + 0.022, r[3] + 0.02, r[4], 2.6]; };
    const vy = [0.08, 0.1, 0.16, 0.24, 0.31, 0.36, 0.41, 0.45, 0.49, 0.515];
    const vr = vy.map(y => ring(vrow(y), 24));
    vr.unshift(ring([0.1, VEST_X(0.1) - 0.016, JACKET_P(0.1)[2] + 0.004, JACKET_P(0.1)[3] + 0.004, 0, 2.6], 24));
    vr.push(ring([0.512, 0.088, 0.086, 0.082, 0.004, 2.2], 24));
    loft(M, vr, { mat: kit.pfdBody, w: wJacket });
    // its black side panels and zip, a buckled strap at the waist, reflective patches high on the chest
    for (const xs of [-1, 1]) loft(M, [0.11, 0.18, 0.26, 0.33].map(y => around(6, xs > 0 ? -0.55 : Math.PI - 0.55, xs > 0 ? 0.55 : Math.PI + 0.55, true).map(th => onRow(vrow(y), th, 0.003, 0, 0, g, g))), { mat: kit.pfdTrim, w: wTorso, wrap: false });
    sweep(M, range(0.1, 0.5, 8).map(y => onRow(vrow(y), FRONT, 0, 0, 0, g, g)), { mat: kit.trim, w: wTorso, a: () => 0.008, b: () => 0.003, out: () => V(0, 0, -1), n: 4, sq: 4 });
    const yb = 0.15;
    sweep(M, around(20).map(th => onRow(vrow(yb), th, 0.003, 0, 0, g, g)), { mat: kit.trim, w: wTorso, a: () => 0.013, b: () => 0.003, out: q => V(q.x, 0, q.z), closed: true, n: 4, sq: 4 });
    box(M, V(0, yb, (vrow(yb)[4]! - vrow(yb)[2]) * g - 0.008), V(0.02, 0.014, 0.006), BUCKLE, [[SPINE, 1]]);
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
  const nh = Math.round(26 * SEG), hth = Array.from({ length: nh }, (_, k) => FRONT + Math.PI * spow(2 * k / nh - 1, 1.7));
  loft(M, hy.map(y => hth.map(th => { const q = headAt(y, th), n = nose(y, th); q.x += n * Math.cos(th); q.z += n * Math.sin(th); return up(q); })), { mat: skin, w: wHead, capEnd: true });
  // the ears
  if (kit.head !== 'hood') for (const xs of [-1, 1]) blob(M, V(xs * 0.076, HY + 0.124, 0.006), V(0.01, 0.027, 0.017), skin, [[HEAD, 1]], 8, 5, new THREE.Euler(0, xs * 0.3, 0));
  if (kit.eyes === 'specs') {
    // round everyday glasses: two round lenses on a thin frame, a bridge over the nose, arms back over the ears; the
    // lenses lightly tinted and glossy (they show the sky, not the eyes behind: the face stays plain)
    for (const xs of [-1, 1]) {
      const th0 = FRONT + xs * 0.36, c = up(headAt(0.138, th0, 0.016)); c.y = HY + 0.138;
      const n = V(Math.cos(th0), 0, Math.sin(th0)), t = V(-n.z, 0, n.x), R = 0.0215;
      const rim = around(14).map(a => c.clone().addScaledVector(t, R * Math.cos(a)).add(V(0, R * Math.sin(a), 0)));
      loft(M, [rim.map(q => q.clone().addScaledVector(n, -0.001)), rim.map(q => c.clone().lerp(q, 0.0001))], { mat: kit.lens, w: () => [[HEAD, 1]], shade: () => 1.15 });
      sweep(M, rim, { mat: kit.frame, w: () => [[HEAD, 1]], a: () => 0.0018, b: () => 0.002, out: () => n.clone(), closed: true, n: 4, lift: 0 });
      const temple = [c.clone().addScaledVector(t, xs > 0 ? R : -R).multiplyScalar(1), up(headAt(0.142, FRONT + xs * 1.3, 0.008)), up(headAt(0.142, FRONT + xs * 1.62, 0.006)), up(headAt(0.138, FRONT + xs * 1.95, 0.008))];
      sweep(M, temple, { mat: kit.frame, w: () => [[HEAD, 1]], a: () => 0.0018, b: () => 0.003, out: () => V(0, 1, 0), n: 4, lift: 0 });
    }
    const bl = up(headAt(0.142, FRONT - 0.16, 0.019)), br = up(headAt(0.142, FRONT + 0.16, 0.019)); bl.y = br.y = HY + 0.142;
    sweep(M, [bl, up(headAt(0.146, FRONT, 0.02)).setY(HY + 0.146), br], { mat: kit.frame, w: () => [[HEAD, 1]], a: () => 0.0018, b: () => 0.002, out: q => V(q.x, 0, q.z), n: 4, lift: 0 });
  } else
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
    // a badge on the front panel (a club's or a team's: their colour, no real one)
    if (kit.badge) { const y = band(FRONT) + 0.02, q = up(headAt(y, FRONT, 0.0152)); q.y = HY + y; box(M, q, V(0.012, 0.01, 0.0015), kit.badge, [[HEAD, 1]], 0, -0.2); } // (just above the peak)
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
    { const q = up(headAt(band(FRONT) + 0.022, FRONT, 0.0135)); q.y = HY + band(FRONT) + 0.022; box(M, q, V(0.01, 0.0055, 0.0015), LABEL, [[HEAD, 1]]); } // a small woven label
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

  SEG = 1;
  return M;
}

/** How far off (m) a person is drawn in less detail: past the chase camera's distance (24 m, render/scene.ts), where a
 * figure is a few dozen pixels tall and the coarser one can't be told apart, about half the triangles. */
export const CREW_LOD_M = 32, CREW_LOD_SEG = 0.5;

/** A person: their geometry near and far off (a THREE.LOD), both skinned to one skeleton on the fifteen bones. */
export function buildArtBody(p: Person, kit: Kit): Body & { tris: number; trisFar: number } {
  const s = p.h / 1.75, g = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24)));
  const hx = BONE.hipX * g, sx = BONE.shoulderX * g, HY = BONE.headY;
  const root = new THREE.Group(); root.scale.setScalar(s);
  const B = (parent: THREE.Object3D | null, x: number, y: number, z: number) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent?.add(b); return b; };
  const hips = B(null, 0, 0, 0), spine = B(hips, 0, 0, 0), head = B(spine, 0, HY, 0);
  const sh = [-1, 1].map(q => B(spine, q * sx, BONE.shoulderY, 0)), el = sh.map(b => B(b, 0, -BONE.upper, 0));
  const hp = [-1, 1].map(q => B(hips, q * hx, 0, 0)), kn = hp.map(b => B(b, 0, -BONE.thigh, 0));
  head.rotation.order = 'YXZ';
  const an = kn.map(b => B(b, 0, -BONE.shin, 0)), wr = el.map(b => B(b, 0, -BONE.fore, 0));
  const skeleton = new THREE.Skeleton([hips, spine, head, sh[0], el[0], sh[1], el[1], hp[0], kn[0], hp[1], kn[1], an[0], an[1], wr[0], wr[1]]);
  root.add(hips);
  const near = bodyMesh(kit, g, 1), far = bodyMesh(kit, g, CREW_LOD_SEG), row = paletteRow(near.mats);
  const skinned = (M: Mesh) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(M.P, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(M.UV.map((u, i) => i % 2 ? (row + 0.5) / ATLAS_ROWS : u), 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(M.C, 3));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(M.SI, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(M.SW, 4));
    geom.setIndex(M.I); geom.computeVertexNormals();
    const mesh = new THREE.SkinnedMesh(geom, bodyMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };
  const lod = new THREE.LOD(), mesh = skinned(near), meshFar = skinned(far);
  lod.addLevel(mesh, 0); lod.addLevel(meshFar, CREW_LOD_M); root.add(lod);
  root.updateMatrixWorld(true); mesh.bind(skeleton); meshFar.bind(skeleton);
  return { root, torso: spine, head, arm: [{ root: sh[0], mid: el[0] }, { root: sh[1], mid: el[1] }], leg: [{ root: hp[0], mid: kn[0] }, { root: hp[1], mid: kn[1] }], foot: [an[0], an[1]], hand: [wr[0], wr[1]], scale: s, mesh, tris: near.tris, trisFar: far.tris };
}

/**
 * The crew's palette: one texture for everyone (a row of texels per kit, one texel per material: colour, and roughness
 * in a second texture), so all the crew share one material and two small textures however many boats there are. A kit
 * seen before (a boat's crew are the same race to race) reuses its row.
 */
const ATLAS_ROWS = 512;
const atlasCol = new Uint8Array(PAL_W * ATLAS_ROWS * 4), atlasRough = new Uint8Array(PAL_W * ATLAS_ROWS * 4), rowOf = new Map<string, number>();
const atlasTex = (a: Uint8Array) => { const t = new THREE.DataTexture(a, PAL_W, ATLAS_ROWS, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
let BODY_MAT: THREE.MeshStandardMaterial | null = null;
function bodyMaterial(): THREE.MeshStandardMaterial {
  return BODY_MAT ??= new THREE.MeshStandardMaterial({ map: atlasTex(atlasCol), roughnessMap: atlasTex(atlasRough), roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
}
function paletteRow(mats: Mat[]): number {
  const key = mats.map(m => `${m.c}:${m.r}`).join(',');
  let row = rowOf.get(key);
  if (row != null) return row;
  // (full: start again from the top. Only after hundreds of different kits, long after the races that used the first rows)
  if (rowOf.size >= ATLAS_ROWS) rowOf.clear();
  row = rowOf.size; rowOf.set(key, row);
  mats.forEach((m, i) => {
    const c = new THREE.Color(m.c), o = (row! * PAL_W + i) * 4;
    atlasCol.set([c.r * 255, c.g * 255, c.b * 255, 255], o);
    atlasRough.set([0, m.r * 255, 0, 255], o);
  });
  const mat = bodyMaterial(); mat.map!.needsUpdate = true; mat.roughnessMap!.needsUpdate = true;
  return row;
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
const COVERS = [0x1e2942, 0x1a1c20, 0xa8262a, 0x3a3f47, 0x23324f, 0xd8611f, 0xd8611f]; // (orange as often as any two: the owner's photo)
const VESTS = [0xd24a22, 0xc8372d, 0xd4a017, 0x1f3456, 0x23272e, 0x2b6f86];
const TRIMS = [0xd8a514, 0xd24a22, 0x2e8fbf, 0x8fc93a, 0xb9bcbf];
const BOOTS: [Mat, Mat][] = [[{ c: 0x1c1e21, r: 0.35 }, { c: 0x8c9094, r: 0.8 }], [{ c: 0x464b52, r: 0.4 }, { c: 0x1c1e21, r: 0.8 }], [{ c: 0x5b3a22, r: 0.55 }, { c: 0x2a2420, r: 0.8 }], [{ c: 0x1e2942, r: 0.4 }, { c: 0xb0b3b6, r: 0.8 }]];
/** Caps (a white one kept a little grey: under the sky's light it would read as pure white), and knit beanies. */
const CAPS = [0x1f2c48, 0xb7b5ad, 0xa8262a, 0x2a303c, 0xb9a88a, 0x2b4f8a, 0x18191c, 0x18191c]; // (black as often as any two: the owner's photo)
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
/** What the figures being built now are dressed for (set for each boat as it's built: render/boatMesh.ts): `warm`, a
 * warm, dry day's kit or not (dressWarm; 'all', everyone in shorts, for checking the kit: the crew lab's ?summer=all);
 * `wet`, the rain at the gun (environment/rain.ts: 1 light, 2 heavy; the crew lab's ?wet=1, ?wet=2). */
export const dress: { warm: boolean | 'all'; wet: 0 | 1 | 2 } = { warm: false, wet: 0 };
/** Whitecaps at Beaufort force 5, a fresh breeze (17 kt, 8.75 m/s at 10 m), the first force whose sea state the scale
 * gives "chance of some spray": the same whitecap formula as environment/sea.ts (Monahan & O'Muircheartaigh 1980,
 * W = 3.84e-6·U^3.41). And chop steeper than about 1 in 14 (H/L 0.07: sea.ts's `steep`), short and steep, which throws
 * it aboard in less wind (wind against the tide). */
const SPRAY_WHITE = 3.84e-6 * Math.pow(8.75, 3.41), SPRAY_STEEP = 0.07;
/**
 * What a crew dresses for at the dock, for the day (the owner, 13 Nov 2026): shorts and sneakers for about half of
 * them on a warm day where she is (68 °F, 20 °C, or more in the racing hours: environment/air.ts warmDay, from the shore
 * stations round the Bay, blended by distance: their record, the forecast or their climate, and on a climate-only day
 * the day's wind, `wind`: air.ts dayWindOf) that's dry (no rain at the gun: environment/rain.ts, the record's or the one
 * set) and where they won't be soaked (the sea where she is: no whitecaps of a fresh breeze, no steep chop). Decided
 * once, as she's built for the race: nobody changes clothes mid-race.
 */
export function dressWarm(date: string, rain: number, sea?: { white: number; steep: number }, at?: { x: number; y: number }, wind?: DayWind): boolean {
  if (!date || rain > 0) return false;
  if (sea && (sea.white >= SPRAY_WHITE || sea.steep >= SPRAY_STEEP)) return false;
  return warmDay(date, at, wind);
}
/** Shorts in the colours they come in (the owner's photo: maroon), and sneakers: white, or grey and navy. */
const SHORTS = [0x6a2a32, 0x6a2a32, 0x7a3a36, 0xb9a88a, 0xa8946e, 0x2a3346, 0x4a4f57, 0x3f5a3a]; // (maroons and khakis the commonest: they stand out from the dark jackets, as in the photo)
const SNEAKERS: [Mat, Mat][] = [[{ c: 0xe9e8e2, r: 0.6 }, { c: 0xdedcd4, r: 0.85 }], [{ c: 0xe9e8e2, r: 0.6 }, { c: 0x8c6a4a, r: 0.85 }], [{ c: 0x3a3f47, r: 0.6 }, { c: 0xdedcd4, r: 0.85 }], [{ c: 0x1f2c48, r: 0.6 }, { c: 0xe9e8e2, r: 0.85 }]];
export function kitFor(seed: number, team: number, warm: boolean | 'all' = dress.warm): Kit {
  const jc = hash(seed, 10) < 0.5 ? team : pick(TOPS, seed, 11);
  const jacket: Mat = { c: jc, r: 0.42 }, yoke: Mat = { c: hash(seed, 12) < 0.6 ? 0x2c3037 : darker(jc, 0.55), r: 0.5 };
  const pc = hash(seed, 13) < 0.3 ? darker(jc, 0.95) : pick(BIBS, seed, 14);
  const tone = Math.floor(hash(seed, 1) * SKINS.length);
  // (in the rain, the jacket's hood up over the cap: all of them in heavy rain, most in light)
  const head = dress.wet === 2 || (dress.wet === 1 && hash(seed, 24) < 0.7) ? 'hood' as const : (['cap', 'cap', 'cap', 'beanie', 'beanie', 'hood'] as const)[Math.floor(hash(seed, 6) * 6)];
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
    lens: { c: pick(LENSES, seed, 8), r: 0.08 }, frame: { c: 0x141518, r: 0.4 },
    // (a few in everyday glasses instead of sunglasses: a pale tint, a dark or a tortoiseshell frame)
    ...(hash(seed, 16) < 0.25 ? { eyes: 'specs' as const, lens: { c: 0x6f7f8c, r: 0.06 }, frame: { c: hash(seed, 17) < 0.5 ? 0x18191c : 0x4a3424, r: 0.4 } } : {}),
    badge: head !== 'beanie' && hash(seed, 18) < 0.6 ? { c: pick([0xd8611f, 0xe8e4d8, 0xc8372d, 0xd4a017], seed, 19), r: 0.7 } : undefined,
    logo: hash(seed, 20) < 0.6 ? { c: 0xd8d8d2, r: 0.6 } : undefined,
    // (a warm, dry day: about half in shorts and sneakers, as in the owner's photo; the rest keep their salopettes)
    // (never in the rain, the crew lab's ?summer=all too)
    ...(!dress.wet && (warm === 'all' || (warm && hash(seed, 21) < 0.5)) ? (() => { const [up, so] = pick(SNEAKERS, seed, 22), sc = pick(SHORTS, seed, 23); return { shorts: true, pants: { c: sc, r: 0.85 }, patch: { c: darker(sc, 0.7), r: 0.85 }, boots: up, sole: so }; })() : {})
  };
}

/** A sailor's body for a person, in their kit (kitFor), on the fifteen bones. */
export function buildBody(p: Person, jacket: number, seed: number): Body {
  return buildArtBody(p, kitFor(seed, jacket));
}
