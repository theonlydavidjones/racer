import { D2R, brg, type Vec, hypot } from '../core/math';
import { LL } from '../geo/geo';

/**
 * Ship traffic through the race area, on approximate real routes: a container ship and a tanker in the deep-water
 * route from the Golden Gate across the Central Bay toward Oakland; the Sausalito ferry from the Ferry Building; the
 * Alcatraz ferry from Pier 33; bay-cruise boats from Pier 41 out under the bridge and back; a Coast Guard boat out
 * of Horseshoe Bay. Where each one is comes straight from the race clock (deterministic), so replays match.
 *
 * Their wakes: the Kelvin pattern, two arms at 19.47° either side of the track (the same angle for any vessel at any
 * speed). The waves are bigger for bigger, faster vessels, and die away slowly as the arms spread (height falls off
 * as distance^(1/3)); their period follows the vessel's speed. When an arm passes under a boat she gets a short
 * burst of steep waves. The racing rules don't apply between a racing boat and a ship; the collision regulations
 * (IRPCAS / COLREGS) do, and a sailing boat must not impede a vessel that can only navigate in the channel (Rule 9).
 */

export type VesselKind = 'container' | 'tanker' | 'ferry' | 'alcatraz' | 'tour' | 'coastguard';
export interface VesselType { name: string; len: number; beam: number; kt: number; wakeH: number }
export const VESSEL: Record<VesselKind, VesselType> = {
  container: { name: 'Container ship', len: 300, beam: 42, kt: 12, wakeH: 0.7 },
  tanker: { name: 'Tanker', len: 240, beam: 42, kt: 11, wakeH: 0.6 },
  ferry: { name: 'Sausalito ferry', len: 50, beam: 13, kt: 17, wakeH: 0.5 },
  alcatraz: { name: 'Alcatraz ferry', len: 40, beam: 11, kt: 12, wakeH: 0.35 }, // (12 kt: the Alcatraz Clipper's and Flyer's cruising speed, alcatrazcruises.com/fleet, as found by search Nov 2026; an older builder's sheet gives the Clipper 10)
  tour: { name: 'Bay cruise boat', len: 45, beam: 12, kt: 11, wakeH: 0.4 },
  coastguard: { name: 'Coast Guard boat', len: 14, beam: 4.3, kt: 20, wakeH: 0.3 }
};

const route = (pts: [number, number][]) => pts.map(([la, lo]) => LL(la, lo));
// Approximate tracks (lat, lon). Ships keep to the deep water north of the race area, inside Alcatraz.
export const ROUTES: Record<string, Vec[]> = {
  channel: route([[37.8060, -122.5350], [37.8160, -122.4790], [37.8240, -122.4500], [37.8330, -122.4200], [37.8240, -122.3900], [37.8060, -122.3500]]),
  // (out clear of the pier heads: Piers 35 to 27 reach out to 37.810; geo/shore.ts)
  sausalito: route([[37.7960, -122.3910], [37.8050, -122.3930], [37.8110, -122.4040], [37.8190, -122.4330], [37.8400, -122.4640], [37.8560, -122.4770]]),
  alcatraz: route([[37.8085, -122.4030], // (off the head of Pier 33, the Alcatraz landing)
     [37.8180, -122.4130], [37.8262, -122.4212]]),
  // (from the berth on the west side of Pier 41, where OpenStreetMap's ferry routes end, out round Pier 45 and the Wharf's breakwater)
  tour: route([[37.8102, -122.4135], [37.8128, -122.4140], [37.8128, -122.4300], [37.8145, -122.4560], [37.8195, -122.4760], [37.8280, -122.4790], [37.8300, -122.4500], [37.8300, -122.4250], [37.8200, -122.4120], [37.8102, -122.4135]]),
  coastguard: route([[37.8325, -122.4740], [37.8200, -122.4600], [37.8150, -122.4400], [37.8260, -122.4350], [37.8325, -122.4740]])
};

export interface Service { kind: VesselKind; route: string; loop: boolean; phase: number; dwell: number }
export const SERVICES: Service[] = [
  { kind: 'container', route: 'channel', loop: false, phase: 0.15, dwell: 1500 },
  { kind: 'tanker', route: 'channel', loop: false, phase: 0.62, dwell: 2100 },
  { kind: 'ferry', route: 'sausalito', loop: false, phase: 0.3, dwell: 600 },
  { kind: 'alcatraz', route: 'alcatraz', loop: false, phase: 0.1, dwell: 420 },
  { kind: 'tour', route: 'tour', loop: true, phase: 0.05, dwell: 300 },
  { kind: 'tour', route: 'tour', loop: true, phase: 0.55, dwell: 300 },
  { kind: 'coastguard', route: 'coastguard', loop: true, phase: 0.4, dwell: 900 }
];

export interface Vessel { id: number; kind: VesselKind; x: number; y: number; h: number; v: number; moving: boolean }

/**
 * The power-driven vessels that keep out of a sailing boat's way (Rule 18(a)): the ferries, the bay-cruise boats and the
 * Coast Guard boat. The ships in the deep-water route are vessels that can navigate safely only within a narrow channel or
 * fairway, which a sailing vessel must not impede (Rule 9(b)): they hold their course and sound. (Inside the Gate, east of
 * the line from Point Bonita to Mile Rocks, the Inland Navigation Rules apply (33 CFR 80.1142, 33 CFR 83); Rules 8, 9, 16,
 * 17 and 18 read there as in the COLREGS. The ferries' routes aren't a narrow channel: US Coast Pilot 7, chapter 7.)
 */
export const GIVES_WAY: Record<VesselKind, boolean> = { container: false, tanker: false, ferry: true, alcatraz: true, tour: true, coastguard: true };
/** The services that vary from run to run (a ferry's departure, her line across the Bay). */
const VARIES: Record<VesselKind, boolean> = { container: false, tanker: false, ferry: true, alcatraz: true, tour: true, coastguard: false };

/**
 * When a ferry acts for a boat, and how. Rule 8 asks for action taken in ample time, large enough to be readily apparent,
 * that leaves the boats passing at a safe distance; Rule 16, early and substantial. No figure for when a Bay ferry alters
 * for small craft was found (the Coast Pilot gives none; the Harbor Safety Plan's ferry chapter and the operators'
 * procedures weren't reachable from here, 17 Nov 2026). All are estimates:
 * - ACT_S: she acts when the closest approach is within this many seconds: at the Sausalito ferry's 17 kt with a boat
 *   closing at 6 kt, 1.9 km off, about a mile, the "way earlier" a ferry bears off (the owner, who sails here).
 * - CLEAR: the least distance she leaves between her middle and a boat, past her half-length (m): three or four lengths.
 * - ALTER_DEG: how far off her line she turns to get there: a bold alteration, plainly seen from the boat.
 * - MAX_OFF: the farthest she goes off her line (m). Where no offset clears, she slows (Rule 8(e)): to SLOW of her speed,
 *   or, with a boat already within half of CLEAR, takes all way off.
 * - ROOM_IN, ROOM_K: near either end of her route she keeps to her line, coming in to her berth: on it for the last
 *   ROOM_IN m, and off it no more than ROOM_K m for each m farther out (about 30°).
 */
export const ACT_S = 180, CLEAR = 150, ALTER_DEG = 30, MAX_OFF = 300;
const SLOW = 0.3, ROOM_IN = 50, ROOM_K = 0.6;
/**
 * The run-to-run variation (the owner, 17 Nov 2026: a ferry doesn't keep an exact course on a perfect schedule):
 * - a departure up to half the service's dwell late: 97% of SF Bay Ferry trips arrive within 5 minutes of schedule (WETA's
 *   figure for January to August 2023, as reported by the Richmond Standard, 7 Sep 2023). An exponential spread of
 *   lateness with a mean of LATE_S puts 3% past 5 minutes. That's an arrival figure for one operator, used for every
 *   departure of every ferry and tour boat here: an estimate;
 * - each crossing a little to one side of the line drawn: up to XTRACK m either way. No measured figure was found (the
 *   Harbor Safety Committee's ferry routing guidelines, January 2026, weren't reachable): an estimate.
 */
export const LATE_S = 85, XTRACK = 40;

/**
 * Each service's give-way state: World state, stepped with the race (so the same race gives the same give-way in the
 * page's mirror, a replay and a ghost). `off`: how far she is to starboard of her line (m), `tgt` where she's going, `rate`
 * how fast she's getting there (m/s); `lag`: the seconds behind her schedule that slowing and turning off her line have
 * cost her; `slow`: her speed's share now. `hist`: her `off`, `lag` and `slow` every HIST_S of the traffic's clock for the
 * last 4 minutes (her wake's arms are where she was, not where she is); `histT`, the last of those slots.
 */
export interface Way { off: number; tgt: number; rate: number; lag: number; slow: number; hist: number[]; histT: number }
export const newWays = (): Way[] => SERVICES.map(() => ({ off: 0, tgt: 0, rate: 0, lag: 0, slow: 1, hist: [], histT: NaN }));
const HIST = 60, HIST_S = 4;

/** A route's geometry: its points, the distance along it to each, and each leg's direction. */
interface Path { r: Vec[]; L: number[]; total: number; t: Vec[] }
const PATH: Record<string, Path> = Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => {
  const L = [0], t: Vec[] = [];
  for (let i = 1; i < r.length; i++) { const dx = r[i].x - r[i - 1].x, dy = r[i].y - r[i - 1].y, l = hypot(dx, dy); L.push(L[i - 1] + l); t.push({ x: dx / l, y: dy / l }); }
  return [k, { r, L, total: L[L.length - 1], t }];
}));
/** At corner j of a route (between leg j−1 and leg j): how sharply it turns, cos²(θ/2)/sin(θ/2) (the rounding's least
 * radius for each meter of its arms: Infinity for no turn), and the most its arms can be (nearly half of either leg). */
function cornerOf(P: Path, j: number): { k: number; rc: number } {
  const a = P.t[j - 1], b = P.t[j], half = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) / 2;
  return { k: half < 1e-3 ? Infinity : Math.cos(half) ** 2 / Math.sin(half), rc: 0.45 * Math.min(P.L[j] - P.L[j - 1], P.L[j + 1] - P.L[j]) };
}
/** The arm (m) of the rounding at a corner, for a vessel `lat` m off the line: her offset and 40 m, and long enough
 * that the rounding's tightest radius is a quarter more than her offset (so on the inside she never folds back). */
const armOf = (c: { k: number; rc: number }, lat: number) => Math.min(c.rc, Math.max(40 + Math.abs(lat), 1.25 * Math.abs(lat) / c.k));
/**
 * The point `s` m along a route, set `lat` m to the right of the way it's drawn (+ to the right). At each corner she
 * rounds it: within `armOf` either side, her line is a curve from one leg to the next (a quadratic Bézier on the corner),
 * and she's set off along its own square, so her way is smooth round the bend: no corner to it, and no jump.
 */
function pathAt(P: Path, s: number, lat: number): Vec {
  s = Math.max(0, Math.min(P.total, s));
  let i = 1; while (i < P.L.length - 1 && P.L[i] < s) i++;
  // (the corner she's rounding, if any: the one ahead at this leg's end, or the one behind at its start)
  for (const j of [i, i - 1]) {
    if (j < 1 || j > P.L.length - 2) continue;
    const c = cornerOf(P, j), r = armOf(c, lat), u = (s - (P.L[j] - r)) / (2 * r);
    if (u <= 0 || u >= 1) continue;
    const V = P.r[j], t0 = P.t[j - 1], t1 = P.t[j];
    const ax = V.x - t0.x * r, ay = V.y - t0.y * r, bx = V.x + t1.x * r, by = V.y + t1.y * r;
    const x = (1 - u) ** 2 * ax + 2 * u * (1 - u) * V.x + u * u * bx, y = (1 - u) ** 2 * ay + 2 * u * (1 - u) * V.y + u * u * by;
    const tx = (1 - u) * t0.x + u * t1.x, ty = (1 - u) * t0.y + u * t1.y, l = hypot(tx, ty) || 1;
    return { x: x + ty / l * lat, y: y - tx / l * lat };
  }
  const a = P.r[i - 1], f = (s - P.L[i - 1]) / Math.max(1e-6, P.L[i] - P.L[i - 1]), b = P.r[i], t = P.t[i - 1];
  return { x: a.x + (b.x - a.x) * f + t.y * lat, y: a.y + (b.y - a.y) * f - t.x * lat };
}

/** A number in [0, 1) from the run's seed and three integers, the same every time. */
function hash01(seed: number, a: number, b: number, c: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const v of [a, b, c]) { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}
/** How late a crossing leaves (s): exponential with mean LATE_S, cut at half the dwell (so every stay alongside is at
 * least half its length, however late the one before and however prompt the one after). */
const lateness = (r: number, dwell: number) => Math.min(dwell / 2, -LATE_S * Math.log(1 - r * 0.999));

/** Where a service is on its schedule at time t (s), before any give-way: how far along its route (m), which way (+1 as
 * drawn), her speed, whether she's under way, and the crossing's own offset to starboard (m). */
interface OnRoute { s: number; dir: number; v: number; moving: boolean; off: number }
function at(sv: Service, id: number, t: number, seed: number): OnRoute {
  const ty = VESSEL[sv.kind], total = PATH[sv.route].total, v = ty.kt * 0.5144;
  const leg = total / v, period = sv.loop ? leg + sv.dwell : 2 * (leg + sv.dwell), vary = VARIES[sv.kind];
  const t0 = t + (sv.phase + (seed % 97) / 970) * period, cycle = Math.floor(t0 / period);
  const u = t0 - cycle * period;
  // (each crossing leaves up to its dwell late, and keeps its own line: both from the run's seed, the service and the crossing)
  const late = (k: number) => vary ? lateness(hash01(seed, id, cycle, k), sv.dwell) : 0;
  const side = (k: number) => vary ? (2 * hash01(seed, id + 100, cycle, k) - 1) * XTRACK : 0;
  if (sv.loop) { const a = late(0); return u < a || u >= a + leg ? { s: 0, dir: 1, v: 0, moving: false, off: 0 } : { s: (u - a) * v, dir: 1, v, moving: true, off: side(0) }; }
  const a = late(0), b = leg + sv.dwell + late(1);
  if (u < a) return { s: 0, dir: -1, v: 0, moving: false, off: 0 };
  if (u < a + leg) return { s: (u - a) * v, dir: 1, v, moving: true, off: side(0) };
  if (u < b) return { s: total, dir: 1, v: 0, moving: false, off: 0 };
  if (u < b + leg) return { s: total - (u - b) * v, dir: -1, v, moving: true, off: side(1) };
  return { s: 0, dir: -1, v: 0, moving: false, off: 0 };
}
/**
 * How far off her line she can be (m), s m along her route: she comes in to her berth on it, and off a sharp corner no
 * farther than its rounding allows (pathAt). Without the second, 300 m inside a 101° corner of the bay-cruise loop she'd
 * have folded back on herself.
 */
function room(P: Path, s: number): number {
  let lim = Math.max(0, (Math.min(s, P.total - s) - ROOM_IN) * ROOM_K);
  for (let j = 1; j < P.L.length - 1; j++) {
    const c = cornerOf(P, j); if (c.k === Infinity) continue;
    // (round a corner whose arms can't grow to her offset: no farther off than its tightest radius allows, with the room
    // growing again past the arms)
    lim = Math.min(lim, 0.8 * c.k * c.rc + ROOM_K * Math.max(0, Math.abs(s - P.L[j]) - c.rc));
  }
  return lim;
}
/** Her place s m along her route, `off` m to starboard of her line as far as `room` lets her, going `dir`. */
function placeAt(P: Path, s: number, dir: number, off: number): Vec {
  const lim = room(P, s);
  return pathAt(P, s, Math.max(-lim, Math.min(lim, off)) * dir);
}

/** How far she goes for each meter along her line (≥ about 1): more on the outside of a bend, or easing off her line. */
function stretch(P: Path, s: number, dir: number, off: number): number {
  const d = s + dir < 0 || s + dir > P.total ? -dir : dir; // (at the end of her route, the meter before it)
  const a = placeAt(P, s, dir, off), b = placeAt(P, s + d, dir, off);
  return Math.max(0.2, hypot(b.x - a.x, b.y - a.y));
}
/** The vessel itself, from her schedule and her give-way state (`hist`: her state then, for her wake). Her heading and
 * speed are the way she's actually moving: along her line, and across it as she alters. */
function vesselOf(sv: Service, id: number, t: number, seed: number, w?: Way, then?: { off: number; lag: number; slow: number }): Vessel {
  const P = PATH[sv.route], st = then ?? w, o = at(sv, id, t - (st?.lag ?? 0), seed);
  const off = o.off + (st?.off ?? 0), p = placeAt(P, o.s, o.dir, off);
  if (!o.moving) { const q = placeAt(P, o.s - o.dir, o.dir, off); return { id, kind: sv.kind, x: p.x, y: p.y, h: brg(p.x - q.x, p.y - q.y), v: 0, moving: false }; }
  // (her speed over the ground, slowed and less what she gives to crossing her line, made good along her line: a meter
  // of it is `stretch` m of her own way round a bend or out to an offset, so her line goes by that much slower)
  const rate = then ? 0 : w?.rate ?? 0, along = o.v * (st?.slow ?? 1) * Math.sqrt(Math.max(0, 1 - Math.min(1, (rate / o.v) ** 2))) / stretch(P, o.s, o.dir, off);
  if (along < 1e-3) { const q = placeAt(P, o.s - o.dir, o.dir, off); return { id, kind: sv.kind, x: p.x, y: p.y, h: brg(p.x - q.x, p.y - q.y), v: 0, moving: true }; }
  // (her velocity: a meter along her line in 1/along s, and across it at `rate` meanwhile)
  const ahead = placeAt(P, o.s + o.dir, o.dir, off + rate / along), vx = (ahead.x - p.x) * along, vy = (ahead.y - p.y) * along;
  return { id, kind: sv.kind, x: p.x, y: p.y, h: brg(vx, vy), v: hypot(vx, vy), moving: true };
}

/** Closest approach of two straight tracks over the next `horizon` s: when (s) and how near (m). */
export function closest(ax: number, ay: number, avx: number, avy: number, bx: number, by: number, bvx: number, bvy: number, horizon: number): { t: number; d: number } {
  const rx = bx - ax, ry = by - ay, ux = bvx - avx, uy = bvy - avy, uu = ux * ux + uy * uy;
  const t = Math.max(0, Math.min(horizon, uu > 1e-6 ? -(rx * ux + ry * uy) / uu : 0));
  return { t, d: hypot(rx + ux * t, ry + uy * t) };
}

/** A boat a vessel keeps clear of: where she is and how she's moving over the ground. */
export interface Craft { x: number; y: number; vx: number; vy: number }

export class Traffic {
  constructor(readonly on: boolean, private seed: number) {}
  /** All the vessels at time t (s since the epoch), with each service's give-way where given (`ways`; a look ahead takes
   * her offset and delay as they are now, not as they'll be). */
  vessels(t: number, ways?: readonly Way[]): Vessel[] { return this.on ? SERVICES.map((s, i) => vesselOf(s, i, t, this.seed, ways?.[i] as Way | undefined)) : []; }

  /**
   * Each give-way vessel, every half second. She looks ahead ACT_S seconds along her own route (its bends, and in to her
   * berth), as she'd go holding an offset g from her line (getting there at her alteration's rate), and each boat as it's
   * going. A boat she isn't already past that would come within CLEAR of her (or nearer than it is now, if it's already
   * that near) is one to clear. She takes the offset nearest where she's going that clears them all, over water
   * (`clearOf`), passing astern of a boat rather than across her bow, and to starboard where both do. With none, the one
   * that leaves the most room, and she slows (Rule 8(e)). With nothing to clear, she goes back to her line once that's
   * clear too. Alongside, she's on her line.
   */
  decide(t: number, ways: Way[], boats: readonly Craft[], clearOf: (p: Vec) => boolean): void {
    if (!this.on) return;
    SERVICES.forEach((sv, id) => {
      if (!GIVES_WAY[sv.kind]) return;
      const w = ways[id], o = at(sv, id, t - w.lag, this.seed), ty = VESSEL[sv.kind], P = PATH[sv.route];
      if (!o.moving) { w.off = w.tgt = w.rate = 0; w.slow = 1; return; }
      const v = o.v, lat = v * Math.sin(ALTER_DEG * D2R), sep = CLEAR + ty.len / 2, now = placeAt(P, o.s, o.dir, o.off + w.off), now_ = now;
      // her place k s on, holding offset g (eased from where she is), on her route; past its end, at her berth
      // (while she crosses her line she makes v·cos(ALTER_DEG) along it: advance's lag)
      const cosA = Math.cos(ALTER_DEG * D2R);
      const along = (g: number, k: number) => v * k - v * (1 - cosA) * Math.min(k, Math.abs(g - w.off) / lat);
      const ahead = (g: number, k: number): Vec => {
        const side = w.off + Math.sign(g - w.off) * Math.min(Math.abs(g - w.off), lat * k);
        return placeAt(P, o.s + o.dir * along(g, k), o.dir, o.off + side);
      };
      // (the boats she could meet in ACT_S, and not already past: drawing apart, and astern of her beam)
      const range = boats.filter(b => hypot(b.x - now.x, b.y - now.y) <= (v + 4) * (ACT_S + 60) + sep);
      const near = range.filter(b => {
        const rx = b.x - now.x, ry = b.y - now.y, h = ahead(w.off, 1), ux = h.x - now.x, uy = h.y - now.y;
        return !(rx * ux + ry * uy < 0 && rx * (b.vx - ux * v) + ry * (b.vy - uy * v) > 0);
      });
      // how a choice of offset meets each boat (of `list`): the least room against what's needed (CLEAR, or as near as
      // the boat already is), and whether she'd cross ahead of one. (`now`: only the boats whose closest approach is
      // within ACT_S count, for whether to act at all; a choice of offset is judged a minute further on, so it doesn't
      // just put off meeting one)
      const meet = (g: number, now = false, list = near) => {
        let worst = Infinity, ahead_ = false, close = false;
        list.forEach(b => {
          const need = Math.min(sep, hypot(b.x - now_.x, b.y - now_.y) - 1);
          let m = Infinity, km = 0;
          for (let k = 1; k <= ACT_S + 60; k += 2) { const q = ahead(g, k), d = hypot(b.x + b.vx * k - q.x, b.y + b.vy * k - q.y); if (d < m) { m = d; km = k; } }
          if (now && km > ACT_S) return;
          if (m - need < worst) worst = m - need;
          if (m < sep) close = true;
          // (at the closest, is she ahead of the boat's bow? a boat moving, and she on the side it's heading for)
          const q = ahead(g, km), bx = b.x + b.vx * km, by = b.y + b.vy * km, bv = hypot(b.vx, b.vy);
          if (m < 2 * sep && bv > 0.3 && (q.x - bx) * b.vx + (q.y - by) * b.vy > 0) ahead_ = true;
        });
        return { worst, ahead: ahead_, close };
      };
      // (water to turn into: looked for only where she'd be off her line by more than a crossing's own spread; her line
      // itself, and her way in to her berth, are her route's water)
      function water(g: number): boolean {
        for (let k = 0; k <= ACT_S; k += 10) {
          const s = o.s + o.dir * along(g, k), side = w.off + Math.sign(g - w.off) * Math.min(Math.abs(g - w.off), lat * k), lim = room(P, s);
          if (Math.abs(Math.max(-lim, Math.min(lim, o.off + side))) <= XTRACK) continue;
          if (!clearOf(ahead(g, k))) return false;
        }
        return true;
      }
      const here = meet(w.tgt, true);
      if (!here.close && here.worst >= 0) { // nothing to clear where she's going: back to her line, once that's clear too
        // (of every boat about, those she's past as well: going back across her line she mustn't close one astern of her beam)
        if (w.tgt !== 0) { const back = meet(0, false, range); if (!back.close && back.worst >= 0 && water(0)) w.tgt = 0; }
        w.slow = 1; return;
      }
      let best = NaN, bestCost = Infinity, most = -Infinity, mostG = w.off;
      for (let g = -MAX_OFF; g <= MAX_OFF; g += 25) {
        if (!water(g)) continue;
        const m = meet(g);
        if (m.worst > most) { most = m.worst; mostG = g; }
        if (m.worst < 0) continue;
        const cost = Math.abs(g - w.off) + (m.ahead ? 150 : 0) + (g < w.off ? 20 : 0); // (astern of her, and starboard, preferred)
        if (cost < bestCost) { best = g; bestCost = cost; }
      }
      if (best === best) { w.tgt = best; w.slow = 1; }
      else { w.tgt = mostG; w.slow = most < -sep / 2 ? 0 : SLOW; } // (nowhere clears: the most room, and slowed, or stopped)
    });
  }

  /** Each give-way vessel's offset eased toward where she's going, and the time her slowing and turning cost her kept
   * as lag; her history kept every HIST_S of the traffic's clock, for her wake. Every step. */
  advance(t: number, dt: number, ways: Way[]): void {
    if (!this.on) return;
    SERVICES.forEach((sv, id) => {
      if (!GIVES_WAY[sv.kind]) return;
      const w = ways[id], o = at(sv, id, t - w.lag, this.seed);
      if (o.moving) {
        const lat = o.v * Math.sin(ALTER_DEG * D2R), d = w.tgt - w.off, step = Math.sign(d) * Math.min(Math.abs(d), lat * dt);
        w.off += step; w.rate = dt > 0 ? step / dt : 0;
        // (what she doesn't make good along her line: slowed, crossing it at `rate`, or going the long way round a bend)
        w.lag += (1 - w.slow * Math.sqrt(Math.max(0, 1 - (w.rate / o.v) ** 2)) / stretch(PATH[sv.route], o.s, o.dir, o.off + w.off)) * dt;
      } else { // (alongside, on her line, making up lost time, or waiting out what she gained on the inside of a bend)
        w.off = w.tgt = w.rate = 0; w.slow = 1;
        w.lag = w.lag > 0 ? Math.max(0, w.lag - dt) : Math.min(0, w.lag + dt);
      }
      const slot = Math.floor(t / HIST_S);
      if (slot !== w.histT) { w.histT = slot; w.hist.push(w.off, w.lag, w.slow); if (w.hist.length > 3 * HIST) w.hist.splice(0, 3); }
    });
  }

  /**
   * The wake reaching point p at time t: the strongest Kelvin arm passing under it now. Height (m), period (s) and the
   * direction the waves come from (deg), or null. Looks back along each vessel's track: where she was then, with her
   * offset, delay and speed then from her history.
   */
  wakeAt(p: Vec, t: number, ways?: readonly Way[]): { h: number; t: number; from: number; by: VesselKind } | null {
    if (!this.on) return null;
    let best: { h: number; t: number; from: number; by: VesselKind } | null = null;
    const tan = Math.tan(19.47 * D2R);
    SERVICES.forEach((sv, i) => {
      const w = ways?.[i] as Way | undefined, now = vesselOf(sv, i, t, this.seed, w), ty = VESSEL[sv.kind];
      if (hypot(now.x - p.x, now.y - p.y) > 2500) return;
      for (let age = 4; age < 240; age += 4) {
        // (her state in the slot that time fell in: the newest slot is the one t is in)
        const back = Math.floor(t / HIST_S) - Math.floor((t - age) / HIST_S), k = w && GIVES_WAY[sv.kind] ? w.hist.length / 3 - 1 - back : -1;
        const then = k >= 0 ? { off: w!.hist[3 * k], lag: w!.hist[3 * k + 1], slow: w!.hist[3 * k + 2] } : w && GIVES_WAY[sv.kind] ? { off: w.off, lag: w.lag, slow: w.slow } : undefined;
        const q = vesselOf(sv, i, t - age, this.seed, undefined, then);
        if (!q.moving) continue;
        const u = { x: Math.sin(q.h * D2R), y: Math.cos(q.h * D2R) }, n = { x: u.y, y: -u.x };
        const spread = q.v * age * tan, rx = p.x - q.x, ry = p.y - q.y, along = rx * u.x + ry * u.y, side = rx * n.x + ry * n.y;
        if (Math.abs(along) > q.v * 4 || Math.abs(Math.abs(side) - spread) > 12 + ty.beam * 0.2) continue;
        const h = ty.wakeH * Math.pow(Math.max(1, spread / (ty.len * 0.3)), -1 / 3) * Math.min(1, (q.v / 4) ** 2);
        if (!best || h > best.h) best = { h, t: 2 * Math.PI * q.v * 0.82 / 9.81, from: brg(q.x - p.x, q.y - p.y), by: sv.kind }; // from the vessel's track
      }
    });
    return best;
  }
}

/** Hull outline of a vessel, for collisions: a line along its track and half its beam. */
export function vesselHull(v: Vessel): { a: Vec; b: Vec; r: number } {
  const ty = VESSEL[v.kind], u = { x: Math.sin(v.h * D2R), y: Math.cos(v.h * D2R) };
  return { a: { x: v.x + u.x * ty.len / 2, y: v.y + u.y * ty.len / 2 }, b: { x: v.x - u.x * ty.len / 2, y: v.y - u.y * ty.len / 2 }, r: ty.beam / 2 };
}
