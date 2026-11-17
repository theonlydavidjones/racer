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
  // (on to Oakland under the Bay Bridge's west span and along the south side of Yerba Buena Island to the Oakland Bar
  // Channel (US Coast Pilot 7, ch. 7): the line drawn across Treasure Island and Yerba Buena before ran over both. The
  // line itself is an estimate, every part of it at least 100 m off the land (tests/traffic-routes.test.ts))
  channel: route([[37.8060, -122.5350], [37.8160, -122.4790], [37.8240, -122.4500], [37.8330, -122.4200], [37.8150, -122.3950], [37.7990, -122.3790], [37.8000, -122.3640], [37.8060, -122.3500]]),
  // (out clear of the pier heads: Piers 35 to 27 reach out to 37.810; geo/shore.ts)
  sausalito: route([[37.7960, -122.3910], [37.8050, -122.3930], [37.8110, -122.4040], [37.8190, -122.4330], [37.8400, -122.4640], [37.8560, -122.4770]]),
  alcatraz: route([[37.8085, -122.4030], // (off the head of Pier 33, the Alcatraz landing)
     [37.8180, -122.4130], [37.8262, -122.4212]]),
  // (from the berth on the west side of Pier 41, where OpenStreetMap's ferry routes end, out round Pier 45 and the Wharf's
  // breakwater; under the Golden Gate Bridge mid-span and back under it just outside, past Fort Point, as the operators'
  // cruise is described (a tourism guide; their route maps weren't reachable from here); home round the east end of
  // Alcatraz. The line before ran over Lime Point and across Alcatraz. The turn and the line are estimates, every part of
  // it at least 100 m off the land with a crossing's spread (tests/traffic-routes.test.ts))
  tour: route([[37.8102, -122.4135], [37.8128, -122.4140], [37.8128, -122.4300], [37.8145, -122.4560], [37.8165, -122.4750], [37.8180, -122.4850], [37.8215, -122.4810], [37.8240, -122.4650], [37.8300, -122.4500], [37.8310, -122.4250], [37.8280, -122.4150], [37.8200, -122.4110], [37.8102, -122.4135]]),
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
 *   ROOM_IN m, and off it no more than ROOM_K m for each m farther out (about 14°: a gentle turn in or out at speed).
 */
export const ACT_S = 180, CLEAR = 150, ALTER_DEG = 30, MAX_OFF = 300;
const SLOW = 0.3, ROOM_IN = 50, ROOM_K = 0.25;
/**
 * How she turns and slows (estimates; no figure for these vessels was found): she turns at up to TURN_DEG_S a second (a
 * small fraction of what full helm gives a ferry: the IMO's manoeuvring standards, MSC.137(76), ask a ship to turn in a
 * circle no wider than five of her lengths, about 13°/s for a 50 m ferry at 17 kt), and changes speed by up to
 * SPEED_RATE of her service speed a second. She stops (Rule 8(e): "take all way off") only for a boat she'd otherwise
 * meet within STOP_S seconds; farther off, slowing gives the boat time to go by.
 */
export const TURN_DEG_S = 3, SPEED_RATE = 0.08, STOP_S = 60;
/** A new choice must clear every boat by this much more than it needs (m): her plan is a forecast, and she keeps a
 * choice while it still clears at all (so she doesn't swap on a few meters). An estimate. */
const MARGIN = 25;
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
 * cost her; `slow`: her speed's share now, and `slowTgt` what she's easing it to; `h`: her heading, the way she last
 * moved (NaN alongside). `hist`: her `off`, `lag`, `slow` and `h` every HIST_S of the traffic's clock for the
 * last 4 minutes (her wake's arms are where she was, not where she is); `histT`, the last of those slots.
 */
export interface Way { off: number; tgt: number; rate: number; lag: number; slow: number; slowTgt: number; h: number; hist: number[]; histT: number }
export const newWays = (): Way[] => SERVICES.map(() => ({ off: 0, tgt: 0, rate: 0, lag: 0, slow: 1, slowTgt: 1, h: NaN, hist: [], histT: NaN }));
const HIST_N = 4; // (off, lag, slow, h in each slot)
const HIST = 60, HIST_S = 4;

/** A route's geometry: its points, the distance along it to each, and each leg's direction. */
interface Path { r: Vec[]; L: number[]; total: number; t: Vec[]; c: { k: number; rc: number }[]; turnR: number; arm: number[] }
/** At corner j of a route (between leg j−1 and leg j): how sharply it turns, cos²(θ/2)/sin(θ/2) (the rounding's least
 * radius for each meter of its arms: Infinity for no turn), and the most its arms can be (nearly half of either leg). */
function cornerOf(t: Vec[], L: number[], j: number): { k: number; rc: number } {
  const a = t[j - 1], b = t[j], half = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) / 2;
  return { k: half < 1e-3 ? Infinity : Math.cos(half) ** 2 / Math.sin(half), rc: 0.45 * Math.min(L[j] - L[j - 1], L[j + 1] - L[j]) };
}
/** The arm (m) of the rounding at a corner, for a vessel `lat` m off the line: her offset and 40 m, and long enough
 * that the rounding's tightest radius is her turning radius (turnR) and a quarter more than her offset (so on the inside
 * she never folds back, and on her line she turns no faster than TURN_DEG_S); no longer than nearly half of either leg. */
const armOf = (c: { k: number; rc: number }, lat: number, turnR: number) => Math.min(c.rc, Math.max(40 + Math.abs(lat), (1.25 * Math.abs(lat) + turnR) / c.k));
const PATH: Record<string, Path> = Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => {
  const L = [0], t: Vec[] = [];
  for (let i = 1; i < r.length; i++) { const dx = r[i].x - r[i - 1].x, dy = r[i].y - r[i - 1].y, l = hypot(dx, dy); L.push(L[i - 1] + l); t.push({ x: dx / l, y: dy / l }); }
  const c = r.map((_, j) => j >= 1 && j <= r.length - 2 ? cornerOf(t, L, j) : { k: Infinity, rc: 0 });
  // (the radius the fastest vessel on the route turns in at TURN_DEG_S: her corners are rounded no tighter)
  const vmax = Math.max(...SERVICES.filter(sv => sv.route === k).map(sv => VESSEL[sv.kind].kt * 0.5144));
  const turnR = vmax / (TURN_DEG_S * D2R);
  // (each corner's rounding fixed for the farthest she can be off her line there, not her offset now: grown with her
  // offset, it slid her along her line as it grew and kinked her way 10–20° in a step when it reached its cap)
  const arm = c.map(cj => cj.k === Infinity ? 0 : armOf(cj, Math.min(MAX_OFF + XTRACK, 0.8 * cj.k * cj.rc), turnR));
  return [k, { r, L, total: L[L.length - 1], t, c, turnR, arm }];
}));
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
    const r = P.arm[j]; if (!(r > 0)) continue;
    const u = (s - (P.L[j] - r)) / (2 * r);
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
  // (their corners eased over ROOM_EASE m, so easing out to an offset she never turns all at once)
  let lim = ramp(softMin(s, P.total - s) - ROOM_IN) * ROOM_K; // (soft at mid-route too: a short route's middle had a corner)
  for (let j = 1; j < P.L.length - 1; j++) {
    const c = P.c[j]; if (c.k === Infinity) continue;
    // (round a corner whose arms can't grow to her offset: no farther off than its tightest radius allows, with the room
    // growing again past the arms)
    lim = softMin(lim, 0.8 * c.k * c.rc + ROOM_K * ramp(Math.abs(s - P.L[j]) - c.rc));
  }
  return Math.max(0, lim);
}
const ROOM_EASE = 60;
/** max(0, x), its corner rounded over ±ROOM_EASE. */
const ramp = (x: number) => x >= ROOM_EASE ? x : x <= -ROOM_EASE ? 0 : (x + ROOM_EASE) ** 2 / (4 * ROOM_EASE);
/** min(a, b), its corner rounded over ROOM_EASE. */
const softMin = (a: number, b: number, e = ROOM_EASE) => { const h = Math.max(e - Math.abs(a - b), 0) / e; return Math.min(a, b) - h * h * e / 4; };
/** Her place s m along her route, `off` m to starboard of her line as far as `room` lets her, going `dir`. */
function placeAt(P: Path, s: number, dir: number, off: number): Vec {
  return pathAt(P, s, held(off, room(P, s)) * dir);
}
/** Her offset `off` held within ±lim, smoothly: near `off` itself well inside the limit, closing on the limit beyond it,
 * with no corner where it takes over (a hard one turned her 14° at once) and no flat spot near her line. */
const held = (off: number, lim: number) => lim <= 1e-6 ? 0 : off / Math.pow(1 + (Math.abs(off) / lim) ** 4, 0.25);

/** How far she goes for each meter along her line (≥ about 1): more on the outside of a bend, or easing off her line. */
function stretch(P: Path, s: number, dir: number, off: number): number {
  const d = s + dir < 0 || s + dir > P.total ? -dir : dir; // (at the end of her route, the meter before it)
  const a = placeAt(P, s, dir, off), b = placeAt(P, s + d, dir, off);
  return Math.max(0.2, hypot(b.x - a.x, b.y - a.y));
}
/** Her speed made good along her line (m/s): her speed (`slow` of her service speed v) less what she gives to crossing it at `rate`. */
const madeGood = (v: number, slow: number, rate: number) => Math.sqrt(Math.max(0, (v * slow) ** 2 - rate * rate));
/** The vessel itself, from her schedule and her give-way state (`hist`: her state then, for her wake). Her heading and
 * speed are the way she's actually moving: along her line, and across it as she alters. */
function vesselOf(sv: Service, id: number, t: number, seed: number, w?: Way, then?: { off: number; lag: number; slow: number; h: number }): Vessel {
  const P = PATH[sv.route], st = then ?? w, o = at(sv, id, t - (st?.lag ?? 0), seed);
  const off = o.off + (st?.off ?? 0), p = placeAt(P, o.s, o.dir, off);
  if (!o.moving) { const q = placeAt(P, o.s - o.dir, o.dir, off); return { id, kind: sv.kind, x: p.x, y: p.y, h: brg(p.x - q.x, p.y - q.y), v: 0, moving: false }; }
  // (her speed over the ground, slowed and less what she gives to crossing her line, made good along her line: a meter
  // of it is `stretch` m of her own way round a bend or out to an offset, so her line goes by that much slower)
  const rate = then ? 0 : w?.rate ?? 0, along = madeGood(o.v, st?.slow ?? 1, rate) / stretch(P, o.s, o.dir, off), known = st?.h;
  if (along < 1e-3) { // (stopped out on the water: heading along her own way there)
    const end = o.s + o.dir < 0 || o.s + o.dir > P.total, q = placeAt(P, end ? o.s - o.dir : o.s + o.dir, o.dir, off);
    return { id, kind: sv.kind, x: p.x, y: p.y, h: known != null && known === known ? known : end ? brg(p.x - q.x, p.y - q.y) : brg(q.x - p.x, q.y - p.y), v: 0, moving: true };
  }
  // (her heading: along her own way at her offset (at her route's end, the meter before), turned by her crossing it at
  // `rate`; that turn fading as she nearly stops, where crossing and going ahead fall away together)
  const end = o.s + o.dir < 0 || o.s + o.dir > P.total;
  const q = end ? placeAt(P, o.s - o.dir, o.dir, off) : placeAt(P, o.s + o.dir, o.dir, off), sp = o.v * (st?.slow ?? 1);
  const way = end ? brg(p.x - q.x, p.y - q.y) : brg(q.x - p.x, q.y - p.y), crab = Math.atan2(rate, madeGood(o.v, st?.slow ?? 1, rate)) / D2R * Math.min(1, sp / 2);
  // (where advance has stepped her, the way she actually moved last: that's her heading)
  return { id, kind: sv.kind, x: p.x, y: p.y, h: known != null && known === known ? known : (way + crab + 360) % 360, v: sp, moving: true }; // (advance keeps her moving at just this speed)
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
   * A give-way vessel, every half second (`only`: the one service to decide now; each has its own step, so they don't
   * all land on one). She looks ahead along her own route (its bends, and in to her berth), as she'd go holding an
   * offset g from her line and a share sf of her speed, and at each boat as it's going. A boat she isn't already past
   * whose closest approach is within ACT_S and nearer than CLEAR past her half-length (or than it is now, if it's
   * already that near), or her water running out where she's headed, is reason to act. Then she takes the choice that
   * clears every boat over water (`clearOf`): nearest where she's going, passing astern of a boat rather than across
   * her bow, to starboard where both do, and turning before slowing. With none, the one that leaves the most room,
   * slowed, and stopped only for a boat she'd meet within STOP_S; she keeps her choice unless another is plainly better,
   * so she doesn't swing from side to side. With nothing to clear, back to her line once that's clear too.
   */
  decide(t: number, ways: Way[], boats: readonly Craft[], clearOf: (p: Vec) => boolean, only?: number): void {
    if (!this.on) return;
    SERVICES.forEach((sv, id) => {
      if (!GIVES_WAY[sv.kind] || (only !== undefined && id !== only)) return;
      const w = ways[id], o = at(sv, id, t - w.lag, this.seed), ty = VESSEL[sv.kind], P = PATH[sv.route];
      if (!o.moving) { w.off = w.tgt = w.rate = 0; w.slow = w.slowTgt = 1; return; }
      const v = o.v, sinA = Math.sin(ALTER_DEG * D2R), sep = CLEAR + ty.len / 2, here = placeAt(P, o.s, o.dir, o.off + w.off);
      const K = 2, N = Math.round((ACT_S + 60) / K); // (looked at every K s, out to a minute past ACT_S)
      // her way ahead holding offset g at speed share sf: getting to g at the alteration's rate, making v·sf·cos along
      // her line meanwhile; past her route's end, at her berth. Each point and how far off her line she is there
      // (her turn builds up at TURN_DEG_S: across her line she gets ½·acc·k² until she's crossing it at full rate)
      const plan = (g: number, sf: number) => {
        const pts: Vec[] = [], lats: number[] = [], lat = Math.max(1e-6, v * sf * sinA), acc = Math.max(1e-6, v * sf * TURN_DEG_S * D2R), tr = lat / acc;
        const d = Math.abs(g - w.off), across = (k: number) => Math.min(d, k < tr ? 0.5 * acc * k * k : 0.5 * acc * tr * tr + lat * (k - tr));
        const T = d <= 0.5 * acc * tr * tr ? Math.sqrt(2 * d / acc) : tr + (d - 0.5 * acc * tr * tr) / lat;
        // (along her line by what she makes good over the ground: v·sf a second, less what goes to crossing her line,
        // and her line going by faster on the inside of a bend, slower on the outside: each step scaled by how far the
        // last one actually took her, as advance does)
        // (her way's own length for a meter of her line at her offset there, as advance has it: the cos(ALTER_DEG) already
        // takes off what goes to crossing it, so this is her way along it alone)
        // (the stretch changes slowly along her way: looked at every fifth point, 10 s of it)
        let s = o.s, st = 1;
        for (let n = 0; n <= N; n++) {
          const k = n * K, side = w.off + Math.sign(g - w.off) * across(k);
          if (n > 0) {
            if ((n - 1) % 5 === 0) st = stretch(P, s, o.dir, o.off + side);
            const ground = v * sf * K * (k - K < T ? Math.cos(ALTER_DEG * D2R) : 1);
            s = Math.max(0, Math.min(P.total, s + o.dir * ground / st));
          }
          pts.push(placeAt(P, s, o.dir, o.off + side)); lats.push(held(o.off + side, room(P, s)));
        }
        return { pts, lats, T };
      };
      // (the boats she could meet: within reach, not already past (abaft her beam and drawing away), and not so far
      // from her way that no offset could bring them near)
      const cur = plan(w.tgt, w.slowTgt), hdx = cur.pts[1].x - here.x, hdy = cur.pts[1].y - here.y;
      const range = boats.filter(b => {
        let m = Infinity;
        for (let n = 0; n <= N; n++) { const k = n * K, q = cur.pts[n]; m = Math.min(m, hypot(b.x + b.vx * k - q.x, b.y + b.vy * k - q.y)); }
        return m < sep + 2 * MAX_OFF;
      });
      const near = range.filter(b => {
        const rx = b.x - here.x, ry = b.y - here.y, vx = hdx / K, vy = hdy / K;
        return !(rx * hdx + ry * hdy < 0 && rx * (b.vx - vx) + ry * (b.vy - vy) > 0);
      });
      // how a plan meets each boat (of `list`): the least room against what's needed (CLEAR, or as near as the boat
      // already is), when, whether she'd cross ahead of one, and the soonest shortfall. (`soon`: only the boats whose
      // closest approach is within ACT_S count, for whether to act at all)
      const meet = (p: { pts: Vec[] }, soon = false, list = near) => {
        let worst = Infinity, ahead = false, close = false, when = Infinity;
        for (const b of list) {
          const need = Math.min(sep, hypot(b.x - here.x, b.y - here.y) - 1);
          let m = Infinity, nm = 0;
          for (let n = 1; n <= N; n++) { const k = n * K, q = p.pts[n], d = hypot(b.x + b.vx * k - q.x, b.y + b.vy * k - q.y); if (d < m) { m = d; nm = n; } }
          if (soon && nm * K > ACT_S) continue;
          if (m - need < worst) worst = m - need;
          if (m < sep) { close = true; when = Math.min(when, nm * K); }
          // (at the closest, is she ahead of the boat's bow? a boat moving, and she on the side it's heading for)
          const q = p.pts[nm], bx = b.x + b.vx * nm * K, by = b.y + b.vy * nm * K;
          if (m < 2 * sep && hypot(b.vx, b.vy) > 0.3 && (q.x - bx) * b.vx + (q.y - by) * b.vy > 0) ahead = true;
        }
        return { worst, ahead, close, when };
      };
      // (water to turn into: looked for only where she'd be off her line by more than a crossing's own spread; her line
      // itself, and her way in to her berth, are her route's water)
      const water = (p: { pts: Vec[]; lats: number[] }) => {
        for (let n = 0; n <= Math.min(N, ACT_S / K); n += 2) if (Math.abs(p.lats[n]) > XTRACK && !clearOf(p.pts[n])) return false;
        return true;
      };
      // the choices: every offset at her full speed (with MARGIN to spare: her plan is a forecast); failing those, the
      // roomiest few slowed. Turning is preferred to slowing, astern of a boat to across her bow, and starboard
      const choose = (slowed: boolean) => {
        let best: { g: number; sf: number } | null = null, bestCost = Infinity;
        const tried: { g: number; sf: number; worst: number; when: number }[] = [];
        // (coming back up to speed, not an offset she can't get to and back from before her berth)
        const toBerth = (o.dir > 0 ? P.total - o.s : o.s) / v;
        const consider = (g: number, sf: number) => {
          const p = plan(g, sf); if (!water(p)) return;
          if (!slowed && 2 * p.T + 30 > toBerth && g !== 0) return;
          const m = meet(p); tried.push({ g, sf, worst: m.worst, when: m.when });
          if (m.worst < MARGIN) return;
          const cost = Math.abs(g - w.off) + (m.ahead ? 150 : 0) + (g < w.off ? 20 : 0) + (1 - sf) * 300;
          if (cost < bestCost) { best = { g, sf }; bestCost = cost; }
        };
        for (let g = -MAX_OFF; g <= MAX_OFF; g += 25) consider(g, 1);
        if (!best && slowed) {
          const roomiest = [...tried].sort((x, y) => y.worst - x.worst).slice(0, 3).map(c => c.g);
          for (const g of new Set([...roomiest, w.tgt, 0])) for (const sf of [0.6, SLOW]) consider(g, sf);
        }
        return { best: best as { g: number; sf: number } | null, tried };
      };
      const now = meet(cur, true);
      if (!now.close && now.worst >= MARGIN / 2 && water(cur)) { // nothing to clear where she's going (her choice holds while it clears by half her margin)
        if (w.tgt !== 0 || w.slowTgt !== 1) {
          // back to her line once that's clear too (of every boat about, those she's past as well: going back across her
          // line she mustn't close one astern of her beam); slowed, back up to speed as soon as any offset allows it
          const line = plan(0, 1), back = meet(line, false, range);
          if (!back.close && back.worst >= MARGIN && water(line)) { w.tgt = 0; w.slowTgt = 1; }
          else if (w.slowTgt !== 1) { const c = choose(false); if (c.best) { w.tgt = c.best.g; w.slowTgt = 1; } }
        }
        return;
      }
      const c = choose(true);
      if (c.best) { w.tgt = c.best.g; w.slowTgt = c.best.sf; return; }
      // nowhere clears: the most room, at the speed it was judged at, held unless another is better by 20 m (no
      // swinging between near-equal sides); stopped only for a boat she'd otherwise meet within STOP_S
      if (!c.tried.length) { w.tgt = 0; w.slowTgt = SLOW; return; } // (no water to turn into: on her line, slowed)
      const keep = c.tried.find(x => x.g === w.tgt && x.sf === w.slowTgt);
      let pick = c.tried.reduce((x, y) => y.worst > x.worst ? y : x);
      if (keep && keep.worst >= pick.worst - 20) pick = keep;
      w.tgt = pick.g;
      w.slowTgt = pick.when <= STOP_S && pick.worst < -sep / 2 ? 0 : pick.sf;
    });
  }

  /** Each give-way vessel's offset eased toward where she's going, turning at no more than TURN_DEG_S and changing
   * speed at no more than SPEED_RATE; the time her slowing and turning cost her kept as lag; her history kept every
   * HIST_S of the traffic's clock, for her wake. Every step. */
  advance(t: number, dt: number, ways: Way[]): void {
    if (!this.on) return;
    SERVICES.forEach((sv, id) => {
      if (!GIVES_WAY[sv.kind]) return;
      const w = ways[id], o = at(sv, id, t - w.lag, this.seed);
      if (o.moving) {
        w.slow += Math.sign(w.slowTgt - w.slow) * Math.min(Math.abs(w.slowTgt - w.slow), SPEED_RATE * dt);
        // (across her line at up to v·sin(ALTER_DEG); the rate of that changing as fast as her turning allows, and easing
        // off in time to arrive at her offset; stopped, she holds where she is)
        // (where she's going held to 1.5 × her room there, where `held` has all but closed on it: she eases in to that,
        // as to any offset, rather than meeting it all at once)
        const P = PATH[sv.route], lim = 1.5 * room(P, o.s), aim = Math.max(-lim, Math.min(lim, o.off + w.tgt)) - o.off;
        const sp = o.v * w.slow, top = sp * Math.sin(ALTER_DEG * D2R), acc = Math.max(1e-6, sp * TURN_DEG_S * D2R), d = aim - w.off;
        // (taking all way off, she stops crossing her line first: her bow comes back to her way as she stops)
        const want = w.slowTgt === 0 ? 0 : Math.sign(d) * Math.min(top, Math.sqrt(2 * acc * Math.abs(d)));
        w.rate += Math.sign(want - w.rate) * Math.min(Math.abs(want - w.rate), acc * dt);
        w.rate = Math.max(-top, Math.min(top, w.rate));
        const sPrev = Math.max(0, Math.min(P.total, o.s - o.dir * o.v * dt)), p0 = placeAt(P, sPrev, o.dir, o.off + w.off);
        w.off += w.rate * dt;
        if (Math.abs(aim - w.off) < 1e-3 && Math.abs(w.rate) < acc * dt) { w.off = aim; w.rate = 0; } // (a millimeter: a step is only some 15 cm, and a bigger snap turned her heading 15° at once)
        // (and never past twice her room, should her room close faster than she can ease in: her offset can't run on past
        // what she can actually be at)
        const tot = o.off + w.off;
        if (Math.abs(tot) > 2 * lim / 1.5) { w.off = Math.sign(tot) * 2 * lim / 1.5 - o.off; w.rate = 0; }
        // how far along her line she gets this step: as far as makes her own way, over the ground, her speed × dt (she
        // goes the long way round the outside of a bend, and across her line as she alters): the rest is lag. (Her way's
        // length grows as the root of its two parts' squares: across, fixed by her offset; along, by how far she goes)
        const pl = placeAt(P, sPrev, o.dir, o.off + w.off), p1 = placeAt(P, o.s, o.dir, o.off + w.off);
        const d0 = (pl.x - p0.x) ** 2 + (pl.y - p0.y) ** 2, d1 = (p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2, g = (sp * dt) ** 2;
        // (a step that began or ended at her berth is only partly under way: taken as it comes)
        const clipped = sPrev !== o.s - o.dir * o.v * dt;
        let frac = clipped ? 1 : d1 - d0 > 1e-12 ? Math.sqrt(Math.max(0, (g - d0) / (d1 - d0))) : w.slow;
        if (!clipped && frac > 0) { // (and corrected once by how far that actually takes her: inside a sharp corner her way bends hard)
          frac = Math.min(frac, 10);
          const p2 = placeAt(P, sPrev + o.dir * o.v * dt * frac, o.dir, o.off + w.off), d2 = hypot(p2.x - p0.x, p2.y - p0.y);
          if (d2 > 1e-9) frac *= Math.sqrt(g) / d2;
        }
        w.lag += dt * (1 - Math.min(frac, 10));
        // (her heading: the way she actually moved this step)
        const p3 = placeAt(P, sPrev + o.dir * o.v * dt * Math.min(frac, 10), o.dir, o.off + w.off);
        if (hypot(p3.x - p0.x, p3.y - p0.y) > 1e-4) w.h = brg(p3.x - p0.x, p3.y - p0.y);
      } else { // (alongside, on her line, making up lost time, or waiting out what she gained on the inside of a bend)
        w.off = w.tgt = w.rate = 0; w.slow = w.slowTgt = 1; w.h = NaN;
        // (her clock held only while that keeps her alongside: held at the step she came in, she'd read as still under way)
        const lag = w.lag > 0 ? Math.max(0, w.lag - dt) : Math.min(0, w.lag + dt);
        if (!at(sv, id, t - lag, this.seed).moving) w.lag = lag;
      }
      const slot = Math.floor(t / HIST_S);
      if (slot !== w.histT) { w.histT = slot; w.hist.push(w.off, w.lag, w.slow, w.h); if (w.hist.length > HIST_N * HIST) w.hist.splice(0, HIST_N); }
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
        const back = Math.floor(t / HIST_S) - Math.floor((t - age) / HIST_S), k = w && GIVES_WAY[sv.kind] ? w.hist.length / HIST_N - 1 - back : -1, H = w?.hist;
        const then = k >= 0 ? { off: H![HIST_N * k], lag: H![HIST_N * k + 1], slow: H![HIST_N * k + 2], h: H![HIST_N * k + 3] } : w && GIVES_WAY[sv.kind] ? { off: w.off, lag: w.lag, slow: w.slow, h: w.h } : undefined;
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
