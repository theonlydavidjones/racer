import { HALF, V, clamp, segPt, type Vec } from '../core/math';

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

/** Gap between two hulls, each modelled as a bow-to-stern segment (0 if the segments cross: one hull through the other). */
export function hullGap(A: Hull, B: Hull): number {
  const [p1, p2] = ends(A), [q1, q2] = ends(B);
  const side = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0) return 0;
  return Math.min(segPt(p1, q1, q2), segPt(p2, q1, q2), segPt(q1, p1, p2), segPt(q2, p1, p2));
}

/** A hull's bow (x1, y1) and stern (x2, y2) at (x, y) on heading h, as endsOf works them out: into `out` from `k`
 * (boat/arcs.ts keeps her own path's ends so, worked out once for every boat judged against it). */
export function hullEndsInto(x: number, y: number, h: number, out: Float64Array, k: number): void {
  const u = V(h);
  out[k] = x + u.x * HALF; out[k + 1] = y + u.y * HALF; out[k + 2] = x - u.x * HALF; out[k + 3] = y - u.y * HALF;
}
/** hullGap with A's ends given as numbers (hullEndsInto's, from `k`): the same arithmetic, nothing made. */
export function hullGapEnds(E: Float64Array, k: number, B: Hull): number {
  const p1x = E[k], p1y = E[k + 1], p2x = E[k + 2], p2y = E[k + 3], [q1, q2] = ends(B);
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (side(p1x, p1y, p2x, p2y, q1.x, q1.y) * side(p1x, p1y, p2x, p2y, q2.x, q2.y) < 0 && side(q1.x, q1.y, q2.x, q2.y, p1x, p1y) * side(q1.x, q1.y, q2.x, q2.y, p2x, p2y) < 0) return 0;
  return Math.min(segXY(p1x, p1y, q1.x, q1.y, q2.x, q2.y), segXY(p2x, p2y, q1.x, q1.y, q2.x, q2.y), segXY(q1.x, q1.y, p1x, p1y, p2x, p2y), segXY(q2.x, q2.y, p1x, p1y, p2x, p2y));
}
/** core/math.ts segPt on numbers: the same arithmetic. */
function segXY(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return Math.hypot(px - ax - abx * t, py - ay - aby * t);
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
