// The navigator's plotted course at the helm (the owner, r253: Nav followed the rhumb line, not the plotted course):
// the plan's corners, which one she's making next, and when a corner's made. The World steers by it (world.ts
// planTarget); the page keeps the same count, from its copy of the race, to know when to plan afresh (navigator.ts
// HelmFeed).
import { LOA, V, brg, dist, dot, segPt, sub, wrap, type Vec } from '../core/math';
import { landAlong, onLand, wharfNearest } from '../geo/shore';
import { HANDLING } from '../boat/dynamics';

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

/** Within this of a structure (m), with the way on not open (legOpen), the pilot first takes her off it (wayOff): a
 * pilot engaged with way on beside a pier (the physics review of nav-pier, 19 Nov 2026: a meter or two in from 8 m off
 * Pier 45's head, she was wrecked on it or struck it; ROADMAP 8q7). Half the structures' clearance. */
export const BESIDE = STRUCTURE_CLEAR / 2;
/** How far ahead the way off is looked along (m): about three of her lengths. An estimate (docs/CONSTANTS.md). */
const OFF_LOOK = 3 * LOA;
/** The headings tried for the way off, either side of the way on (deg): every 15°, nearest it first (docs/CONSTANTS.md). */
const OFF_TRY = [0, ...Array.from({ length: 12 }, (_, k) => [15 * (k + 1), -15 * (k + 1)]).flat()];
/** Her turn's radius under sail, the arc she sweeps turning for a way off (m): boat/dynamics.ts HANDLING.turnRadius. */
const OFF_TURN_R = HANDLING.turnRadius;
/** How long she runs on before her turn bites, from the helm amidships (s): the ram takes 2.25 s from there to hard
 * over (autopilot.ts RAM_RATE), so about half that straight before the arc (the second review: the arc without it said
 * 4.3 m and she got 3.4); none with the helm already hard over into the turn, twice it hard over the other way. An
 * estimate (docs/CONSTANTS.md). */
const OFF_LAG_S = 1;
/** Slower than this through the water (m/s), her course held is no way off: she hasn't the way on to hold it past a
 * pier. An estimate (docs/CONSTANTS.md). */
const OFF_SLOW = 1;
/** A turn through the wind she's taken only with this way on (m/s): a Folkboat, 1930 kg under 24 m², wants about 4 kn to carry a tack (the third review: from 3 kn, pinched at 23°
 * apparent, the turn to the other tack stalled her onto the wharf). An estimate (docs/CONSTANTS.md). */
const OFF_TACK = 2;
/** ...and pinched inside her close-hauled angle, a quarter more (m/s): her way already falling off (the third review's start,
 * 2.3 m/s and pinched beside a wharf, stalled in the tack and struck). An estimate (docs/CONSTANTS.md). */
const OFF_TACK_PINCHED = 1.25 * OFF_TACK;
/** What her turn's arc may give up of how far off she is (m), as with way on she can't help a little: a pier face
 * converging on her course closed it 0.6 m in the first 10° of any turn, 8 m off Pier 45's head. Turns that keep that
 * come first; failing those, any that keeps OFF_ARC_MIN, her half-beam and as much again (as the router lets a plan
 * begun beside a pier keep, router.ts clear): held to the first alone, she was handed over 8 m off a wharf with a turn
 * away keeping 5.9 m (the second review). Estimates (docs/CONSTANTS.md). */
const OFF_ARC_GIVE = 2, OFF_ARC_MIN = 3;
/** Failing every way that keeps OFF_ARC_MIN, the turn that keeps her farthest off is taken if it keeps this (m), her
 * half-beam (1.1 m) and a little under a meter, and does better than her course held, as a helmsman luffs off a pier
 * face closing on her rather than let go the helm (the second review: 4 m off Pier 45's face, the turn the pilot began
 * cleared her by 2.4 m; handed over, she struck a meter east). An estimate (docs/CONSTANTS.md). */
const OFF_HULL = 2;
/** Her turn onto heading `h` keeps her hull clear of the structures (turnArc, hullKeep): an open leg is trusted only so
 * (World.offPier). */
export const turnClear = (b: Vec & { h: number; v: number }, h: number, ram = 0) => !!turnArc(b, h, hullKeep(near(b)), ram);
/** The least her turn must keep off a structure she's `d` m off, at the last (m): OFF_HULL, or, nearer than that
 * already, no nearer than she is (the third review: held to OFF_HULL inside it, every turn failed, even the one away). One
 * figure for the gate on an open leg and wayOff's last tier: the gate at 3 m and the tier at 2 refused the leg's turn and
 * then took a tighter one. */
const hullKeep = (d: number) => Math.min(OFF_HULL, d - 0.5);
/** The straight line from `a` to `q` crosses no land, her hull's sides included, and keeps `k` off the structures
 * (OFF_HULL, or what she has if she's nearer than that), every tenth of it. */
export function lineClear(a: Vec, q: Vec, k = Math.min(OFF_HULL, near(a) - 0.5)): boolean {
  if (onLand(q) || landAlong(a, q) !== Infinity) return false;
  const h = brg(q.x - a.x, q.y - a.y);
  for (let j = 1; j <= 10; j++) { const p = { x: a.x + (q.x - a.x) * j / 10, y: a.y + (q.y - a.y) * j / 10 }; if (near(p) < k || sideOnLand(p, h)) return false; }
  return true;
}
/** Land at her side, her half-beam (1.1 m: the 2.20 m beam, NFIA class rules, as ai/ai.ts HALF_BEAM) either side of `p` on heading `h`: the open shore she'd go
 * aground on (the third review: a way off along a wharf, its line clear, put her hull on the shore beside it). */
const HALF_BEAM = 1.1;
/** The least any turn may leave her off a structure (m): her half-beam and 0.3 m. An estimate (docs/CONSTANTS.md). */
const HULL_MIN = HALF_BEAM + 0.3;
const sideOnLand = (p: Vec, h: number) => { const n = V(h + 90); return onLand({ x: p.x + n.x * HALF_BEAM, y: p.y + n.y * HALF_BEAM }) || onLand({ x: p.x - n.x * HALF_BEAM, y: p.y - n.y * HALF_BEAM }); };
/** How near her turn may bring her to a structure she's `d` m off, giving up OFF_ARC_GIVE at most (m). */
export const arcKeep = (d: number) => Math.min(d - 0.5, Math.max(d - OFF_ARC_GIVE, OFF_ARC_MIN));
const near = (p: Vec) => wharfNearest(p, STRUCTURE_CLEAR)?.d ?? STRUCTURE_CLEAR;
/**
 * Her turn from her heading to `h`, the pilot's way (the shorter way round): a run on as the helm comes over (OFF_LAG_S,
 * by where the ram is: −1 turning her hard to starboard, the tiller pushed to port, … +1 hard to port; autopilot.ts), then an arc of OFF_TURN_R, every 10° of
 * it. Where it ends and the least it keeps off the structures, or null if it crosses land or comes within `keep` of one.
 * Stopped, she turns where she is.
 */
export function turnArc(b: Vec & { h: number; v: number }, h: number, keep: number, ram = 0): { e: Vec; least: number } | null {
  const turn = wrap(h - b.h), s = Math.sign(turn) || 1;
  // (stopped, she has no turn: a way off only if she's already as far off as it asks, the third review: judged so
  // regardless, a stopped boat always had one and was held against the wharf, engaged, struck eight times)
  if (b.v <= 0.3) { const d = near(b); return d < keep ? null : { e: { x: b.x, y: b.y }, least: d }; }
  const u0 = V(b.h), run = b.v * OFF_LAG_S * Math.max(0, 1 + s * ram), a = { x: b.x + u0.x * run, y: b.y + u0.y * run };
  // (the run on is hers whatever she does, her course held too: the turn is judged from where it ends, no nearer than
  // that leaves her, and never within HULL_MIN; the third review, 2 m off Pier 45's face: judged from where she was,
  // every turn failed on the run alone and she was handed over, where the turn away cleared her)
  let least = near(a);
  if (onLand(a) || least < HULL_MIN || landAlong(b, a) !== Infinity) return null;
  keep = Math.max(HULL_MIN, Math.min(keep, least - 0.5));
  const c = V(b.h + 90 * s), cx = a.x + c.x * OFF_TURN_R, cy = a.y + c.y * OFF_TURN_R;
  let e: Vec = a;
  for (let th = 10; th < Math.abs(turn) + 10; th += 10) {
    const r = V(b.h + s * Math.min(th, Math.abs(turn)) + 90 * s), p = { x: cx - r.x * OFF_TURN_R, y: cy - r.y * OFF_TURN_R }, d = near(p);
    if (onLand(p) || d < keep || sideOnLand(p, b.h + s * Math.min(th, Math.abs(turn)))) return null;
    least = Math.min(least, d); e = p;
  }
  return { e, least };
}
/**
 * The way off a structure she's beside, as a sailor takes her off before setting a course: a point OFF_LOOK ahead on
 * a heading she reaches by the pilot's turn (turnArc) and then a straight line, along which she comes no nearer any
 * structure than the arc left her, crossing no land, ending farther off (or at BESIDE). Without the turn's arc, a way
 * on astern turned her through the pier she was running along (the physics review, 19 Nov 2026). In order, nearest the
 * way on (toward `to`) first within each: a heading she can sail (outside her close-hauled angle, `from` the wind,
 * `beat` her angle to it) by a turn giving up no more than OFF_ARC_GIVE of her offing; one by a turn keeping
 * OFF_ARC_MIN; her track held, keeping OFF_ARC_MIN; one she can only pinch toward, keeping OFF_ARC_MIN; and the turn
 * keeping her farthest off, if it keeps OFF_HULL (or what she has, nearer) and does better than her track held. None through the wind without OFF_TACK of way on
 * (a pilot can't back a jib). Null when there's none: the pilot then hands her over.
 */
export function wayOff(b: Vec & { h: number; v: number; vx: number; vy: number }, to: Vec, from: number, beat: number, ram = 0): Vec | null {
  const w0 = near(b), base = brg(to.x - b.x, to.y - b.y), keep = w0 - 0.5, give = arcKeep(w0), wind = wrap(from - b.h);
  let sail3: Vec | null = null, pinch3: Vec | null = null, best: { q: Vec; least: number } | null = null;
  for (const a of OFF_TRY) {
    const h = base + a, turn = wrap(h - b.h), s = Math.sign(turn) || 1;
    // (through the wind: not without the way on to carry her round)
    if (Math.sign(wind) === s && Math.abs(wind) < Math.abs(turn) && b.v < (Math.abs(wind) < beat ? OFF_TACK_PINCHED : OFF_TACK)) continue;
    const arc = turnArc(b, h, hullKeep(w0), ram);
    if (!arc) continue;
    const { e } = arc, u = V(h), q = { x: e.x + u.x * OFF_LOOK, y: e.y + u.y * OFF_LOOK };
    if (onLand(q) || landAlong(e, q) !== Infinity) continue;
    // (on from the arc's end, no nearer than it left her, nor than she is)
    const lineKeep = Math.min(keep, near(e) - 0.5);
    let ok = true;
    for (let j = 1; j <= 10 && ok; j++) { const p = { x: e.x + u.x * OFF_LOOK * j / 10, y: e.y + u.y * OFF_LOOK * j / 10 }; if (near(p) < lineKeep || sideOnLand(p, h)) ok = false; }
    if (!ok || near(q) < Math.min(BESIDE, w0 + 2)) continue;
    const sail = Math.abs(wrap(from - h)) >= beat + 5;
    if (sail && arc.least >= give) return q;
    if (arc.least >= OFF_ARC_MIN) { if (sail) sail3 ??= q; else pinch3 ??= q; }
    if (!best || arc.least > best.least) best = { q, least: arc.least };
  }
  if (sail3) return sail3;
  // (her track held, as a sailor slipping past a pier's corner holds on rather than turn. Her track over the ground, not
  // her heading: half a knot of current across it is meters over the look, the second review)
  let held = 0;
  if (b.v >= OFF_SLOW) {
    const g = Math.hypot(b.vx, b.vy), u = g > 0.3 ? { x: b.vx / g, y: b.vy / g } : V(b.h), q = { x: b.x + u.x * OFF_LOOK, y: b.y + u.y * OFF_LOOK };
    if (!onLand(q) && landAlong(b, q) === Infinity) {
      held = Infinity;
      for (let j = 1; j <= 10; j++) held = Math.min(held, near({ x: b.x + u.x * OFF_LOOK * j / 10, y: b.y + u.y * OFF_LOOK * j / 10 }));
      if (held >= OFF_ARC_MIN) return q;
    }
  }
  if (pinch3) return pinch3;
  return best && best.least > held ? best.q : null;
}
