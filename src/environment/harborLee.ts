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

/** The rig-averaged deficit x m behind a solid fence h high (Perera, above). */
export function fenceDeficit(x: number, h: number): number {
  const xx = Math.max(5 * h, x), s = Math.pow(kFence(h) * xx / h, -0.47);
  let d = 0;
  for (let i = 0; i < ZS.length; i++) { const eta = ZS[i] / h * s; d += WS[i] * 9.75 * (h / xx) * eta * Math.exp(-0.67 * Math.pow(eta, 1.5)); }
  return Math.min(0.7, d / WSUM);
}
/** The rig-averaged deficit x m behind a step h high (above). */
export function stepDeficit(x: number, h: number): number {
  if (x <= 0) return 0;
  const top = 1.2 * h; let share = 0;
  for (let i = 0; i < ZS.length; i++) if (ZS[i] < top) share += WS[i];
  share /= WSUM;
  return 0.7 * share * (x < 7 * h ? 1 : Math.max(0, 1 - (x - 7 * h) / (8 * h)));
}

type Kind = 'fence' | 'step' | 'shed';
interface Body { kind: Kind; pts: Vec[]; H: number; box: { x0: number; x1: number; y0: number; y1: number }; /** the whole wall a piece belongs to */ wall?: Vec[] }
const reach = (k: Kind, H: number) => k === 'fence' ? 80 * H : k === 'step' ? 15 * H : 50 * H;
const BODIES: Body[] = (() => {
  const out: Body[] = [];
  const add = (kind: Kind, pts: Vec[], H: number, wall?: Vec[]) => { const r = reach(kind, H);
    out.push({ kind, pts, H, wall, box: { x0: Math.min(...pts.map(q => q.x)) - r, x1: Math.max(...pts.map(q => q.x)) + r, y0: Math.min(...pts.map(q => q.y)) - r, y1: Math.max(...pts.map(q => q.y)) + r } }); };
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
/** Each breakwater's width across the wind, by wind direction (a tenth of a degree): it's asked for every piece, every boat. */
const WALL_W = new Map<Vec[], Map<number, number>>();
function wallWidth(wall: Vec[], from: number): number {
  let m = WALL_W.get(wall); if (!m) { m = new Map(); WALL_W.set(wall, m); }
  const key = Math.round(from * 10); let w = m.get(key);
  if (w == null) { const e = V(key / 10 + 180); let n0 = Infinity, n1 = -Infinity; for (const q of wall) { const n = q.x * e.y - q.y * e.x; n0 = Math.min(n0, n); n1 = Math.max(n1, n); } w = Math.max(1, n1 - n0); if (m.size > 3600) m.clear(); m.set(key, w); }
  return w;
}
const BOX = BODIES.reduce((a, b) => ({ x0: Math.min(a.x0, b.box.x0), x1: Math.max(a.x1, b.box.x1), y0: Math.min(a.y0, b.box.y0), y1: Math.max(a.y1, b.box.y1) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

/**
 * A wall piece's lee at p, the wind blowing toward e: how far downwind of the piece p is (along the wind, back to where
 * the line upwind from p crosses it) and, past the piece's end, how far to the side. Beyond an end the lee fades as the
 * wake spreads (over about a fifth of the distance downwind); where two pieces meet, the other one's lee carries on.
 */
function wallLee(B: Body, p: Vec, e: Vec, f: (x: number, h: number) => number): number {
  const a = B.pts[0], b = B.pts[1], dx = b.x - a.x, dy = b.y - a.y;
  const cross = e.x * dy - e.y * dx; // (the piece's length across the wind)
  if (Math.abs(cross) < 1e-6) return 0; // (lying along the wind: it stops none of it)
  // p − x·e = a + s·(b − a): x downwind of the line, s along the piece
  const px = p.x - a.x, py = p.y - a.y, x = (px * dy - py * dx) / cross, s = (px * e.y - py * e.x) / -cross;
  // beside it, past an end: how far downwind of that end, and how far to the side of it (from the end itself: measured
  // to the piece's line, a piece lying nearly along the wind put far-off water just behind it)
  let X = x, miss = 0;
  if (s < 0 || s > 1) { const q = s < 0 ? a : b, qx = p.x - q.x, qy = p.y - q.y; X = qx * e.x + qy * e.y; miss = Math.abs(qx * e.y - qy * e.x); }
  if (X <= 0) return 0;
  // (coming in over the first height and a half behind the wall, the slack recirculating air close in: no step where the lee begins)
  const d = f(X, B.H) * Math.min(1, X / (1.5 * B.H)); if (d <= 0) return 0;
  return miss > 0 ? d * Math.exp(-((miss / (0.2 * X + B.H)) ** 2)) : d; // (the air closing in round an end: over about a wall height close in, wider on)
}

const insideP = (p: Vec, P: Vec[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
/**
 * Where p lies behind a shed (the wind blowing toward e): x, how far downwind of its lee face's line (the shed's most
 * downwind point, along the wind: negative level with the shed), and miss, how far outside the shed's width across the
 * wind. Null inside the shed. (By its extents, not edge by edge: a line up the wind that just clips a corner would make
 * a step in the field.)
 */
function shedFace(pts: Vec[], p: Vec, e: Vec): { x: number; miss: number } | null {
  if (insideP(p, pts)) return null;
  // x: downwind of the lee face's line (its most downwind point along the wind). miss: how far across the wind p's line
  // up the wind passes the part of the shed that's upwind of p (0 where it meets it), so as the line comes round a corner
  // the miss runs smoothly down to nothing: no step where it first clips the shed
  const pa = p.x * e.x + p.y * e.y, pn = p.x * e.y - p.y * e.x;
  let a1 = -Infinity, miss = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    let aa = A.x * e.x + A.y * e.y, an = A.x * e.y - A.y * e.x, ba = B.x * e.x + B.y * e.y, bn = B.x * e.y - B.y * e.x;
    a1 = Math.max(a1, aa);
    if (aa > pa && ba > pa) continue; // (wholly downwind of p)
    // clip the edge to its part upwind of p
    if (aa > pa) { const t = (pa - ba) / (aa - ba); an = bn + t * (an - bn); aa = pa; }
    else if (ba > pa) { const t = (pa - aa) / (ba - aa); bn = an + t * (bn - an); ba = pa; }
    const lo = Math.min(an, bn), hi = Math.max(an, bn), g = pn < lo ? lo - pn : pn > hi ? pn - hi : 0;
    if (g < miss) miss = g;
  }
  if (miss === Infinity) return null; // (all of it downwind of p: p is upwind of it)
  return { x: pa - a1, miss };
}

/** The deficit at p (a fraction of the wind, over the rig) behind the walls and sheds, the wind from `from`: the strongest one's. */
export function harborLeeDeficit(p: Vec, from: number): number {
  if (p.x < BOX.x0 || p.x > BOX.x1 || p.y < BOX.y0 || p.y > BOX.y1) return 0;
  const e = V(from + 180); let best = 0;
  for (const G of GROUPS) { if (p.x < G.box.x0 || p.x > G.box.x1 || p.y < G.box.y0 || p.y > G.box.y1) continue;
  for (const B of G.bodies) {
    if (p.x < B.box.x0 || p.x > B.box.x1 || p.y < B.box.y0 || p.y > B.box.y1) continue;
    let d: number;
    if (B.kind === 'shed') {
      // in the wind's frame: its extent along (a0..a1) and across (n0..n1); the wake from its middle across, its lee face along
      let a0 = Infinity, a1 = -Infinity, n0 = Infinity, n1 = -Infinity;
      for (const q of B.pts) { const a = q.x * e.x + q.y * e.y, n = q.x * e.y - q.y * e.x; a0 = Math.min(a0, a); a1 = Math.max(a1, a); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
      const W = Math.max(1, n1 - n0), L = Math.max(1, a1 - a0);
      // from the shed itself, not the box round it: back up the wind from p to its lee face (where that line leaves the
      // shed); if the line misses it, how far it passes to the side of the shed's nearest corner upwind
      const face = shedFace(B.pts, p, e);
      if (!face) { d = 0; } else {
        // (bluffDeficit's x from the lee face, as Hosker's cavity is measured; beside the shed, level with it, the lee
        // comes in over its last third, from nothing level with its windward part)
        const r = reach('shed', B.H), beside = face.x < 0 ? Math.min(1, Math.max(0, 1 + face.x / (0.3 * L))) : 1;
        // (its sides: a shed many times longer than wide has the separated air back on its side walls within a few widths,
        // so level with it the lee beside it is a thin layer along the wall, a few meters; behind its lee face the wake
        // spreads from the lee corners, 0.25 H + 0.1 x, as bluffDeficit has it. Blended over the shed's last fifth)
        const t = Math.min(1, Math.max(0, (face.x + 0.2 * L) / (0.2 * L)));
        const miss = face.miss, sw = (1 - t) * 3 + t * (0.25 * B.H + 0.1 * Math.max(0, face.x));
        const side = Math.exp(-(miss * miss) / (2 * sw * sw));
        d = bluffDeficit(Math.max(0, face.x), 0, B.H, W, L) * side * beside * Math.min(1, Math.max(0, (r - face.x) / (0.3 * r))); // (faded out over its reach's last 30%)
      }
    } else if (B.kind === 'fence') {
      // Perera's fence is endless; a breakwater W wide across the wind has ends, and its lee thins as the air closes in
      // round them, halved about W downwind (a rule of thumb, 1/(1 + x/W): no measured end correction was found). W is
      // the whole breakwater's, so a wall drawn in many short pieces shelters as the one wall it is
      const Wall = wallWidth(B.wall!, from), r = reach('fence', B.H);
      d = wallLee(B, p, e, (x, h) => fenceDeficit(x, h) / (1 + x / Wall) * Math.min(1, Math.max(0, (r - x) / (0.25 * r))));
    } else d = wallLee(B, p, e, stepDeficit);
    if (d > best) best = d;
  }
  }
  return best;
}

/** The walls' and sheds' lee at p, added to `sum` (World.shadowAt). */
export function addHarborLee(sum: WindSum, from: number, p: Vec): void {
  const d = harborLeeDeficit(p, from);
  if (d > 0.001) { const e = V(from + 180); sum.addDeficit(e.x, e.y, d); }
}
