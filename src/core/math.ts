/** Shared units, constants and 2D vector helpers.
 * Local frame: metres, x east, y north. Headings and bearings are compass degrees (0 = north, clockwise). */

export const KT = 0.5144; // m/s per knot
export const LOA = 7.64; // Folkboat length overall, m
export const HALF = LOA / 2;
export const ZONE = 3 * LOA; // RRS zone: three hull lengths
export const D2R = Math.PI / 180;

export interface Vec { x: number; y: number }

/**
 * ((t % 360) + 360) % 360, the same to the last bit, without the double `%` (a call to C's fmod) for |t| < 360, where
 * every angle in the step lands: there t % 360 is t itself, u = t + 360 (rounded as before) lies in [0, 720], and u % 360
 * is u below 360, u − 360 (exact) from 360, and 0 at 720 itself (Capacity, 16 Nov 2026: 0 mismatches over 2·10⁷ inputs,
 * every value within 64 ulps of a multiple of 180 included; docs/CAPACITY.md §8c).
 */
const mod360 = (t: number): number => {
  if (t > -360 && t < 360) { const u = t + 360; return u < 360 ? u : u < 720 ? u - 360 : 0; }
  return (t % 360 + 360) % 360;
};
/** Wrap an angle to [-180, 180). */
export const wrap = (a: number): number => mod360(a + 180) - 180;
/** Normalize an angle to [0, 360). */
export const n360 = (a: number): number => mod360(a);
/** Eases angle `from` toward `to` (degrees) by the fraction k, the shorter way round, the result kept in [0, 360). */
export const easeAngle = (from: number, to: number, k: number): number => n360(from + wrap(to - from) * k);
/** Unit vector pointing along compass heading h. */
export const V = (h: number): Vec => ({ x: Math.sin(h * D2R), y: Math.cos(h * D2R) });
/** Compass bearing of the vector (dx, dy). */
export const brg = (dx: number, dy: number): number => n360(Math.atan2(dx, dy) / D2R);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
/**
 * Math.hypot for two numbers, as V8 works it out (its MathHypot builtin: NaN and Infinity first, then the squares of
 * each over the larger magnitude summed with Kahan's compensation, the root times it back), in the same operations in
 * the same order, so the same result to the last bit (checked against Math.hypot on 2·10⁷ random pairs and the edge
 * cases: ±0, subnormals, the largest doubles, ±Infinity, NaN). The builtin allocates a scratch array and a boxed result
 * every call, a couple of thousand times a step; this allocates nothing, and inlines (docs/CAPACITY.md §8a).
 */
export function hypot(x: number, y: number): number {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (x !== x || y !== y) return ax === Infinity || ay === Infinity ? Infinity : NaN;
  const max = ax > ay ? ax : ay;
  if (max === Infinity) return Infinity;
  if (max === 0) return 0;
  let sum = 0, comp = 0;
  let n = ax / max, summand = n * n - comp, pre = sum + summand; comp = (pre - sum) - summand; sum = pre;
  n = ay / max; summand = n * n - comp; pre = sum + summand; sum = pre;
  return Math.sqrt(sum) * max;
}
export const unit = (v: Vec): Vec => { const l = hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Vec, b: Vec): number => hypot(a.x - b.x, a.y - b.y);

export function inPoly(p: Vec, poly: Vec[]): boolean {
  // (p's coordinates read once: p comes as many kinds of object (a boat, her bow, a plain point), and V8 hands each such
  // read of a fractional number back boxed, an allocation, so a read per vertex was one too. The same comparisons)
  const px = p.x, py = p.y;
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Distance from point p to segment ab. */
export function segPt(p: Vec, a: Vec, b: Vec): number {
  const px = p.x, py = p.y, ax = a.x, ay = a.y, abx = b.x - ax, aby = b.y - ay; // (each read once: inPoly)
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return hypot(px - ax - abx * t, py - ay - aby * t);
}

/** True if segments p1p2 and q1q2 properly intersect. */
export function segCross(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
  const d = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p1, p2, q1) * d(p1, p2, q2) < 0 && d(q1, q2, p1) * d(q1, q2, p2) < 0;
}

/**
 * Distance from a point to a mark's edge. A buoy is a point; an island mark (Alcatraz) carries `reach`: how far its
 * shore runs out from the mark's position, in 36 ten-degree sectors (bearing from the mark).
 */
export function markReach(mk: { p: Vec; reach?: number[] }, q: Vec): number {
  if (!mk.reach) return 0;
  const b = (Math.atan2(q.x - mk.p.x, q.y - mk.p.y) * 180 / Math.PI + 360) % 360, i = Math.floor(b / 10) % 36, f = b / 10 - Math.floor(b / 10);
  return mk.reach[i] * (1 - f) + mk.reach[(i + 1) % 36] * f;
}
export const markDist = (q: Vec, mk: { p: Vec; reach?: number[] }): number => Math.max(0, hypot(q.x - mk.p.x, q.y - mk.p.y) - markReach(mk, q));
