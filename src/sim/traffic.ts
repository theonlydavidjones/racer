import { D2R, brg, clamp, segPt, type Vec } from '../core/math';
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
  alcatraz: { name: 'Alcatraz ferry', len: 40, beam: 11, kt: 10, wakeH: 0.35 },
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

function lengths(r: Vec[]): number[] { const out = [0]; for (let i = 1; i < r.length; i++) out.push(out[i - 1] + Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)); return out; }
const LEN = Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [k, lengths(r)]));

/** Where a service is at time t (s): back and forth along its route (or round its loop), pausing at the ends. */
function at(s: Service, id: number, t: number, seed: number): Vessel {
  const ty = VESSEL[s.kind], r = ROUTES[s.route], L = LEN[s.route], total = L[L.length - 1], v = ty.kt * 0.5144;
  const leg = total / v, period = s.loop ? leg + s.dwell : 2 * (leg + s.dwell);
  let u = ((t + (s.phase + (seed % 97) / 970) * period) % period + period) % period;
  let dir = 1, moving = true, d = 0;
  if (s.loop) { if (u > leg) { moving = false; d = 0; } else d = u * v; }
  else {
    if (u < leg) d = u * v; else if (u < leg + s.dwell) { d = total; moving = false; }
    else if (u < 2 * leg + s.dwell) { d = total - (u - leg - s.dwell) * v; dir = -1; } else { d = 0; moving = false; dir = -1; }
  }
  let i = 1; while (i < L.length - 1 && L[i] < d) i++;
  const f = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), a = r[i - 1], b = r[i];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, h = brg((b.x - a.x) * dir, (b.y - a.y) * dir);
  return { id, kind: s.kind, x, y, h, v: moving ? v : 0, moving };
}

export class Traffic {
  constructor(readonly on: boolean, private seed: number) {}
  /** All the vessels at time t (the race clock plus the time of day, so the schedule runs continuously). */
  vessels(t: number): Vessel[] { return this.on ? SERVICES.map((s, i) => at(s, i, t, this.seed)) : []; }

  /**
   * The wake reaching point p at time t: the strongest Kelvin arm passing under it now. Height (m), period (s) and the
   * direction the waves come from (deg), or null. Looks back along each vessel's track (positions from the clock).
   */
  wakeAt(p: Vec, t: number): { h: number; t: number; from: number; by: VesselKind } | null {
    if (!this.on) return null;
    let best: { h: number; t: number; from: number; by: VesselKind } | null = null;
    const tan = Math.tan(19.47 * D2R);
    SERVICES.forEach((s, i) => {
      const now = at(s, i, t, this.seed), ty = VESSEL[s.kind];
      if (Math.hypot(now.x - p.x, now.y - p.y) > 2500) return;
      for (let age = 4; age < 240; age += 4) {
        const q = at(s, i, t - age, this.seed);
        if (!q.moving) continue;
        const u = { x: Math.sin(q.h * D2R), y: Math.cos(q.h * D2R) }, n = { x: u.y, y: -u.x };
        const spread = q.v * age * tan, rx = p.x - q.x, ry = p.y - q.y, along = rx * u.x + ry * u.y, side = rx * n.x + ry * n.y;
        if (Math.abs(along) > q.v * 4 || Math.abs(Math.abs(side) - spread) > 12 + ty.beam * 0.2) continue;
        const h = ty.wakeH * Math.pow(Math.max(1, spread / (ty.len * 0.3)), -1 / 3) * Math.min(1, (q.v / 4) ** 2);
        if (!best || h > best.h) best = { h, t: 2 * Math.PI * q.v * 0.82 / 9.81, from: brg(q.x - p.x, q.y - p.y), by: s.kind }; // from the vessel's track
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

/**
 * A ship's way: the water she needs clear, in her own frame. From her stern (nothing abaft it: a boat astern is no
 * hindrance to her) to WAY_AHEAD of her lengths ahead of her bow, and her half-beam and WAY_ABEAM m either side. Long
 * ahead and narrow abeam, as a ship that can't stop or turn sees it. The numbers are modeling choices: Rule 8(f) asks
 * for "early action to allow sufficient sea room" with no distance, and no Bay SI or VTS text gives one; the only
 * figure in a racing SI found, "do not cross the bow of any ship in the channel within two of her ship lengths", is San
 * Diego's (Cortez Racing Association 2020 SIs, 1.2). docs/SHIP-PROTESTS.md.
 */
export const WAY_AHEAD = 2, WAY_ABEAM = 50;
/** Only a ship in the deep-water channel is one "that can safely navigate only within a narrow channel or fairway"
 * (Inland Rule 9(b)): the container ship and the tanker. The ferries, the tour boats and the Coast Guard boat are
 * power-driven vessels with room to maneuver (Rule 18(a)): no Rule 9 protest over them. */
export const channelBound = (v: Vessel): boolean => SERVICES[v.id]?.route === 'channel';

/** A point in a ship's frame: how far ahead of her middle (along) and to her starboard (lat), m. */
export function shipFrame(v: Vessel, x: number, y: number): { along: number; lat: number } {
  const ux = Math.sin(v.h * D2R), uy = Math.cos(v.h * D2R), rx = x - v.x, ry = y - v.y;
  return { along: rx * ux + ry * uy, lat: rx * uy - ry * ux };
}

/** The track a vessel will follow: from her stern (half her length back along her heading) through her middle and on
 * along her route as she'll sail it, out to `reach` m ahead of her middle (less where her route ends and she stops).
 * `s` is each point's distance along it from her middle (the stern's −len/2). */
interface Track { x: number[]; y: number[]; s: number[] }
const tracks = new WeakMap<Vessel, Track>();
function trackOf(v: Vessel): Track {
  const hit = tracks.get(v); if (hit) return hit;
  const ty = VESSEL[v.kind], sv = SERVICES[v.id], r = ROUTES[sv.route], ux = Math.sin(v.h * D2R), uy = Math.cos(v.h * D2R);
  const reach = ty.len / 2 + WAY_AHEAD * ty.len + v.v * WAY_LOOK_MAX;
  const T: Track = { x: [v.x - ux * ty.len / 2, v.x], y: [v.y - uy * ty.len / 2, v.y], s: [-ty.len / 2, 0] };
  // the leg she's on (she's on it exactly), and which way along it she's going (by her heading)
  let k = 1, dir = 1, best = Infinity;
  for (let i = 1; i < r.length; i++) {
    const d = segPt(v, r[i - 1], r[i]); if (d > best + 1e-6 || d > 1) continue;
    const fw = Math.abs(((brg(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y) - v.h) % 360 + 540) % 360 - 180) < 90;
    best = d; k = i; dir = fw ? 1 : -1;
  }
  // (off every route, as a vessel placed by hand is: straight on along her heading)
  if (best === Infinity) { T.x.push(v.x + ux * reach); T.y.push(v.y + uy * reach); T.s.push(reach); tracks.set(v, T); return T; }
  let j = dir > 0 ? k : k - 1, sum = 0, px = v.x, py = v.y;
  for (let n = 0; n < r.length + 1 && sum < reach; n++) {
    if (j < 0 || j >= r.length) { if (!sv.loop) break; j = dir > 0 ? 1 : r.length - 2; } // (a loop runs on round; a route's end stops her)
    const q = r[j], l = Math.hypot(q.x - px, q.y - py);
    if (sum + l >= reach) { const f = (reach - sum) / l; T.x.push(px + (q.x - px) * f); T.y.push(py + (q.y - py) * f); T.s.push(reach); sum = reach; break; }
    if (l > 1e-6) { sum += l; T.x.push(q.x); T.y.push(q.y); T.s.push(sum); px = q.x; py = q.y; }
    j += dir;
  }
  tracks.set(v, T); return T;
}
/** The longest look ahead asked of entersWay, s (the AI's, held: world.ts AI_SHIP_LOOK × 1.5). */
const WAY_LOOK_MAX = 180;

/** The nearest point of a vessel's track to (x, y): how far off it (d, m; `side` +1 to her starboard), how far along it
 * from her middle (a, m: behind her stern the first leg runs on, so a point abaft her reads less than −len/2), and the
 * track's heading there. */
export function onTrack(v: Vessel, x: number, y: number): { d: number; a: number; side: number; h: number } {
  const T = trackOf(v); let d = Infinity, a = 0, side = 1, h = v.h;
  for (let i = 1; i < T.x.length; i++) {
    const ax = T.x[i - 1], ay = T.y[i - 1], dx = T.x[i] - ax, dy = T.y[i] - ay, L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = i === 1 ? Math.min(1, t) : clamp(t, 0, 1);
    const fx = ax + dx * t, fy = ay + dy * t, dd = Math.hypot(x - fx, y - fy);
    if (dd < d) { d = dd; a = T.s[i - 1] + (T.s[i] - T.s[i - 1]) * t; side = (x - fx) * dy - (y - fy) * dx >= 0 ? 1 : -1; h = brg(dx, dy); }
  }
  return { d, a, side, h };
}

/**
 * When a boat at (x, y) moving at (vx, vy) over the ground first comes into the ship's way in the next `T` s, she holding
 * her course and speed and the ship following her route (0 if she's in it now), or null if she doesn't. The way slides
 * along the track with the ship: at time τ it runs from her stern to WAY_AHEAD lengths ahead of her bow, along the
 * route, so it bends where she will. Sampled every 2 s (4 s beyond a minute). `extra` widens it all round, m.
 */
export function entersWay(v: Vessel, x: number, y: number, vx: number, vy: number, T: number, extra = 0): number | null {
  const ty = VESSEL[v.kind], w = ty.beam / 2 + WAY_ABEAM + extra, step = T > 60 ? 4 : 2;
  for (let tau = 0; tau <= T + 1e-9; tau += step) {
    const o = onTrack(v, x + vx * tau, y + vy * tau), m = v.v * tau;
    if (o.d <= w && o.a >= m - ty.len / 2 - extra && o.a <= m + ty.len / 2 + WAY_AHEAD * ty.len + extra) return tau;
  }
  return null;
}

/** The distance from a point to the ship's hull, m (0 or less: touching). */
export function hullDist(v: Vessel, x: number, y: number): number {
  const ty = VESSEL[v.kind], p = shipFrame(v, x, y), a = Math.max(0, Math.abs(p.along) - ty.len / 2);
  return Math.hypot(a, p.lat) - ty.beam / 2; // (as a capsule: her ends rounded)
}

/** How far a vessel's whistle is heard, m: Annex III 1(c), by her length (200 m or more 2 nm; 75–200 m 1.5 nm;
 * 20–75 m 1 nm; under 20 m 0.5 nm). */
export const whistleRange = (v: Vessel): number => { const L = VESSEL[v.kind].len; return 1852 * (L >= 200 ? 2 : L >= 75 ? 1.5 : L >= 20 ? 1 : 0.5); };
