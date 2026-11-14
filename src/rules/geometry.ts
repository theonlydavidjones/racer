import { HALF, LOA, V, clamp, segPt, type Vec } from '../core/math';
import { halfBeam, zAt } from '../boat/hullPlan';

interface Hull extends Vec { h: number }
interface Moving extends Vec { vx: number; vy: number }

/** A hull's bow and stern, and the unit vector along her heading, as last worked out for her (x, y, h): every pair she's
 * in asks for them each step, and they're the same numbers each time until she moves. */
interface Ends { x: number; y: number; h: number; u: Vec; e: [Vec, Vec] }
const endsMemo = new WeakMap<object, Ends>();
function endsOf(b: Hull): Ends {
  let m = endsMemo.get(b);
  if (m && m.x === b.x && m.y === b.y && m.h === b.h) return m;
  const u = V(b.h);
  m = { x: b.x, y: b.y, h: b.h, u, e: [{ x: b.x + u.x * HALF, y: b.y + u.y * HALF }, { x: b.x - u.x * HALF, y: b.y - u.y * HALF }] };
  endsMemo.set(b, m);
  return m;
}
const ends = (b: Hull): [Vec, Vec] => endsOf(b).e;

/** Gap between the hulls' centerlines, bow point to stern point (0 if they cross). */
function lineGap(A: Hull, B: Hull): number {
  const [p1, p2] = ends(A), [q1, q2] = ends(B);
  const side = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0) return 0;
  return Math.min(segPt(p1, q1, q2), segPt(p2, q1, q2), segPt(q1, p1, p2), segPt(q2, p1, p2));
}

/**
 * Her outline in plan at the sheer, the widest she is above the water (her topsides flare, so that's where hulls meet):
 * the deck's half-breadths from the class's construction plan (boat/hullPlan.ts), stem round to transom and back, as
 * (forward, starboard) offsets from her center, m. Closer stations at the bow, where the deck line curves most; none in the
 * first 0.4 m, where the deck line is a hair hollow, so the outline is convex (tests/hull-contact.test.ts) and a gap
 * between two is a convex-polygon distance (the hollow is under a millimeter).
 */
const PLAN_U = [0.05, 0.09, 0.14, 0.2, 0.27, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.93, 1];
export const OUTLINE: ReadonlyArray<{ f: number; s: number }> = [
  { f: -zAt(0), s: 0 },
  ...PLAN_U.map(u => ({ f: -zAt(u), s: halfBeam(u) })),
  ...PLAN_U.slice().reverse().map(u => ({ f: -zAt(u), s: -halfBeam(u) })),
];
const NV = OUTLINE.length;
/** The widest she is either side of her centerline, m. */
const MAX_HB = Math.max(...OUTLINE.map(p => p.s));
const OF = Float64Array.from(OUTLINE, o => o.f), OS = Float64Array.from(OUTLINE, o => o.s);
/** Beyond this apart by the centerlines (two lengths, and both half-breadths), the outlines aren't measured: the
 * centerline gap less both half-breadths is under the true gap, and already more than any distance the rules judge by
 * (two lengths, rule 17 and the tangle's "engaged", is the furthest). */
const MEASURE_WITHIN = 2 * LOA + 2 * MAX_HB;

/** Her corner furthest in the world direction (dx, dy): its world position into `out` at offset `k`. */
function support(b: Hull, u: Vec, dx: number, dy: number, out: Float64Array, k: number) {
  // (in her frame: forward along u, starboard along u turned 90° clockwise, (u.y, −u.x))
  const df = dx * u.x + dy * u.y, ds = dx * u.y - dy * u.x;
  let bi = 0, bv = -Infinity;
  for (let i = 0; i < NV; i++) { const v = OF[i] * df + OS[i] * ds; if (v > bv) { bv = v; bi = i; } }
  out[k] = b.x + u.x * OF[bi] + u.y * OS[bi]; out[k + 1] = b.y + u.y * OF[bi] - u.x * OS[bi];
}

// The simplex GJK keeps: up to three points of the Minkowski difference A − B (w), each with the corners of A and B it
// came from, for the nearest points. (Module scratch: hullGap runs thousands of times a second and allocates nothing.)
const SW = new Float64Array(6), SA = new Float64Array(6), SB = new Float64Array(6), PA = new Float64Array(2), PB = new Float64Array(2);
const LAM = new Float64Array(3);
let NS = 0;
const TW = new Float64Array(4), TA = new Float64Array(4), TB = new Float64Array(4);
/** Keep simplex points i (and j), in that order, at the front (copied through scratch: j may be 0). */
function keep(i: number, j = -1) {
  NS = j < 0 ? 1 : 2;
  for (let q = 0; q < NS; q++) { const r = q === 0 ? i : j; TW[2 * q] = SW[2 * r]; TW[2 * q + 1] = SW[2 * r + 1]; TA[2 * q] = SA[2 * r]; TA[2 * q + 1] = SA[2 * r + 1]; TB[2 * q] = SB[2 * r]; TB[2 * q + 1] = SB[2 * r + 1]; }
  for (let q = 0; q < 2 * NS; q++) { SW[q] = TW[q]; SA[q] = TA[q]; SB[q] = TB[q]; }
}
/** The point of segment (i, j) of the simplex nearest the origin: its barycentric weight on j. */
function segT(i: number, j: number): number {
  const ax = SW[2 * i], ay = SW[2 * i + 1], ex = SW[2 * j] - ax, ey = SW[2 * j + 1] - ay, ee = ex * ex + ey * ey;
  return ee > 1e-18 ? clamp(-(ax * ex + ay * ey) / ee, 0, 1) : 0;
}
/** Reduce the simplex to the feature nearest the origin, its weights into LAM; false if the origin is inside (overlap). */
function nearest(): boolean {
  if (NS === 1) { LAM[0] = 1; return true; }
  if (NS === 2) {
    const t = segT(0, 1);
    if (t <= 0) { keep(0); LAM[0] = 1; } else if (t >= 1) { keep(1); LAM[0] = 1; } else { LAM[0] = 1 - t; LAM[1] = t; }
    return true;
  }
  // a triangle: the origin inside it means the hulls overlap
  const c01 = SW[0] * SW[3] - SW[1] * SW[2], c12 = SW[2] * SW[5] - SW[3] * SW[4], c20 = SW[4] * SW[1] - SW[5] * SW[0];
  if ((c01 >= 0 && c12 >= 0 && c20 >= 0) || (c01 <= 0 && c12 <= 0 && c20 <= 0)) return false;
  // else the nearest of its three edges (0-1, 1-2, 2-0)
  let bi = 0, bj = 1, bt = 0, bd = Infinity;
  for (let e = 0; e < 3; e++) {
    const i = e, j = e === 2 ? 0 : e + 1;
    const t = segT(i, j), x = SW[2 * i] + (SW[2 * j] - SW[2 * i]) * t, y = SW[2 * i + 1] + (SW[2 * j + 1] - SW[2 * i + 1]) * t, d = x * x + y * y;
    if (d < bd) { bd = d; bi = i; bj = j; bt = t; }
  }
  if (bt <= 0) { keep(bi); LAM[0] = 1; } else if (bt >= 1) { keep(bj); LAM[0] = 1; } else { keep(bi, bj); LAM[0] = 1 - bt; LAM[1] = bt; }
  return true;
}

/**
 * The gap between two hulls' outlines (0 if they overlap), and the nearest point of each into PA and PB: GJK (Gilbert,
 * Johnson and Keerthi 1988), the distance between two convex shapes from their support points, a few dozen sums a call.
 */
function gjk(A: Hull, B: Hull): number {
  const uA = endsOf(A).u, uB = endsOf(B).u;
  // start from the centers' difference
  let vx = A.x - B.x, vy = A.y - B.y;
  if (vx * vx + vy * vy < 1e-12) { vx = 1e-6; vy = 0; }
  NS = 0;
  for (let it = 0; it < 32; it++) {
    // the support of A − B toward the origin (direction −v): A's furthest toward −v, B's furthest toward +v
    support(A, uA, -vx, -vy, SA, 2 * NS); support(B, uB, vx, vy, SB, 2 * NS);
    const wx = SA[2 * NS] - SB[2 * NS], wy = SA[2 * NS + 1] - SB[2 * NS + 1], vv = vx * vx + vy * vy;
    // no point of A − B further toward the origin than v: v is the nearest (within a tenth of a millimeter)
    if (it > 0 && vv - (vx * wx + vy * wy) <= 1e-8 + 1e-6 * vv) break;
    SW[2 * NS] = wx; SW[2 * NS + 1] = wy; NS++;
    if (!nearest()) { PA[0] = A.x; PA[1] = A.y; PB[0] = B.x; PB[1] = B.y; return 0; }
    let nx = 0, ny = 0;
    for (let q = 0; q < NS; q++) { nx += LAM[q] * SW[2 * q]; ny += LAM[q] * SW[2 * q + 1]; }
    vx = nx; vy = ny;
    if (vx * vx + vy * vy < 1e-14) { PA[0] = A.x; PA[1] = A.y; PB[0] = B.x; PB[1] = B.y; return 0; }
  }
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let q = 0; q < NS; q++) { ax += LAM[q] * SA[2 * q]; ay += LAM[q] * SA[2 * q + 1]; bx += LAM[q] * SB[2 * q]; by += LAM[q] * SB[2 * q + 1]; }
  PA[0] = ax; PA[1] = ay; PB[0] = bx; PB[1] = by;
  return Math.sqrt(vx * vx + vy * vy);
}

/** Where two hulls come closest: the gap between their outlines (0 if they overlap), the nearest point on each, and
 * the unit normal from A's toward B's. For an overlap it gives no depth: the two centers as the points and the normal
 * from A's center toward B's, mostly fore and aft for a glancing overlap along her length (a contact response wanting
 * the overlap's own normal needs more: EPA, the expanding polytope). */
export interface HullContact { gap: number; a: Vec; b: Vec; n: Vec }
export function hullContact(A: Hull, B: Hull): HullContact {
  const gap = gjk(A, B);
  let nx = PB[0] - PA[0], ny = PB[1] - PA[1], nl = Math.sqrt(nx * nx + ny * ny);
  if (gap === 0 || nl < 1e-9) { nx = B.x - A.x; ny = B.y - A.y; nl = Math.sqrt(nx * nx + ny * ny) || 1; }
  return { gap, a: { x: PA[0], y: PA[1] }, b: { x: PB[0], y: PB[1] }, n: { x: nx / nl, y: ny / nl } };
}

/**
 * Gap between two hulls, m: between their outlines in plan (0 if they overlap), hull to hull, so a bow into a stern
 * touches when it really does. (Every rules distance is set in this measure: rules/pairs.ts, docs/HULL-CONTACT.md.)
 */
export function hullGap(A: Hull, B: Hull): number {
  const g = lineGap(A, B);
  return g < MEASURE_WITHIN ? gjk(A, B) : g - 2 * MAX_HB;
}

/** Closest point of approach over the next 12 s: time (s) and distance between centres (m). */
export function cpa(A: Moving, B: Moving): { t: number; d: number } {
  const rx = B.x - A.x, ry = B.y - A.y, ux = B.vx - A.vx, uy = B.vy - A.vy, uu = ux * ux + uy * uy;
  const t = clamp(uu > 1e-4 ? -(rx * ux + ry * uy) / uu : 0, 0, 12);
  return { t, d: Math.hypot(rx + ux * t, ry + uy * t) };
}

/** A is clear astern of B: A's bow is behind a line abeam from B's stern. (RRS Definitions: Clear Astern.) */
export function clearAstern(A: Hull, B: Hull): boolean {
  const u = endsOf(B).u, sbx = B.x - u.x * HALF, sby = B.y - u.y * HALF;
  const ua = endsOf(A).u, abx = A.x + ua.x * HALF, aby = A.y + ua.y * HALF;
  return (abx - sbx) * u.x + (aby - sby) * u.y < 0;
}
