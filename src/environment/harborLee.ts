import { V, clamp, type Vec } from '../core/math';
import { HARBORS } from '../geo/marina';
import { PILE_PIERS, SHORE } from '../geo/shore';
import { WindSum, bluffDeficit } from './shadows';

/**
 * The lee of the harbors' walls and of the sheds on Fort Mason's piers: the wind is lighter just downwind of them, as in
 * a slip by Gashouse Cove's west seawall in a westerly (the owner, 13 Nov 2026), and comes back within a few dozen
 * meters past a low wall.
 *
 * Each is a bluff body (shadows.ts bluffDeficit, as the ships', the committee boat's and the bridge piers' are): a
 * recirculating cavity behind it (Hosker's length, quoted in Hanna, Briggs & Hosker 1982, Handbook on Atmospheric
 * Diffusion, DOE/TIC-11223, pp. 19–22: about 11 heights behind a long thin wall), then the deficit fading as (x/H)^-1.5
 * (Woo, Peterka & Cermak 1977, NASA CR, wind-tunnel wakes of structures, §5.4.5). That reproduces the building wakes
 * Meroney 1977 measured (quoted in Wegley, PNL-2521, Table 3: 36%, 14%, 5% less wind 5, 10 and 20 heights behind a
 * building four times as wide as tall).
 *
 * Only the air below the wake's top is slowed: 1.5, 2 and 3 heights up at 5, 10 and 20 heights downwind (the same
 * table), H·(1 + 0.1·x/H), never under 1.5 H. A Folkboat's sails run from about 1 m to 9 m above the water, so the
 * deficit is taken in the share of that span inside the wake: behind a 2.5 m wall, about a third of the rig, its foot;
 * behind a 13–17 m shed, all of it. (One share for the whole rig, as the committee boat's lee is: the sails, flags and
 * telltales answer the same wind. A lee that grows with height up the mast is not modeled.)
 *
 * Heights: the sheds' from OpenStreetMap (geo/data/pile-piers.json: Pier 1 17 m, Pier 2 16 m, Pier 3 13 m). The
 * breakwaters' are not published where we could reach: WALL_H, 2.5 m above the water, is read off the owner's photos of
 * Gashouse Cove's (an estimate, for every harbor's alike).
 */
export const WALL_H = 2.5;
/** The rig's span above the water (m): the boom's foot to the masthead. */
const RIG_LO = 1, RIG_HI = 9;
interface Body { c: Vec; pts: Vec[]; H: number; box: { x0: number; x1: number; y0: number; y1: number } }
const BODIES: Body[] = (() => {
  const out: Body[] = [];
  const add = (pts: Vec[], H: number) => {
    const c = { x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length }, r = 30 * H;
    out.push({ c, pts, H, box: { x0: Math.min(...pts.map(q => q.x)) - r, x1: Math.max(...pts.map(q => q.x)) + r, y0: Math.min(...pts.map(q => q.y)) - r, y1: Math.max(...pts.map(q => q.y)) + r } });
  };
  // each breakwater a run of wall pieces (its line's segments; an area's outline's), each its own body
  for (const h of HARBORS) for (const b of h.breakwaters) {
    const pts = b.area ? [...b.pts, b.pts[0]] : b.pts;
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > 1) add([pts[i - 1], pts[i]], WALL_H);
  }
  // ... and the seawalls round them: the coastline within each harbor's works (Gashouse Cove's west side is the Marina
  // Green's seawall). Land a few meters up behind a wall is a step down to the water: the air leaving its edge reattaches
  // 7–10 step heights on (a backward-facing step: Westphal, Johnston & Eaton 1984, NASA CR-3765), about the long wall's
  // cavity above, so it takes the same wall's lee
  for (const h of HARBORS) {
    const r = h.reach;
    for (let k = 1; k < SHORE.length; k++) {
      const a = SHORE[k - 1], b = SHORE[k], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (m.x > r.x0 - 10 && m.x < r.x1 + 10 && m.y > r.y0 - 10 && m.y < r.y1 + 10 && Math.hypot(b.x - a.x, b.y - a.y) > 1) add([a, b], WALL_H);
    }
  }
  for (const P of PILE_PIERS) add(P.pts, P.height);
  return out;
})();
const BOX = BODIES.reduce((a, b) => ({ x0: Math.min(a.x0, b.box.x0), x1: Math.max(a.x1, b.box.x1), y0: Math.min(a.y0, b.box.y0), y1: Math.max(a.y1, b.box.y1) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

/** The deficit at p (a fraction of the wind) behind the walls and sheds, the wind from `from`: the strongest one's. */
export function harborLeeDeficit(p: Vec, from: number): number {
  if (p.x < BOX.x0 || p.x > BOX.x1 || p.y < BOX.y0 || p.y > BOX.y1) return 0;
  const e = V(from + 180); let best = 0;
  for (const B of BODIES) {
    if (p.x < B.box.x0 || p.x > B.box.x1 || p.y < B.box.y0 || p.y > B.box.y1) continue;
    // its width across the wind, depth along it (a wall piece: its length's share across, and a meter thick)
    let a0 = Infinity, a1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (const q of B.pts) { const dx = q.x - B.c.x, dy = q.y - B.c.y, a = dx * e.x + dy * e.y, n = dx * e.y - dy * e.x; a0 = Math.min(a0, a); a1 = Math.max(a1, a); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
    const W = Math.max(1, n1 - n0), L = B.pts.length === 2 ? 1 : Math.max(1, a1 - a0); // (a wall piece is a meter thick, however it lies)
    const dx = p.x - B.c.x, dy = p.y - B.c.y, x = dx * e.x + dy * e.y, y = dx * e.y - dy * e.x;
    if (x <= 0) continue;
    const d = bluffDeficit(x, y, B.H, W, L);
    if (d <= best) continue;
    const top = B.H * Math.max(1.5, 1 + 0.1 * x / B.H), share = clamp((top - RIG_LO) / (RIG_HI - RIG_LO), 0, 1);
    best = Math.max(best, d * share);
  }
  return best;
}

/** The walls' and sheds' lee at p, added to `sum` (World.shadowAt). */
export function addHarborLee(sum: WindSum, from: number, p: Vec): void {
  const d = harborLeeDeficit(p, from);
  if (d > 0.001) { const e = V(from + 180); sum.addDeficit(e.x, e.y, d); }
}
