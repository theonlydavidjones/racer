import { HALF, V, clamp, segPt, type Vec, hypot } from '../core/math';

interface Hull extends Vec { h: number }
interface Moving extends Vec { vx: number; vy: number }

/** A hull's bow and stern, and the unit vector along her heading, as last worked out for her (x, y, h): every pair she's
 * in asks for them each step, and they're the same numbers each time until she moves. */
interface Ends { x: number; y: number; h: number; u: Vec; e: [Vec, Vec] }
const endsMemo = new WeakMap<object, Ends>();
function endsOf(b: Hull): Ends {
  // (her x, y and heading read once: the boats don't all share one hidden class, and V8 hands each such read of a
  // fractional number back boxed, an allocation)
  const x = b.x, y = b.y, h = b.h;
  let m = endsMemo.get(b);
  if (m && m.x === x && m.y === y && m.h === h) return m;
  const u = V(h);
  m = { x, y, h, u, e: [{ x: x + u.x * HALF, y: y + u.y * HALF }, { x: x - u.x * HALF, y: y - u.y * HALF }] };
  endsMemo.set(b, m);
  return m;
}
const ends = (b: Hull): [Vec, Vec] => endsOf(b).e;

/** Gap between two hulls, each modelled as a bow-to-stern segment (0 if the segments cross: one hull through the other). */
const side = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); // (hullGap's, out here: not a closure made each call)
export function hullGap(A: Hull, B: Hull): number {
  const [p1, p2] = ends(A), [q1, q2] = ends(B);
  if (side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0) return 0;
  return Math.min(segPt(p1, q1, q2), segPt(p2, q1, q2), segPt(q1, p1, p2), segPt(q2, p1, p2));
}

/** Closest point of approach over the next 12 s: time (s) and distance between centres (m). */
export function cpa(A: Moving, B: Moving): { t: number; d: number } {
  const rx = B.x - A.x, ry = B.y - A.y, ux = B.vx - A.vx, uy = B.vy - A.vy, uu = ux * ux + uy * uy;
  const t = clamp(uu > 1e-4 ? -(rx * ux + ry * uy) / uu : 0, 0, 12);
  return { t, d: hypot(rx + ux * t, ry + uy * t) };
}

/** A is clear astern of B: A's bow is behind a line abeam from B's stern. (RRS Definitions: Clear Astern.) */
export function clearAstern(A: Hull, B: Hull): boolean {
  const eb = endsOf(B), u = eb.u, sbx = eb.x - u.x * HALF, sby = eb.y - u.y * HALF; // (her x and y from the ends just worked out: the same numbers, read once)
  const ea = endsOf(A), ua = ea.u, abx = ea.x + ua.x * HALF, aby = ea.y + ua.y * HALF;
  return (abx - sbx) * u.x + (aby - sby) * u.y < 0;
}
