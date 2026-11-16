import { KT, V, brg, cross, dist, dot, hypot, sub, unit, wrap, type Vec } from '../core/math';
import { beatAngle, runAngle } from '../boat/polar';
import { speedInChop } from '../boat/seaway';
import { landDist, manoeuvreS, sailLegSteps, type SailResult, type LegKind } from './routing';
import type { Outlook } from './outlook';
import { anyShoreDist, landAlong, landDist as terrainLandDist, limePointBox, wharfNearest } from '../geo/shore';
import { HARBORS, harborNear, hitsHarbor, inBasin } from '../geo/marina';
import { LL } from '../geo/geo';

/**
 * The isochrone router (the owner, 15 November 2026): the fastest way from a to b through the day's wind, the land's lee
 * and the tide, found the way a navigator with a tidal atlas would, not by rules. From the start, every minute, the
 * boat sails every heading she can at her polar speed in the chop (boat/seaway.ts speedInChop) through the wind on the
 * water and the current where she is then (sim/outlook.ts), each tack or jibe costing its time (routing.ts manoeuvreS).
 * The farthest point reached in each direction from the start is kept (the isochrone, the line she can reach in that
 * many minutes); the first to reach the mark, traced back, is the route. So she sails out of a lee into the breeze, or
 * across a tide to the side where it helps, where the time it gains is more than the distance it costs, and never
 * doubles back unless that really is quicker.
 *
 * The method is the one sailing routers use (isochrones: R. W. James, "Application of wave forecasts to marine
 * navigation", US Navy Hydrographic Office, 1957; Hagiwara 1989). Its steps here are estimates chosen for the Bay's
 * scales: STEP_MIN 1 min (100–200 m at her speeds, finer than the lee's and the tide's changes), HEADING_STEP 5°,
 * SECTOR 1° (how finely the front is kept), SHORE 50 m (how close to the land she may sail), STALL 10 min.
 */
/** How close to the shore a plan takes her (m), an estimate of seamanship, not a measured number: about seven boat
 * lengths. Racers do rock-hop a steep-to shore to cheat a foul tide, but the sim has no depths along it, and a learner
 * follows the plan (Deep Physics' review, S2). The owner's Horseshoe Bay case keeps its gain at 50 m: 65.4 min against
 * 65.2 at 20 m. Nearer than this only while she isn't closing the shore (leaving a berth or a shore she started by), and
 * by the mark as near as the mark is. */
const SHORE = 50;
/** How close to a pier, a wharf, a breakwater or a dock a plan takes her (m), an estimate: a man-made face with known
 * depth alongside, closer than a natural shore, and still four lengths off its end (the owner ran into an Embarcadero
 * pier the navigator hadn't seen: the Coordinator, 15 Nov 2026). Nearer only leaving one she started by, and by the mark. */
const WHARF_CLEAR = 20;
/** The fastest she could possibly go over the ground (m/s): 8 kt through the water, above a Folkboat's best off the wind
 * (hull speed about 6 kt on her 6 m waterline), and 7 kt of tide, above the strongest the sim's currents can run (NOAA's
 * constituents at SFB1201, the Bay's entrance, add up to 6.7 kt: environment/data/sf-currents.json). An upper bound on
 * purpose, so the bound it gives never drops a route that could win. */
const OPTIMISTIC = 15 * KT;
/** How finely the router works (estimates for the Bay's scales): a front every `step` minutes, headings `heading`° apart,
 * the front kept in `sector`° sectors round the start. FINE's sector is 1°: at 2°, 190 m wide 5 km out, light-air cases
 * lost the way round a point (Crissy Field to Belvedere in 6 kt: 332 min where 1° finds 66, the finest grain 66.5:
 * Deep Physics' convergence check, V2). COARSE is for quick looks; its minutes can be out by half. */
export interface Grain { step: number; heading: number; sector: number }
export const FINE: Grain = { step: 1, heading: 5, sector: 1 }, COARSE: Grain = { step: 2, heading: 10, sector: 4 };

interface Node { p: Vec; t: number; side: number; parent: number; turn: '' | 'tack' | 'gybe'; kt: number; cur: number }

/** The wind on the water (the air's motion minus the water's), as routing.ts windFor has it with no scenario. */
function windOn(o: Outlook, p: Vec, t: number): { kt: number; from: number } {
  const w = o.wind(p, t), c = o.current(p, t), a = V(w.from);
  const wx = -a.x * w.kt - c.x / KT, wy = -a.y * w.kt - c.y / KT;
  return { kt: hypot(wx, wy), from: brg(-wx, -wy) };
}

/** Heading that makes good a straight line toward `u` across the current c, at speed v (m/s): as routing.ts crabTo. */
function crabTo(u: Vec, c: Vec, v: number): number {
  const s = Math.max(-0.95, Math.min(0.95, cross(u, c) / Math.max(0.2, v)));
  return brg(u.x, u.y) + Math.asin(s) * 180 / Math.PI;
}
/** Polar speed in chop, remembered (it's solved by iteration): as routing.ts chopSpeed. */
const speeds = new Map<string, number>();
function chopSpeed(kt: number, twa: number, hs: number, tp: number): number {
  const k = `${Math.round(kt * 10)},${Math.round(twa * 2)},${Math.round(hs * 50)},${Math.round(tp * 5)}`;
  let v = speeds.get(k);
  if (v == null) { v = speedInChop(Math.round(kt * 10) / 10, Math.round(twa * 2) / 2, Math.round(hs * 50) / 50, Math.round(tp * 5) / 5); if (speeds.size > 100000) speeds.clear(); speeds.set(k, v); }
  return v;
}

/** landDist (routing.ts, to 600 m) remembered here on its own 25 m cells by a number, not a string: the router asks
 * hundreds of thousands of times a plan. */
const near = new Map<number, number>();
const CFB = { x0: LL(0, -122.4800).x - 150, x1: LL(0, -122.4000).x + 150, y0: LL(37.780, 0).y - 150, y1: LL(37.8150, 0).y + 150 };
function landNear(p: Vec): number {
  // (away from the hand-drawn shores, the Cityfront's and Lime Point's, the terrain's own distance map, one lookup)
  if (!handShore(p)) return Math.max(0, terrainLandDist(p) - 15);
  return nearCell(p);
}
/** Inside the hand-drawn shores' boxes, the exact distance off the 10 m lattice; elsewhere the terrain's (to ~15 m). */
function shoreNear(p: Vec): number { return handShore(p) ? exactNear(p) : terrainLandDist(p); }
/** The exact distance to any shore at the nearest 10 m point, remembered point by point: the 10 m lattice
 * (anyShoreDistNear) fills a 320 m tile at its first look, ~30 ms at once, which would hold a frame up. */
const exact10 = new Map<number, number>();
function exactNear(p: Vec): number {
  const i = Math.round(p.x / 10), j = Math.round(p.y / 10), k = (i + 1e6) * 2e6 + (j + 1e6);
  let v = exact10.get(k); if (v === undefined) { v = anyShoreDist({ x: i * 10, y: j * 10 }); if (exact10.size > 400000) exact10.clear(); exact10.set(k, v); }
  return v - 7.1; // (the point is up to 7 m off: never read her farther off than she is)
}
function handShore(p: Vec): boolean {
  const lp = limePointBox();
  return (p.x > CFB.x0 && p.x < CFB.x1 && p.y > CFB.y0 && p.y < CFB.y1) || (p.x > lp.x0 - 150 && p.x < lp.x1 + 150 && p.y > lp.y0 - 150 && p.y < lp.y1 + 150);
}
function nearCell(p: Vec): number {
  const i = Math.round(p.x / 25), j = Math.round(p.y / 25), k = (i + 1e5) * 2e5 + (j + 1e5);
  let v = near.get(k); if (v === undefined) { v = landDist({ x: i * 25, y: j * 25 }); if (near.size > 400000) near.clear(); near.set(k, v); }
  return v;
}
/** Clear water along a segment, at least SHORE m from the land: if the land is farther from its middle than half its
 * length and SHORE (and a cell's error), no point of it is nearer; otherwise looked at every 25 m. */
function clear(p: Vec, q: Vec, mark: Vec, arrive: number, shore = true): boolean {
  const L = dist(p, q), m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  // (the terrain has no piers in it: an Embarcadero pier reaches 250 m out from a shore the terrain puts far off, so the
  // structures are looked for as well before a segment is passed as clear without the exact test)
  const built = structuresNear(m, L / 2 + WHARF_CLEAR + 10);
  if (!built && landNear(m) > L / 2 + SHORE + 100) return true; // (no land within reach of any point of it, by the coarse reading)
  if (landAlong(p, q) !== Infinity) return false; // (exact: nothing, however narrow, slips through: a breakwater, a pier)
  const n = Math.max(1, Math.ceil(L / 10));
  let d0 = NaN, w0 = NaN;
  for (let k = 1; k <= n; k++) {
    const x = { x: p.x + (q.x - p.x) * k / n, y: p.y + (q.y - p.y) * k / n };
    if (dist(x, mark) < SHORE + arrive) continue; // (by the mark she goes as near as it is)
    if (shore && landNear(x) < SHORE + 50) {
      const d = shoreNear(x);
      if (d < SHORE) {
        if (d0 !== d0) d0 = shoreNear(p);
        if (d < d0 - 2) return false; // (nearer than SHORE and closing it: only leaving a berth or a shore she started by)
      }
    }
    if (built) {
      const dw = structureDist(x);
      if (dw < WHARF_CLEAR) {
        if (w0 !== w0) w0 = structureDist(p);
        if (dw < w0 - 2) return false; // (the same for a pier, a wharf, a breakwater or a dock: WHARF_CLEAR)
      }
    }
  }
  return true;
}
/** Any pier, wharf, breakwater or dock within r of p (the chart's own: geo/shore.ts's wharves and piers, the marinas'). */
function structuresNear(p: Vec, r: number): boolean {
  if (wharfNearest(p, r) !== null) return true;
  for (const H of HARBORS) if (p.x > H.reach.x0 - r && p.x < H.reach.x1 + r && p.y > H.reach.y0 - r && p.y < H.reach.y1 + r) return true;
  return false;
}
/** How far p is from the nearest structure, up to WHARF_CLEAR (Infinity beyond): a wharf or pier exactly; a marina's
 * breakwaters and docks by looking round p at 5 m steps out to WHARF_CLEAR (her basin itself counts as 0: the way in
 * and out of a marina is the marina's own, not the passage's). */
function structureDist(p: Vec): number {
  let d = wharfNearest(p, WHARF_CLEAR)?.d ?? Infinity;
  const H = harborNear(p) ?? HARBORS.find(h => p.x > h.reach.x0 - WHARF_CLEAR && p.x < h.reach.x1 + WHARF_CLEAR && p.y > h.reach.y0 - WHARF_CLEAR && p.y < h.reach.y1 + WHARF_CLEAR);
  if (H) {
    if (inBasin(p)) return 0;
    for (let r = 5; r <= WHARF_CLEAR && r < d; r += 5) for (let k = 0; k < 12; k++) {
      const t = k * Math.PI / 6;
      if (hitsHarbor({ x: p.x + Math.sin(t) * r, y: p.y + Math.cos(t) * r })) { d = Math.min(d, r); break; }
    }
  }
  return d;
}
/**
 * Is a track from the old rules (routing.ts sailLeg: the stall's rescue, the last board laid exactly, the rules' plan)
 * as clear of the piers, wharves, breakwaters and docks as the router's own segments: nothing crossed (exactly), and none
 * nearer than WHARF_CLEAR except leaving one she started by and by the mark? The rules sail in 10 s steps and look only
 * for land under her, so their track can pass within a few metres of a pier end; how near depends on her speed, so it
 * has to be checked, not assumed (the Coordinator, 16 Nov 2026: a plan 14 m off a pier when the drive's table was read
 * more smoothly). The natural shore's SHORE isn't asked of them: theirs is their own lane rules'.
 */
export function trackClear(track: { p: Vec }[], mark: Vec, arrive: number): boolean {
  for (let k = 1; k < track.length; k++) if (!clear(track[k - 1].p, track[k].p, mark, arrive, false)) return false;
  return true;
}

/**
 * Route from a to b leaving at minute t0. `arrive`: how close counts as there (m). Gives up after `maxMin` minutes. The
 * result has sailLeg's form (routing.ts SailResult), so the passage, the chart and the laylines read it as they did.
 */
export function routeLeg(o: Outlook, a: Vec, b: Vec, t0: number, arrive = 30, maxMin = 360, grain: Grain = FINE, limit = Infinity): SailResult {
  const g = routeLegSteps(o, a, b, t0, arrive, maxMin, grain, limit); let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
/** routeLeg a little at a time: it yields every 4 points of a front and after each front, so a plan can be worked out a slice a frame
 * (sim/navigator.ts passageLive) instead of holding a frame up for a second or two. */
/** `limit`: an arrival (minute since epoch UTC) another plan already makes. A point that couldn't get there sooner even
 * at OPTIMISTIC over the ground is dropped, and the search ends there: it can't lose a quicker route. */
export function* routeLegSteps(o: Outlook, a: Vec, b: Vec, t0: number, arrive = 30, maxMin = 360, grain: Grain = FINE, limit = Infinity): Generator<void, SailResult, void> {
  const STEP_MIN = grain.step, HEADING_STEP = grain.heading, SECTOR = grain.sector;
  const nodes: Node[] = [{ p: { ...a }, t: t0, side: 0, parent: -1, turn: '', kt: 0, cur: 0 }];
  let front = [0], best = -1;
  const legU = unit(sub(b, a)), w0 = windOn(o, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t0);
  const off0 = Math.abs(wrap(brg(legU.x, legU.y) - w0.from));
  const kind: LegKind = off0 < beatAngle(w0.kt) + 3 ? 'beat' : off0 > 150 ? 'run' : 'reach';
  if (dist(a, b) <= arrive) return yield* finish(0, true);
  // (which point of each sector of the front is kept: the one farthest out from the start and nearest the mark. Farthest
  // from the start alone, the front lost the boats working round a point of land toward the mark behind it (Raccoon
  // Strait from the Cityfront: never got there); nearest the mark alone, it kept boats that had come no way and turned
  // twice as often. On the Yellow Bluff, Horseshoe Bay and Raccoon cases this one was quickest, with the fewest turns)
  // A known weakness (Deep Physics' review, S1): a sector is a bearing from the start, so two points on one bearing on
  // either side of a peninsula share it, and the one nearer the mark as the crow flies is kept, which may be in a dead-end
  // bay. The stall rescue and the rules' plan (navigator.ts, the quicker is taken) cover it; if a case shows it, the cure
  // is to keep the front by place (cells ~100 m, by tack, a cell reached on an earlier front never taken again).
  const score = (q: Vec) => dist(q, a) - dist(q, b);
  // (a front that stops gaining on the mark, its nearest point no nearer for STALL minutes: the router's grain may not
  // thread the last of the way in, or she's stuck. From that point she could sail the rest by the rules (routing.ts
  // sailLeg): that arrival is kept as the time to beat, and the front searches on until it beats it or passes it. Taken
  // as the end at once, a light-air case (Horseshoe Bay to Yellow Bluff, 25 Nov 15:30, 6 kt) took the rules' 221 min
  // where the front, searching on, got there in 131. STALL is an estimate: docs/CONSTANTS.md)
  const STALL = 10; let nearD = dist(a, b), nearStep = 0, bound: { k: number; r: SailResult; t: number } | null = null;
  const beatBy = () => Math.min(limit, bound ? bound.t : Infinity);
  for (let step = 0; step * STEP_MIN < maxMin && best < 0 && t0 + step * STEP_MIN < beatBy(); step++) {
    const sectors = new Map<number, Node>(); // sector → the point kept there (only those are stored: the rest are many)
    for (const i of front) {
      yield; // (a front can take tens of ms cold, and a point a few: the page's slices stop between its points. Every fourth
      // point, four cold ones ran a slice to 32 ms from Mile Rock, its budget 6)
      const n = nodes[i], w = windOn(o, n.p, n.t), c = o.current(n.p, n.t), ch = o.chop(n.p, n.t);
      // (becalmed here, under 0.5 kt on the water: she can't sail, but the tide still carries her. The front keeps her,
      // drifting the minute on the same board with no turn, so a hole in the breeze doesn't delete the routes through it:
      // Deep Physics' review, M1)
      const calm = w.kt < 0.5, beat = calm ? 0 : beatAngle(w.kt);
      const cand: [number, number][] = calm ? [[NaN, n.side]] : [];
      if (!calm) {
        // (her beat angle, every HEADING_STEP from there, and her run angle exactly: the angles a navigator sails)
        const run = runAngle(w.kt);
        for (let x = beat; x <= 180; x += HEADING_STEP) for (const sd of [1, -1]) if (!(x === 180 && sd < 0)) cand.push([x, sd]);
        if (!cand.some(([x]) => Math.abs(x - run) < 0.5)) { cand.push([run, 1]); cand.push([run, -1]); }
        // (and the heading that crabs straight for the mark across the current, if she can sail it: on a reach the best way
        // is a straight line over the ground, and the fan's 5° steps miss it, the stream setting her off and back again)
        { const toB = unit(sub(b, n.p)), r = wrap(w.from - brg(toB.x, toB.y));
          let v0 = chopSpeed(w.kt, Math.abs(r), ch.hs, ch.tp);
          for (let k = 0; k < 2; k++) { const hm = crabTo(toB, c, v0), tw = Math.abs(wrap(w.from - hm)); if (tw >= beat) { v0 = chopSpeed(w.kt, tw, ch.hs, ch.tp); if (k === 1) cand.push([tw, wrap(w.from - hm) >= 0 ? 1 : -1]); } else break; }
        }
      }
      let tried = 0;
      for (const [twa, sd] of cand) {
        if (++tried % 6 === 0) yield; // (and between a point's headings: each one's exact check against the land and the piers, clear; a point's 30-odd ran a slice long)
        const h = w.from - sd * twa, v = twa === twa ? chopSpeed(w.kt, twa, ch.hs, ch.tp) : 0; // (sd +1: wind from starboard, starboard tack/jibe)
        // a tack or jibe costs its time, drifting with the current: the minute's sailing is that much shorter
        const turn: Node['turn'] = v && n.side && sd !== n.side ? (twa < 90 ? 'tack' : 'gybe') : '', lost = turn ? manoeuvreS(turn, w.kt, ch.hs) : 0;
        const secs = STEP_MIN * 60, sail = Math.max(0, secs - lost), d = v ? V(h) : { x: 0, y: 0 };
        const q = { x: n.p.x + d.x * v * sail + c.x * secs, y: n.p.y + d.y * v * sail + c.y * secs };
        // there: this minute's segment comes within `arrive` of the mark, timed where it first does (Deep Physics' S4),
        // and only that much of it need be clear (S3: a mark by the shore is reached, not refused as land)
        const s = sub(q, n.p), L2 = s.x * s.x + s.y * s.y, e = sub(n.p, b), bq = dot(e, s), cq = dot(e, e) - arrive * arrive;
        const disc = bq * bq - L2 * cq;
        let f = -1;
        if (cq <= 0) f = 0; else if (L2 > 0 && disc >= 0) { const f1 = (-bq - Math.sqrt(disc)) / L2; if (f1 >= 0 && f1 <= 1) f = f1; }
        if (f >= 0) {
          const at = { x: n.p.x + s.x * f, y: n.p.y + s.y * f };
          if (f > 0 && !clear(n.p, at, b, arrive)) continue;
          const idx = nodes.length; nodes.push({ p: at, t: n.t + STEP_MIN * f, side: sd, parent: i, turn, kt: w.kt, cur: dot(c, legU) / KT });
          if (best < 0 || nodes[idx].t < nodes[best].t) best = idx;
          continue;
        }
        if (n.t + STEP_MIN + dist(q, b) / OPTIMISTIC / 60 > beatBy()) continue; // (can't beat the plan already made)
        const r = sub(q, a), key = Math.round(brg(r.x, r.y) / SECTOR), cur = sectors.get(key);
        if (cur && score(q) <= score(cur.p)) continue;
        if (!clear(n.p, q, b, arrive)) continue;
        sectors.set(key, { p: q, t: n.t + STEP_MIN, side: sd, parent: i, turn, kt: w.kt, cur: dot(c, legU) / KT });
      }
    }
    if (best >= 0) break;
    front = []; for (const nd of sectors.values()) { front.push(nodes.length); nodes.push(nd); }
    if (!front.length) return yield* (bound ? finish(bound.k, true, undefined, bound.r) : finish(0, false, 'land'));
    let k = front[0]; for (const i of front) if (dist(nodes[i].p, b) < dist(nodes[k].p, b)) k = i;
    const dk = dist(nodes[k].p, b);
    if (dk < nearD - 10) { nearD = dk; nearStep = step; }
    else if ((step - nearStep) * STEP_MIN >= STALL) {
      const n = nodes[k], r = yield* sailLegSteps(o, n.p, b, n.t, 'middle', undefined, arrive, Math.max(10, maxMin - (n.t - t0)));
      if (r.ok && (!bound || n.t + r.minutes < bound.t) && trackClear(r.path, b, arrive)) bound = { k, r, t: n.t + r.minutes }; // (the rules sample every 10 s: a pier can slip between)
      nearStep = step; // (and tries again after another stall, from wherever the front has got to)
    }
    yield;
  }
  if (best >= 0 && (!bound || nodes[best].t <= bound.t)) return yield* finish(best, true);
  if (bound) return yield* finish(bound.k, true, undefined, bound.r);
  if (best < 0) { // (out of time: the front's point nearest the mark)
    let k = front[0]; for (const i of front) if (dist(nodes[i].p, b) < dist(nodes[k].p, b)) k = i;
    return yield* finish(k, false, 'time');
  }
  return yield* finish(best, true);

  function* finish(end: number, ok: boolean, why?: 'land' | 'time', rescue?: SailResult): Generator<void, SailResult, void> {
    let chain: Node[] = []; for (let i = end; i >= 0; i = nodes[i].parent) chain.unshift(nodes[i]);
    // the last board into the mark sailed exactly (routing.ts sailLeg: her beat or run angle on the layline the current
    // makes): the router's headings are 5° apart, and the board she lays the mark on is the one the chart's laylines draw
    let tail: SailResult | null = rescue ?? null, tailKind: 'tack' | 'gybe' | null = null;
    // (from the earliest of her last three turns whose laid board (one tack or jibe onto the layline at most) gets there within 2 minutes or 3% of the router's
    // time, what the 5° steps and the minute's grain can be out by (an estimate: docs/CONSTANTS.md): so a jink in the last minute onto the mark goes, and
    // the board she lays it on is her last)
    const endT = chain[chain.length - 1].t, slack = Math.max(2, 0.03 * (endT - t0));
    const turnsAt = chain.map((n, k) => n.turn ? k : -1).filter(k => k > 0).slice(-3);
    if (ok && !rescue) find: for (const li of turnsAt) for (const plan of ['middle', 'left', 'right'] as const) {
      // (left starts on starboard, right on port, looking up the wind: whichever lays it on one board)
      const from = chain[li - 1], r = yield* sailLegSteps(o, from.p, b, from.t, plan, undefined, arrive, 90);
      if (r.ok && r.turns.length <= 1 && from.t + r.minutes <= endT + slack && trackClear(r.path, b, arrive)) { tail = r; tailKind = chain[li].turn as 'tack' | 'gybe'; chain = chain.slice(0, li); break find; }
    }
    // (a point every half step: the drawn track's points are no farther apart than a boat sails in 30 s)
    const path: { p: Vec; t: number }[] = [];
    chain.forEach((n, k) => { if (k) { const m = chain[k - 1]; path.push({ p: { x: (m.p.x + n.p.x) / 2, y: (m.p.y + n.p.y) / 2 }, t: (m.t + n.t) / 2 }); } path.push({ p: n.p, t: n.t }); });
    if (tail) path.push(...tail.path.slice(1));
    const turns = chain.filter(n => n.turn).map(n => ({ p: nodes[n.parent].p, kind: n.turn as 'tack' | 'gybe' }));
    if (tail) { if (tailKind) turns.push({ p: chain[chain.length - 1].p, kind: tailKind }); turns.push(...tail.turns); }
    let maxLeft = 0, maxRight = 0, minShore = Infinity, sumKt = 0, sumCur = 0;
    for (const n of chain) { const xt = cross(legU, sub(n.p, a)); maxLeft = Math.max(maxLeft, xt); maxRight = Math.max(maxRight, -xt); minShore = Math.min(minShore, landDist(n.p)); sumKt += n.kt; sumCur += n.cur; }
    const m = Math.max(1, chain.length - 1);
    return { ok, why, minutes: path[path.length - 1].t - t0, kind, path, tacks: turns.length, turns, meanKt: sumKt / m, meanCurAlong: sumCur / m, maxLeft, maxRight, minShore };
  }
}
