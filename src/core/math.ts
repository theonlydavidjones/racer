/** Shared units, constants and 2D vector helpers.
 * Local frame: metres, x east, y north. Headings and bearings are compass degrees (0 = north, clockwise). */

export const KT = 0.5144; // m/s per knot
export const LOA = 7.64; // Folkboat length overall, m
export const HALF = LOA / 2;
export const ZONE = 3 * LOA; // RRS zone: three hull lengths
export const D2R = Math.PI / 180;

export interface Vec { x: number; y: number }

/** Wrap an angle to [-180, 180). */
export const wrap = (a: number): number => ((a + 180) % 360 + 360) % 360 - 180;
/** Normalize an angle to [0, 360). */
export const n360 = (a: number): number => ((a % 360) + 360) % 360;
/** Unit vector pointing along compass heading h. */
export const V = (h: number): Vec => ({ x: Math.sin(h * D2R), y: Math.cos(h * D2R) });
/** Compass bearing of the vector (dx, dy). */
export const brg = (dx: number, dy: number): number => n360(Math.atan2(dx, dy) / D2R);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const unit = (v: Vec): Vec => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export function inPoly(p: Vec, poly: Vec[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Distance from point p to segment ab. */
export function segPt(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t);
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
export const markDist = (q: Vec, mk: { p: Vec; reach?: number[] }): number => Math.max(0, Math.hypot(q.x - mk.p.x, q.y - mk.p.y) - markReach(mk, q));
