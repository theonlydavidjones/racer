import { V, type Vec } from '../core/math';
import { HARBORS } from '../geo/marina';
import { PILE_PIERS, SHORE } from '../geo/shore';
import { WindSum, bluffDeficit } from './shadows';

/**
 * The lee of the harbors' walls and of the sheds on Fort Mason's piers: the wind is lighter just downwind of them, as
 * in Gashouse Cove (the owner, 13 Nov 2026: sheltered inside the breakwater, the Bay's wind all at once outside).
 *
 * A Folkboat's sails run from her boom, about 1.6 m above the water, to the masthead at 9.5 m, and most of their area is
 * low down: the wind they feel here is the lee's deficit averaged over that height, weighted by the sails' width at
 * each height (two triangles: width ∝ RIG_HI − z). Three kinds of obstacle, each with its own lee:
 *
 * - A breakwater: a solid fence of height h. Its far lee is Perera's fence model (Perera 1981, J. Wind Eng. Ind.
 *   Aerodyn. 8:93–104, as the WAsP shelter model uses it): ΔU/U = 9.75·(h/x)·η·exp(−0.67·η^1.5), η = (z/h)·(K·x/h)^−0.47,
 *   K = 2κ²/ln(h/z0), with κ = 0.4 and z0 = 0.0002 m over open water (the Charnock roughness of a moderate sea). The
 *   deficit peaks near the fence's height and fades with x as 1/x; the sheltered layer deepens as x^0.47. Closer than
 *   5 h (the recirculating bubble, where the model doesn't hold) it's held at its 5 h value. (The 9.75 confirmed by a
 *   search of the WAsP literature; the form of η as the physics review had it, not read from Perera's paper.)
 * - A seawall with the land behind it a few meters up: a step down to the water, not a fence. The flow off its edge
 *   reattaches 6–10 step heights on (a backward-facing step: Westphal, Johnston & Eaton 1984, NASA CR-3765, 7–10 h), it
 *   isn't thrown up, so the sheltered layer stays about 1.2 h deep, and with no form drag there's no long far wake: 70%
 *   slower below 1.2 h to 7 h, fading out by 15 h (the review's reading; not measured for these walls).
 * - A shed on a pier: a bluff body (shadows.ts bluffDeficit, as the ships' and the bridge piers' are: Hosker's cavity,
 *   then the deficit fading as (x/H)^−1.5, after Woo, Peterka & Cermak 1977), from its lee face, across its width. The
 *   sheds stand 13–17 m: the whole rig is in their wake.
 *
 * Heights: the sheds' from OpenStreetMap (geo/data/pile-piers.json). The walls' aren't published where we could reach:
 * WALL_H, 2.5 m above the water, is read off the owner's photos of Gashouse Cove's (an estimate, for every harbor's alike,
 * and at one tide: the water rises and falls about 1.8 m against it).
 */
export const WALL_H = 2.5;
/** The rig's span above the water (m): the boom's foot to the masthead. */
const RIG_LO = 1.6, RIG_HI = 9.5;
/** Heights up the rig to average over, and the sails' width at each (the weights). */
const ZS = Array.from({ length: 12 }, (_, i) => RIG_LO + (i + 0.5) * (RIG_HI - RIG_LO) / 12), WS = ZS.map(z => RIG_HI - z), WSUM = WS.reduce((a, b) => a + b, 0);
/** Perera's K for a fence h high over open water (z0 = 0.0002 m). */
const kFence = (h: number) => 2 * 0.4 * 0.4 / Math.log(h / 0.0002);

/** The rig-averaged deficit x m behind a solid fence h high (Perera, above): read off a table for the walls' own height
 * (every boat asks for every wall piece near her, every step), worked out exactly for any other. */
export function fenceDeficit(x: number, h: number): number {
  if (h !== WALL_H) return fenceDeficitExact(x, h);
  const f = Math.max(0, x) / FENCE_DX, i = Math.floor(f);
  if (i >= FENCE_TAB.length - 1) return fenceDeficitExact(x, h);
  return FENCE_TAB[i] + (FENCE_TAB[i + 1] - FENCE_TAB[i]) * (f - i);
}
function fenceDeficitExact(x: number, h: number): number {
  const xx = Math.max(5 * h, x), s = Math.pow(kFence(h) * xx / h, -0.47);
  let d = 0;
  for (let i = 0; i < ZS.length; i++) { const eta = ZS[i] / h * s; d += WS[i] * 9.75 * (h / xx) * eta * Math.exp(-0.67 * Math.pow(eta, 1.5)); }
  return Math.min(0.7, d / WSUM);
}
const FENCE_DX = 0.5, FENCE_TAB = Float64Array.from({ length: Math.ceil(80 * WALL_H / FENCE_DX) + 2 }, (_, i) => fenceDeficitExact(i * FENCE_DX, WALL_H));
/** The rig-averaged deficit x m behind a step h high (above). */
export function stepDeficit(x: number, h: number): number {
  if (x <= 0) return 0;
  const top = 1.2 * h; let share = 0;
  for (let i = 0; i < ZS.length; i++) if (ZS[i] < top) share += WS[i];
  share /= WSUM;
  return 0.7 * share * (x < 7 * h ? 1 : Math.max(0, 1 - (x - 7 * h) / (8 * h)));
}

type Kind = 'fence' | 'step' | 'shed';
interface Body { kind: Kind; pts: Vec[]; H: number; box: { x0: number; x1: number; y0: number; y1: number }; /** the circle round it (its center and radius) */ cx: number; cy: number; R: number; /** the whole wall a piece belongs to */ wall?: Vec[]; /** (its width across the wind, last asked) */ wKey?: number; wVal?: number; /** (its outline in the wind's frame, for the last wind asked: along and across, and the extents) */ eFrom?: number; pa?: Float64Array; pn?: Float64Array; a0?: number; a1?: number; n0?: number; n1?: number; cross?: number }
const reach = (k: Kind, H: number) => k === 'fence' ? 80 * H : k === 'step' ? 15 * H : 50 * H;
const BODIES: Body[] = (() => {
  const out: Body[] = [];
  const add = (kind: Kind, pts: Vec[], H: number, wall?: Vec[]) => { const r = reach(kind, H);
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length, cy = pts.reduce((a, q) => a + q.y, 0) / pts.length, R = Math.max(...pts.map(q => Math.hypot(q.x - cx, q.y - cy))) + 1e-6;
    out.push({ kind, pts, H, wall, cx, cy, R, box: { x0: Math.min(...pts.map(q => q.x)) - r, x1: Math.max(...pts.map(q => q.x)) + r, y0: Math.min(...pts.map(q => q.y)) - r, y1: Math.max(...pts.map(q => q.y)) + r } }); };
  // each breakwater a run of wall pieces (its line's segments; an area's outline's)
  for (const h of HARBORS) for (const b of h.breakwaters) {
    const pts = b.area ? [...b.pts, b.pts[0]] : b.pts;
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > 0.5) add('fence', [pts[i - 1], pts[i]], WALL_H, b.pts);
  }
  // the seawalls: the coastline within each harbor's works (Gashouse Cove's west side is the Marina Green's)
  for (const h of HARBORS) { const r = h.reach;
    for (let k = 1; k < SHORE.length; k++) { const a = SHORE[k - 1], b = SHORE[k], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (m.x > r.x0 - 10 && m.x < r.x1 + 10 && m.y > r.y0 - 10 && m.y < r.y1 + 10 && Math.hypot(b.x - a.x, b.y - a.y) > 0.5) add('step', [a, b], WALL_H); } }
  for (const P of PILE_PIERS) add('shed', P.pts, P.height);
  return out;
})();
/** The bodies by harbor (and the sheds as one), each group with the box round all its bodies' reaches: a boat's wind
 * tests a handful of boxes, not every piece of wall on the Bay (every boat asks, every step). */
const GROUPS = (() => {
  const byKey = new Map<string, Body[]>();
  for (const B of BODIES) { const k = B.kind === 'shed' ? 'sheds' : `${Math.round(B.box.x0 / 1500)},${Math.round(B.box.y0 / 1500)}`; (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(B); }
  return [...byKey.values()].map(bs => ({ bodies: bs, box: bs.reduce((a, b) => ({ x0: Math.min(a.x0, b.box.x0), x1: Math.max(a.x1, b.box.x1), y0: Math.min(a.y0, b.box.y0), y1: Math.max(a.y1, b.box.y1) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }) }));
})();
/**
 * Whether body B can give any lee that counts (a thousandth: addHarborLee leaves less out) at a point q from its center,
 * the wind blowing toward e, with q anywhere within `slack` of where it's given. By the circle round the body: p upwind
 * of all of it is in no lee of it; far enough to the side of it, past a shed's widest wake or a wall's end fade, it's
 * under 0.0004. (Exact, not an approximation: it only leaves out bodies whose lee there would be left out anyway.)
 */
function couldShelter(B: Body, qx: number, qy: number, e: Vec, slack: number): boolean {
  const R = B.R + slack, ca = qx * e.x + qy * e.y;
  if (ca <= -R) return false;
  const side = Math.abs(qx * e.y - qy * e.x) - R;
  if (side <= 0) return true;
  const X = ca + R; // (the most p can be downwind of any part of it)
  // (a shed's wake half-width, at most; a wall's end fade's width: beyond 4 and 2.8 of them each leaves under 0.0004)
  return side <= (B.kind === 'shed' ? Math.max(3, 0.25 * B.H + 0.1 * X) * 4 : (0.2 * X + B.H) * 2.8);
}
/** The bodies that can shelter some of each 50 m cell, for each degree of wind direction, filed the first time a cell
 * is asked about: almost always none (a boat's wind is asked for every boat, every step, and most of the walls near her
 * are downwind of her or off to the side). */
const CELL_M = 50, CELLS = new Map<number, Body[][]>(), NONE: Body[] = [];
function cellBodies(p: Vec, from: number): Body[] {
  const i = Math.floor(p.x / CELL_M), j = Math.floor(p.y / CELL_M), key = i * 1_000_003 + j;
  let l = CELLS.get(key);
  if (!l) {
    const x0 = i * CELL_M, y0 = j * CELL_M, x1 = x0 + CELL_M, y1 = y0 + CELL_M, near: Body[] = [];
    for (const G of GROUPS) { if (G.box.x1 < x0 || G.box.x0 > x1 || G.box.y1 < y0 || G.box.y0 > y1) continue;
      for (const B of G.bodies) if (!(B.box.x1 < x0 || B.box.x0 > x1 || B.box.y1 < y0 || B.box.y0 > y1)) near.push(B); }
    // each degree's list, tested from the cell's middle at the degree's middle: anywhere in the cell is within half its
    // diagonal of the middle, and anywhere in the degree turns a point |q| from the body by at most |q|·0.0088 (2 sin 0.25°)
    const cx = x0 + CELL_M / 2, cy = y0 + CELL_M / 2, rc = CELL_M * Math.SQRT1_2;
    l = Array.from({ length: 360 }, (_, k) => {
      const e = V(k + 0.5 + 180), out = near.filter(B => { const qx = cx - B.cx, qy = cy - B.cy; return couldShelter(B, qx, qy, e, rc + (Math.hypot(qx, qy) + rc) * 0.0088 + 0.01); });
      return out.length ? out : NONE;
    });
    CELLS.set(key, l);
  }
  const k = Math.floor(from) % 360;
  return l[k < 0 ? k + 360 : k];
}
/** Each breakwater's width across the wind, by wind direction (a tenth of a degree): it's asked for every piece, every boat. */
const WALL_W = new Map<Vec[], Map<number, number>>();
function wallWidth(B: Body, from: number): number {
  const key = Math.round(from * 10);
  if (B.wKey === key) return B.wVal!; // (one wind direction for the whole step: every boat, every piece, the same answer)
  const wall = B.wall!; let m = WALL_W.get(wall); if (!m) { m = new Map(); WALL_W.set(wall, m); }
  let w = m.get(key);
  if (w == null) { const e = V(key / 10 + 180); let n0 = Infinity, n1 = -Infinity; for (const q of wall) { const n = q.x * e.y - q.y * e.x; n0 = Math.min(n0, n); n1 = Math.max(n1, n); } w = Math.max(1, n1 - n0); if (m.size > 3600) m.clear(); m.set(key, w); }
  B.wKey = key; B.wVal = w; return w;
}
const BOX = BODIES.reduce((a, b) => ({ x0: Math.min(a.x0, b.box.x0), x1: Math.max(a.x1, b.box.x1), y0: Math.min(a.y0, b.box.y0), y1: Math.max(a.y1, b.box.y1) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

/**
 * A wall piece's lee at p, the wind blowing toward e: how far downwind of the piece p is (along the wind, back to where
 * the line upwind from p crosses it) and, past the piece's end, how far to the side. Beyond an end the lee fades as the
 * wake spreads (over about a fifth of the distance downwind); where two pieces meet, the other one's lee carries on.
 */
/** Body B's outline in the wind's frame for the wind from `from` (blowing toward e), worked out once a wind: every boat
 * asks in the same step's wind. */
function frame(B: Body, from: number, e: Vec): void {
  if (B.eFrom === from) return;
  const n = B.pts.length, pa = B.pa ?? (B.pa = new Float64Array(n)), pn = B.pn ?? (B.pn = new Float64Array(n));
  let a0 = Infinity, a1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < n; i++) { const q = B.pts[i], a = q.x * e.x + q.y * e.y, c = q.x * e.y - q.y * e.x; pa[i] = a; pn[i] = c; a0 = Math.min(a0, a); a1 = Math.max(a1, a); n0 = Math.min(n0, c); n1 = Math.max(n1, c); }
  B.a0 = a0; B.a1 = a1; B.n0 = n0; B.n1 = n1; B.eFrom = from;
  if (n === 2) { const dx = B.pts[1].x - B.pts[0].x, dy = B.pts[1].y - B.pts[0].y; B.cross = e.x * dy - e.y * dx; }
}
let GX = 0, GMISS = 0; // (wallGeom's answer: no allocation, it's asked for every wall piece near every boat, every step)
/** Where p lies behind a wall piece: GX downwind of it, GMISS to the side past an end; false if p isn't behind it. */
function wallGeom(B: Body, p: Vec, e: Vec): boolean {
  const a = B.pts[0], b = B.pts[1], dx = b.x - a.x, dy = b.y - a.y;
  const cross = B.cross!; // (the piece's length across the wind: frame())
  if (Math.abs(cross) < 1e-6) return false; // (lying along the wind: it stops none of it)
  // p − x·e = a + s·(b − a): x downwind of the line, s along the piece
  const px = p.x - a.x, py = p.y - a.y, x = (px * dy - py * dx) / cross, s = (px * e.y - py * e.x) / -cross;
  // beside it, past an end: how far downwind of that end, and how far to the side of it (from the end itself: measured
  // to the piece's line, a piece lying nearly along the wind put far-off water just behind it)
  let X = x, miss = 0;
  if (s < 0 || s > 1) { const q = s < 0 ? a : b, qx = p.x - q.x, qy = p.y - q.y; X = qx * e.x + qy * e.y; miss = Math.abs(qx * e.y - qy * e.x); }
  if (X <= 0) return false;
  GX = X; GMISS = miss; return true;
}
/** A wall piece's lee d0 at GX, made up: coming in over the first height and a half behind the wall (the slack
 * recirculating air close in: no step where the lee begins), and round an end, over about a wall height close in, wider on. */
function wallShape(B: Body, d0: number): number {
  const d = d0 * Math.min(1, GX / (1.5 * B.H)); if (d <= 0) return 0;
  return GMISS > 0 ? d * Math.exp(-((GMISS / (0.2 * GX + B.H)) ** 2)) : d;
}

const insideP = (p: Vec, P: Vec[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
/**
 * Where p lies behind a shed (the wind blowing toward e): x, how far downwind of its lee face's line (the shed's most
 * downwind point, along the wind: negative level with the shed), and miss, how far outside the shed's width across the
 * wind. Null inside the shed. (By its extents, not edge by edge: a line up the wind that just clips a corner would make
 * a step in the field.)
 */
let SX = 0, SMISS = 0; // (shedFace's answer)
function shedFace(B: Body, p: Vec, e: Vec): boolean {
  const pts = B.pts, PA = B.pa!, PN = B.pn!, n = pts.length;
  if (insideP(p, pts)) return false;
  // x: downwind of the lee face's line (its most downwind point along the wind). miss: how far across the wind p's line
  // up the wind passes the part of the shed that's upwind of p (0 where it meets it), so as the line comes round a corner
  // the miss runs smoothly down to nothing: no step where it first clips the shed
  const pa = p.x * e.x + p.y * e.y, pn = p.x * e.y - p.y * e.x;
  let miss = Infinity;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    let aa = PA[i], an = PN[i], ba = PA[j], bn = PN[j];
    if (aa > pa && ba > pa) continue; // (wholly downwind of p)
    // clip the edge to its part upwind of p
    if (aa > pa) { const t = (pa - ba) / (aa - ba); an = bn + t * (an - bn); aa = pa; }
    else if (ba > pa) { const t = (pa - aa) / (ba - aa); bn = an + t * (bn - an); ba = pa; }
    const lo = an < bn ? an : bn, hi = an < bn ? bn : an, g = pn < lo ? lo - pn : pn > hi ? pn - hi : 0;
    if (g < miss) miss = g;
  }
  if (miss === Infinity) return false; // (all of it downwind of p: p is upwind of it)
  SX = pa - B.a1!; SMISS = miss; return true;
}

/** The deficit at p (a fraction of the wind, over the rig) behind the walls and sheds, the wind from `from`: the strongest one's. */
let lastFrom = NaN, lastE: Vec = { x: 0, y: 0 };
export function harborLeeDeficit(p: Vec, from: number): number {
  if (p.x < BOX.x0 || p.x > BOX.x1 || p.y < BOX.y0 || p.y > BOX.y1) return 0;
  const list = cellBodies(p, from); if (!list.length) return 0;
  if (from !== lastFrom) { lastFrom = from; lastE = V(from + 180); }
  const e = lastE; let best = 0;
  {
  for (const B of list) {
    if (p.x < B.box.x0 || p.x > B.box.x1 || p.y < B.box.y0 || p.y > B.box.y1) continue;
    if (!couldShelter(B, p.x - B.cx, p.y - B.cy, e, 0)) continue; // (most of them, cheaply: no outline worked out)
    let d: number;
    frame(B, from, e);
    if (B.kind === 'shed') {
      const W = Math.max(1, B.n1! - B.n0!), L = Math.max(1, B.a1! - B.a0!);
      // from the shed itself, not the box round it: how far downwind of its lee face, and how far the line up the wind
      // from p passes to the side of it (shedFace)
      if (!shedFace(B, p, e)) { d = 0; } else {
        // (bluffDeficit's x from the lee face, as Hosker's cavity is measured; beside the shed, level with it, the lee
        // comes in over its last third, from nothing level with its windward part)
        const fx = SX, r = reach('shed', B.H), beside = fx < 0 ? Math.min(1, Math.max(0, 1 + fx / (0.3 * L))) : 1;
        // (its sides: a shed many times longer than wide has the separated air back on its side walls within a few widths,
        // so level with it the lee beside it is a thin layer along the wall, a few meters; behind its lee face the wake
        // spreads from the lee corners, 0.25 H + 0.1 x, as bluffDeficit has it. Blended over the shed's last fifth)
        const t = Math.min(1, Math.max(0, (fx + 0.2 * L) / (0.2 * L)));
        const miss = SMISS, sw = (1 - t) * 3 + t * (0.25 * B.H + 0.1 * Math.max(0, fx));
        const side = Math.exp(-(miss * miss) / (2 * sw * sw));
        d = bluffDeficit(Math.max(0, fx), 0, B.H, W, L) * side * beside * Math.min(1, Math.max(0, (r - fx) / (0.3 * r))); // (faded out over its reach's last 30%)
      }
    } else if (B.kind === 'fence') {
      // Perera's fence is endless; a breakwater W wide across the wind has ends, and its lee thins as the air closes in
      // round them, halved about W downwind (a rule of thumb, 1/(1 + x/W): no measured end correction was found). W is
      // the whole breakwater's, so a wall drawn in many short pieces shelters as the one wall it is
      if (!wallGeom(B, p, e)) continue;
      const Wall = wallWidth(B, from), r = reach('fence', B.H), x = GX;
      d = wallShape(B, fenceDeficit(x, B.H) / (1 + x / Wall) * Math.min(1, Math.max(0, (r - x) / (0.25 * r))));
    } else { if (!wallGeom(B, p, e)) continue; d = wallShape(B, stepDeficit(GX, B.H)); }
    if (d > best) best = d;
  }
  }
  return best;
}

/** The walls' and sheds' lee at p, added to `sum` (World.shadowAt). */
export function addHarborLee(sum: WindSum, from: number, p: Vec): void {
  const d = harborLeeDeficit(p, from);
  if (d > 0.001) sum.addDeficit(lastE.x, lastE.y, d); // (harborLeeDeficit's own e for this wind: it's only above 0 once it has made it)
}
