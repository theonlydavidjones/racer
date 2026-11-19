// The navigator's plotted course at the helm (the owner, r253: Nav followed the rhumb line, not the plotted course):
// the plan's corners, which one she's making next, and when a corner's made. The World steers by it (world.ts
// planTarget); the page keeps the same count, from its copy of the race, to know when to plan afresh (app.ts navPlanTick).
import { dist, dot, segPt, sub, type Vec } from '../core/math';
import { landAlong, wharfNearest } from '../geo/shore';

/** A corner counts as made within NAV_MADE m of it, about four of her lengths (a pilot steering for a point turns for the
 * next a little before it, as a navigator calling the marks does), with the way to the next clear of the land; or once
 * she's past it (across the line square to the leg through it). An estimate (docs/CONSTANTS.md). */
export const NAV_MADE = 30;

export interface HelmPlan { to: Vec; pts: Vec[]; i: number }

/** A plan picked up where she is: at the leg she's nearest. */
export function helmPlan(to: Vec, pts: Vec[], at: Vec): HelmPlan | null {
  if (pts.length < 2) return null;
  let i = 1, best = Infinity;
  for (let k = 1; k < pts.length; k++) { const e = segPt(at, pts[k - 1], pts[k]); if (e < best) { best = e; i = k; } }
  return { to: { x: to.x, y: to.y }, pts: pts.map(p => ({ x: p.x, y: p.y })), i };
}

/** The corners she's made, counted on from P.i; then the next one to steer for, or `end` on the last leg. */
export function nextCorner(P: HelmPlan, b: Vec, end: Vec): Vec {
  const n = P.pts.length;
  while (P.i < n - 1) {
    const q = P.pts[P.i], o = P.pts[P.i - 1], next = P.i + 1 < n - 1 ? P.pts[P.i + 1] : end;
    // (made: past it, or within NAV_MADE of it with the way to the next one clear: turning early mustn't cut inside a
    // corner the plan put there to clear the land)
    if (dot(sub(b, q), sub(q, o)) > 0 || (dist(b, q) < NAV_MADE && clearTo(b, next))) P.i++; else break;
  }
  return P.i >= n - 1 ? end : P.pts[P.i];
}

/** The way from her to a point clear of the land and, by STRUCTURE_CLEAR, of the piers, wharves and breakwaters (the
 * router keeps that much off them: a turn made early that cut inside a corner the plan put there for the abandoned
 * Berkeley Pier ran her onto its west end, Deep Physics' soak cases, 18 Nov 2026). */
const STRUCTURE_CLEAR = 20;
function clearTo(b: Vec, q: Vec): boolean {
  if (landAlong(b, q) !== Infinity) return false;
  const L = dist(b, q), n = Math.max(1, Math.ceil(L / 5));
  for (let k = 0; k <= n; k++) { const p = { x: b.x + (q.x - b.x) * k / n, y: b.y + (q.y - b.y) * k / n }; if (wharfNearest(p, STRUCTURE_CLEAR)) return false; }
  return true;
}
/** How far she is off the leg she's on (m). */
export const offLeg = (P: HelmPlan, b: Vec) => segPt(b, P.pts[Math.max(0, P.i - 1)], P.pts[Math.min(P.pts.length - 1, P.i)]);
