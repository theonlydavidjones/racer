// The navigator's plotted course at the helm (the owner, r253: Nav followed the rhumb line, not the plotted course):
// the plan's corners, which one she's making next, and when a corner's made. The World steers by it (world.ts
// planTarget); the page keeps the same count, from its copy of the race, to know when to plan afresh (navigator.ts
// HelmFeed).
import { LOA, dist, dot, segPt, sub, type Vec } from '../core/math';
import { landAlong, onLand, wharfNearest } from '../geo/shore';

/** A corner counts as made within NAV_MADE m of it, about four of her lengths (a pilot steering for a point turns for the
 * next a little before it, as a navigator calling the marks does), with the way to the next clear; or once she's past
 * it (across the line square to the leg through it) and the way on is clear. An estimate (docs/CONSTANTS.md). */
export const NAV_MADE = 30;
/** How far the helm keeps her off the Wharf's piers, the East Bay's and the bridges' (geo/shore.ts wharfNearest): the
 * router's own clearance for them (router.ts WHARF_CLEAR). The marinas' docks and breakwaters aren't among them: the
 * pilot hands her over off a harbor's mouth (World.navTarget). */
export const STRUCTURE_CLEAR = 20;
/** The narrowest gap between structures the pilot takes her through: her turning room, about three of her lengths
 * across at sailing speed (an estimate: her 9 m turn, world.ts navTarget, a little over). Narrower, Nav hands her over
 * before it with its alarm (the Coordinator, 19 Nov 2026: only a gap truly narrower than her turning room; the ~45 m
 * gap at the Berkeley Pier's deck end is wider, and the owner has sailed a Folkboat through it without trouble). */
export const GAP_MIN = 3 * LOA;
/** How far ahead of a gap too narrow Nav hands her over (m): time to take the helm and choose. */
export const GAP_WARN = 150;

export interface HelmPlan {
  to: Vec; pts: Vec[]; i: number;
  /** Where a leg passes through a gap narrower than GAP_MIN: the leg's end corner's index, and the point. */
  tight: { leg: number; p: Vec }[];
}

/** A plan picked up where she is: at the leg she's nearest. Its corners kept off the structures where they can be. */
export function helmPlan(to: Vec, pts: Vec[], at: Vec): HelmPlan | null {
  if (pts.length < 2) return null;
  let i = 1, best = Infinity;
  for (let k = 1; k < pts.length; k++) { const e = segPt(at, pts[k - 1], pts[k]); if (e < best) { best = e; i = k; } }
  const out = pts.map(p => ({ x: p.x, y: p.y }));
  for (let k = 1; k < out.length - 1; k++) out[k] = clearOf(out[k], out[k - 1], out[k + 1]);
  const tight: HelmPlan['tight'] = [];
  for (let k = 1; k < out.length; k++) { const p = narrowOn(out[k - 1], out[k]); if (p) tight.push({ leg: k, p }); }
  return { to: { x: to.x, y: to.y }, pts: out, i, tight };
}

/**
 * A corner of the plan moved out to STRUCTURE_CLEAR from a pier, wharf or breakwater it's nearer than that to (along the
 * way out from it), if it then lies in open water with the legs to it and from it clear of the land; else where the
 * router put it. The plan's track may round one closer (the router lets a line begun near one keep near it): laying a
 * corner 10 m off the abandoned Berkeley Pier's west tip close-hauled, her leeway and the tide set her onto it (Deep
 * Physics' soak, 18 Nov 2026). Moved without those checks, one in 30 near the Wharf landed on land or across a pier
 * (the physics review).
 */
function clearOf(p: Vec, prev: Vec, next: Vec): Vec {
  let q = { x: p.x, y: p.y };
  for (let k = 0; k < 3; k++) { const r = wharfNearest(q, STRUCTURE_CLEAR); if (!r || r.d <= 0) break; q = { x: q.x + r.n.x * (STRUCTURE_CLEAR - r.d + 0.5), y: q.y + r.n.y * (STRUCTURE_CLEAR - r.d + 0.5) }; }
  if (q.x === p.x && q.y === p.y) return q;
  const ok = !onLand(q) && !(wharfNearest(q, 0.5)) && landAlong(prev, q) === Infinity && landAlong(q, next) === Infinity;
  return ok ? q : { x: p.x, y: p.y };
}

/** Where the leg a→b passes between two structures (or a structure and the land) less than GAP_MIN apart, if it does:
 * at each 5 m along it near a structure, what's solid within GAP_MIN in GAP_DIRS directions, and a pair on opposite sides
 * (150–210° apart) nearer together than GAP_MIN. (Along the normal from the nearest alone, it missed a gap between two
 * pier ends in line; at 30° apart the rays missed a 4 m pier seen end on half the time: the physics reviews, 19 Nov
 * 2026; at 10°, missed 0.3% or less, with no false alarms along one face.) */
const GAP_DIRS = 36, DIRS = Array.from({ length: GAP_DIRS }, (_, k) => ({ x: Math.sin(2 * k * Math.PI / GAP_DIRS), y: Math.cos(2 * k * Math.PI / GAP_DIRS) }));
/** The opposite-side pairs: 150° to 210° apart, in steps of the rays'. */
const PAIR_LO = Math.round(GAP_DIRS * 150 / 360), PAIR_HI = Math.round(GAP_DIRS * 210 / 360);
function narrowOn(a: Vec, b: Vec): Vec | null {
  const L = dist(a, b), n = Math.max(1, Math.ceil(L / 5));
  for (let k = 1; k <= n; k++) {
    const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n };
    if (!wharfNearest(p, GAP_MIN)) continue;
    const d = DIRS.map(u => landAlong(p, { x: p.x + u.x * GAP_MIN, y: p.y + u.y * GAP_MIN }));
    const hit = (i: number) => ({ x: p.x + DIRS[i].x * d[i], y: p.y + DIRS[i].y * d[i] });
    // (on opposite sides: the line between the two hits passes by her, not along one face off to one side, as two rays
    // 150° apart both meeting one long pier do)
    for (let i = 0; i < GAP_DIRS; i++) for (let j = i + PAIR_LO; j <= i + PAIR_HI; j++) { const jj = j % GAP_DIRS; if (d[i] + d[jj] < GAP_MIN && segPt(p, hit(i), hit(jj)) < 0.15 * Math.min(d[i], d[jj])) return p; }
  }
  return null;
}

/** The corners she's made, counted on from P.i; then the next one to steer for, or `end` on the last leg. */
export function nextCorner(P: HelmPlan, b: Vec, end: Vec): Vec {
  const n = P.pts.length;
  while (P.i < n - 1) {
    const q = P.pts[P.i], o = P.pts[P.i - 1], next = P.i + 1 < n - 1 ? P.pts[P.i + 1] : end, last = P.i + 1 >= n - 1;
    // (made: past it, or within NAV_MADE of it, with the way to the next one clear: turning early mustn't cut inside a
    // corner the plan put there for the land or a pier, nor turn for the next across a pier's end when she's abeam of it)
    if ((dot(sub(b, q), sub(q, o)) > 0 || dist(b, q) < NAV_MADE) && clearTo(b, next, last)) P.i++; else break;
  }
  return P.i >= n - 1 ? end : P.pts[P.i];
}
/** She's past the corner she's steering for, but the way on isn't clear: the plan's to be worked out afresh from where
 * she is (HelmFeed), not that corner, astern now, steered for till the next plan comes (the physics review: she circled
 * 5 minutes off Pier 45). */
export function heldPast(P: HelmPlan, b: Vec): boolean {
  if (P.i >= P.pts.length - 1) return false;
  const q = P.pts[P.i], o = P.pts[P.i - 1];
  return dot(sub(b, q), sub(q, o)) > 0;
}

/**
 * The way from her to a point clear of the land and of the structures by STRUCTURE_CLEAR, as the router judges a line
 * (router.ts clear): not where she is, nor the last STRUCTURE_CLEAR by the destination (which may itself be by one), and
 * a point near a structure fails only if it's nearer than she already is (beside one, the way off it isn't refused:
 * refused, she circled beside Pier 45's head, the physics review, 19 Nov 2026).
 */
function clearTo(b: Vec, q: Vec, toEnd: boolean): boolean {
  if (landAlong(b, q) !== Infinity) return false;
  const L = dist(b, q), n = Math.max(1, Math.ceil(L / 5)), w0 = wharfNearest(b, STRUCTURE_CLEAR)?.d ?? STRUCTURE_CLEAR;
  for (let k = 1; k <= n; k++) {
    if (toEnd && L * (1 - k / n) < STRUCTURE_CLEAR) break;
    const p = { x: b.x + (q.x - b.x) * k / n, y: b.y + (q.y - b.y) * k / n }, r = wharfNearest(p, STRUCTURE_CLEAR);
    if (r && r.d < Math.min(STRUCTURE_CLEAR, w0 - 2)) return false;
  }
  return true;
}
/** A gap too narrow for the pilot on the leg she's on, or the next, within GAP_WARN of her (World.planTarget hands her
 * over before it). */
export function narrowAhead(P: HelmPlan, b: Vec): boolean {
  return P.tight.some(t => {
    if (!(t.leg === P.i || t.leg === P.i + 1) || dist(b, t.p) >= GAP_WARN) return false;
    const o = P.pts[t.leg - 1], q = P.pts[t.leg]; // (ahead of her along its leg: not one astern she's sailed through)
    return dot(sub(t.p, b), sub(q, o)) > 0;
  });
}
/**
 * The way from her to a corner (or her destination) open enough for the pilot to steer it as the plan has it, without
 * a way round of its own (World.planTarget, autopilot.ts navHeading): clear of the land along it and LAND_SIDE either side,
 * and, as the router judges a line beside a structure (router.ts clear), nowhere along it nearer a structure than
 * STRUCTURE_CLEAR / 2 or than she already is. (Trusted on any clear centre line, it ran her along Pier 45's head; refused
 * off a leg begun beside one, her own way round turned her into it: the physics review, 19 Nov 2026.)
 */
export function legOpen(b: Vec, q: Vec): boolean {
  const L = dist(b, q); if (L < 1) return true;
  const ux = (q.x - b.x) / L, uy = (q.y - b.y) / L;
  for (const s of [0, LAND_SIDE, -LAND_SIDE]) if (landAlong({ x: b.x - uy * s, y: b.y + ux * s }, { x: q.x - uy * s, y: q.y + ux * s }) !== Infinity) return false;
  const n = Math.max(1, Math.ceil(L / 5)), w0 = wharfNearest(b, STRUCTURE_CLEAR / 2)?.d ?? STRUCTURE_CLEAR / 2, keep = Math.min(STRUCTURE_CLEAR / 2, w0 - 1);
  for (let k = 1; k <= n; k++) { const p = { x: b.x + (q.x - b.x) * k / n, y: b.y + (q.y - b.y) * k / n }, r = wharfNearest(p, STRUCTURE_CLEAR / 2); if (r && r.d < keep) return false; }
  return true;
}
/** How far either side of an open leg the land must be clear too (m): about her length (the pilot's own way round looked
 * 25 m either side; an estimate). */
const LAND_SIDE = 8;
/** How far she is off the leg she's on (m). */
export const offLeg = (P: HelmPlan, b: Vec) => segPt(b, P.pts[Math.max(0, P.i - 1)], P.pts[Math.min(P.pts.length - 1, P.i)]);
