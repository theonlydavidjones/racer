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
 *
 * The ships in the deep-water route keep their course and speed: they can navigate only in the lanes, and a sailing
 * boat must not impede them (Rule 9; NOAA Coast Pilot 7 ch. 7 designates the SF Bay RNA's lanes and precautionary areas,
 * 33 CFR 165.1181, as narrow channels for enforcing the Inland Rules; the Cityfront isn't among them). The smaller
 * vessels don't need the lanes, and under the Inland Rules a power-driven vessel keeps out of the way of a sailing vessel
 * (33 CFR 83.18(a)(iv)): they give way, on their route, by slackening their speed or taking all way off (Rule 8(e)),
 * until the boat is past and clear (8(d)): Traffic.yieldStep. (The owner's race, 18 Nov 2026: run down by the Bay
 * cruise boat on Course 2, her route straight down the course, her place a function of the clock alone. Standing off
 * to one side as well, 8(b), is for later: two physics reviews found it turned toward boats that tacked near her,
 * grounded her by the piers and ran through the fleet at its limits, 19 Nov 2026.)
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

/** The vessels that give way to a sailing boat (Rule 18): not the ships in the lanes (Rule 9). */
export const GIVES_WAY: Record<VesselKind, boolean> = { container: false, tanker: false, ferry: true, alcatraz: true, tour: true, coastguard: true };
/**
 * How a vessel gives way. Estimates, the model's reading of Rule 8 for a 15–50 m passenger vessel, not measured:
 * - every half second she looks 3 minutes ahead along her route, round its bends, at the speed she'd make if she now
 *   eased to or picked up to each of six speeds, at 0.25 m/s² (a passenger vessel's engines astern; ahead again, the
 *   same: an estimate, no stopping trial for a 40–50 m passenger vessel was found), against every boat within 1.5 km
 *   that's under way and out of harbor (8(a): "in ample time"), and the vessel ahead of her on her own route;
 * - she means each to pass at least her half-length and 75 m more off (8(d): "at a safe distance"); a boat she's
 *   already passing or leaving behind (the closest she'd come to it is now) doesn't hold her up;
 * - she runs at the fastest of those speeds that keeps every one clear (8(e): "slacken her speed or take all way
 *   off"); when none does, at the one that keeps the widest berth, not necessarily stopped;
 * - she picks up again only once the faster speed has stayed clear 10 s; she slows at once;
 * - a boat overtaking her (coming up from more than 22.5° abaft her beam, faster along her course) keeps out of her way
 *   instead (Rule 13), and stays the overtaking boat until she's past and clear, whatever the bearing does after;
 * - alongside, she's stopped, and she leaves from rest, looking first; the time she lost she makes up at her stops,
 *   up to half her dwell there (her timetable runs on as she waits), and runs that much later on her next leg.
 */
const GIVE_LOOK = 180, GIVE_RANGE = 1500, GIVE_PASS = 75, GIVE_ACCEL = 0.25, GIVE_HOLD = 10, GIVE_EVERY = 0.5, GIVE_DT = 3;
const GIVE_SPEEDS = [1, 0.8, 0.6, 0.4, 0.2, 0];
/** A vessel's way off her timetable as she gives way: running behind it (s), her speed as a share of her service
 * speed and the share she's making for, how long a faster speed has stayed clear (s), the time since she last looked
 * (s), and the boats (by id) overtaking her (Rule 13). */
export interface GiveWay { lag: number; k: number; want: number; clearT: number; since: number; over: number[]; alongside: boolean }
/** What a vessel gives way to: a boat's place and her velocity over the ground (m/s), and her id if she has one. */
export interface Moving { x: number; y: number; vx: number; vy: number; id?: number }
/** Where she actually was every PAST_EVERY s (her wake: Traffic.wakeAt), by the clock's 4-second bucket, and when. */
interface Past { b: number; t: number; x: number; y: number; h: number; v: number; moving: boolean }
const PAST_EVERY = 4, PAST_KEEP = 64, BUCKETS = 86400 / PAST_EVERY;
/** How far she goes in τ s from speed v0 making for v1 at a m/s². */
const travelled = (v0: number, v1: number, a: number, tau: number): number => {
  const ta = Math.abs(v1 - v0) / a, sg = Math.sign(v1 - v0);
  return tau < ta ? v0 * tau + sg * a * tau * tau / 2 : v0 * ta + sg * a * ta * ta / 2 + v1 * (tau - ta);
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

function lengths(r: Vec[]): number[] { const out = [0]; for (let i = 1; i < r.length; i++) out.push(out[i - 1] + hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)); return out; }
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
  /** Each service's way off its timetable (GiveWay); all zero for the ships in the lanes. */
  readonly give: GiveWay[] = SERVICES.map(() => ({ lag: 0, k: 1, want: 1, clearT: 0, since: GIVE_EVERY, over: [], alongside: false }));
  private past: Past[][] = SERVICES.map(() => []);
  constructor(readonly on: boolean, private seed: number) {}
  /**
   * All the vessels at time t (the race clock plus the time of day, so the schedule runs continuously), where giving way
   * has put them. Given the boats and the step, the vessels first give way to them (yieldStep): the race's step, once.
   * `skip`: boats nobody gives way to (in her slip, on her lines, in harbor).
   */
  vessels(t: number, boats?: readonly Moving[], dt = 0, skip?: (b: Moving) => boolean): Vessel[] {
    if (!this.on) return [];
    if (boats && dt > 0) this.yieldStep(t, dt, boats, skip);
    return SERVICES.map((s, i) => this.place(s, i, t));
  }
  /** Service i at time t: her timetable's place `lag` s ago, at her speed now. */
  private place(s: Service, i: number, t: number): Vessel {
    const g = this.give[i], v = at(s, i, t - g.lag, this.seed);
    if (g.k !== 1 && v.moving) v.v *= g.k;
    return v;
  }
  /**
   * The give-way vessels keep out of the way of the boats (Rule 18), on their routes, as GIVE_* has it. Deterministic: it
   * depends only on the race's own state, step by step.
   */
  yieldStep(t: number, dt: number, boats: readonly Moving[], skip?: (b: Moving) => boolean): void {
    for (let i = 0; i < SERVICES.length; i++) {
      const s = SERVICES[i]; if (!GIVES_WAY[s.kind]) continue;
      const g = this.give[i], vs = VESSEL[s.kind].kt * 0.5144;
      g.alongside = !at(s, i, t - g.lag, this.seed).moving;
      if (g.alongside) { g.k = 0; g.want = 0; g.clearT = 0; g.since = GIVE_EVERY; g.over.length = 0; g.lag = Math.max(0, g.lag - dt); this.remember(s, i, t); continue; } // (alongside)
      g.since += dt;
      if (g.since >= GIVE_EVERY) {
        g.since = 0;
        const w = this.decide(s, i, t, boats, skip);
        // (slowing at once; picking up again only once the faster speed has stayed clear a while)
        if (w > g.want) { g.clearT += GIVE_EVERY; if (g.clearT >= GIVE_HOLD) { g.want = w; g.clearT = 0; } } else { g.want = w; g.clearT = 0; }
      }
      const dk = GIVE_ACCEL / vs * dt; g.k += Math.max(-dk, Math.min(dk, g.want - g.k));
      if (Math.abs(g.k - g.want) < 1e-4) g.k = g.want;
      g.lag += (1 - g.k) * dt;
      this.remember(s, i, t);
    }
  }
  /** The fastest of GIVE_SPEEDS at which every boat in her way passes clear, looking along her route; or, when none
   * does, the one that keeps the widest berth (the faster of two within a meter). */
  private decide(s: Service, i: number, t: number, boats: readonly Moving[], skip?: (b: Moving) => boolean): number {
    const g = this.give[i], ty = VESSEL[s.kind], vs = ty.kt * 0.5144, pass = ty.len / 2 + GIVE_PASS, me = this.place(s, i, t);
    const ux = Math.sin(me.h * D2R), uy = Math.cos(me.h * D2R);
    const others: Moving[] = [];
    for (const b of boats) {
      const rx = b.x - me.x, ry = b.y - me.y, r = hypot(rx, ry);
      const latched = b.id != null && g.over.includes(b.id);
      if (r > GIVE_RANGE || skip?.(b)) { if (latched) g.over.splice(g.over.indexOf(b.id!), 1); continue; }
      // (overtaking her, Rule 13: she keeps clear, until she's past and clear)
      if (latched) { if (rx * ux + ry * uy > 0 && r > 2 * pass) g.over.splice(g.over.indexOf(b.id!), 1); else continue; }
      else if ((rx * ux + ry * uy) / (r || 1) < -0.383 && b.vx * ux + b.vy * uy > me.v) { if (b.id != null) g.over.push(b.id); continue; }
      others.push(b);
    }
    // (the vessel on her own route ahead of her: two Bay cruise boats on one loop)
    for (let j = 0; j < SERVICES.length; j++) if (j !== i && SERVICES[j].route === s.route) {
      const o = this.place(SERVICES[j], j, t); if (hypot(o.x - me.x, o.y - me.y) > GIVE_RANGE) continue;
      others.push({ x: o.x, y: o.y, vx: Math.sin(o.h * D2R) * o.v, vy: Math.cos(o.h * D2R) * o.v });
    }
    if (!others.length) return 1;
    let bestK = 0, bestMiss = -Infinity;
    const n = others.length, minD = new Float64Array(n), at0 = new Float64Array(n);
    for (const kc of GIVE_SPEEDS) {
      minD.fill(Infinity);
      for (let tau = 0; tau <= GIVE_LOOK; tau += GIVE_DT) {
        const p = at(s, i, t - g.lag + travelled(g.k * vs, kc * vs, GIVE_ACCEL, tau) / vs, this.seed);
        for (let q = 0; q < n; q++) { const o = others[q], d = hypot(o.x + o.vx * tau - p.x, o.y + o.vy * tau - p.y); if (tau === 0) at0[q] = d; if (d < minD[q]) minD[q] = d; }
      }
      // (one she's passing or leaving behind, the closest she'll come to it now, doesn't count against her)
      let miss = Infinity; for (let q = 0; q < n; q++) if (minD[q] < at0[q] - 1e-6) miss = Math.min(miss, minD[q]);
      if (miss >= pass) return kc;
      if (miss > bestMiss + 1) { bestMiss = miss; bestK = kc; }
    }
    return bestK;
  }
  /** Her place every PAST_EVERY s, as she actually was (her wake reads it). */
  private remember(s: Service, i: number, t: number): void {
    const P = this.past[i], b = Math.floor(t / PAST_EVERY) % BUCKETS;
    if (P.length && P[P.length - 1].b === b) return;
    const v = this.place(s, i, t); P.push({ b, t, x: v.x, y: v.y, h: v.h, v: v.v, moving: v.moving }); if (P.length > PAST_KEEP) P.shift();
  }
  /** Where service i was at about time t: as recorded (the 4-second bucket that holds t, with when it was taken), else
   * by her timetable and her way off it now. The clock wraps at midnight UTC: buckets counted round it. */
  private placeAt(s: Service, i: number, t: number): Vessel & { t: number } {
    const P = this.past[i];
    if (P.length) {
      const last = P[P.length - 1], back = ((last.b - Math.floor(t / PAST_EVERY) % BUCKETS) % BUCKETS + BUCKETS) % BUCKETS, k = P.length - 1 - back;
      if (k >= 0 && P[k].b === (last.b - back + BUCKETS) % BUCKETS) { const q = P[k]; return { id: i, kind: s.kind, x: q.x, y: q.y, h: q.h, v: q.v, moving: q.moving, t: q.t }; }
    }
    return { ...this.place(s, i, t), t };
  }
  /** The give-way state worth recording (the race track's frames): [service, behind her timetable s, her speed as a
   * share of her service speed] for each vessel under way and slowed (for a boat, or picking up from her berth); undefined
   * when none is. */
  givingWay(): [number, number, number][] | undefined {
    let out: [number, number, number][] | undefined;
    this.give.forEach((g, i) => { if (g.k !== 1 && !g.alongside) (out ??= []).push([i, Math.round(g.lag * 10) / 10, Math.round(g.k * 100) / 100]); });
    return out;
  }

  /**
   * The wake reaching point p at time t: the strongest Kelvin arm passing under it now. Height (m), period (s) and the
   * direction the waves come from (deg), or null. Looks back along each vessel's track (positions from the clock).
   */
  wakeAt(p: Vec, t: number): { h: number; t: number; from: number; by: VesselKind } | null {
    if (!this.on) return null;
    let best: { h: number; t: number; from: number; by: VesselKind } | null = null;
    const tan = Math.tan(19.47 * D2R);
    SERVICES.forEach((s, i) => {
      const now = this.place(s, i, t), ty = VESSEL[s.kind];
      if (hypot(now.x - p.x, now.y - p.y) > 2500) return;
      for (let age = 4; age < 240; age += 4) {
        const q = this.placeAt(s, i, t - age), aged = ((t - q.t) % 86400 + 86400) % 86400; // (her track behind her as she sailed it, every 4 s, by its real age)
        if (!q.moving) continue;
        const u = { x: Math.sin(q.h * D2R), y: Math.cos(q.h * D2R) }, n = { x: u.y, y: -u.x };
        const spread = q.v * aged * tan, rx = p.x - q.x, ry = p.y - q.y, along = rx * u.x + ry * u.y, side = rx * n.x + ry * n.y;
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
