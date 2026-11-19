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
 * - she looks 3 minutes ahead on her route (8(a): "in ample time"), at any boat within 1.5 km that's under way and out
 *   of harbor; a boat overtaking her (coming up from more than 22.5° abaft her beam, faster along her route) keeps out
 *   of her way instead (Rule 13), and she doesn't slow for that one;
 * - she means to pass at least her half-length and 75 m more from each boat's middle (8(d): "at a safe distance");
 * - she runs at the fastest of her service speed, 60%, 30% or stopped at which every boat would pass that far off
 *   (8(e): "slacken her speed or take all way off"): a boat crossing ahead of her gets across as she slows; one on her
 *   route ahead, she stops for;
 * - she slows or picks up at 0.25 m/s² (a passenger vessel's engines astern; ahead again, the same), and picks up again
 *   only once the faster speed has been clear for 10 s;
 * - the time she lost she makes up at her next stop.
 */
const GIVE_LOOK = 180, GIVE_RANGE = 1500, GIVE_PASS = 75, GIVE_ACCEL = 0.25, GIVE_HOLD = 10;
const GIVE_SPEEDS = [1, 0.6, 0.3, 0];
/** A vessel's way off her timetable as she gives way: running behind it (s), her speed as a share of her service
 * speed, and how long the speed she'd pick up to has been clear (s). */
export interface GiveWay { lag: number; k: number; clearT: number }
/** What a vessel gives way to: a boat's place and her velocity over the ground (m/s). */
export interface Moving { x: number; y: number; vx: number; vy: number }
/** Where she actually was every PAST_EVERY s (her wake: Traffic.wakeAt), by the clock's 4-second bucket. */
interface Past { b: number; x: number; y: number; h: number; v: number; moving: boolean }
const PAST_EVERY = 4, PAST_KEEP = 64, BUCKETS = 86400 / PAST_EVERY;

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
  readonly give: GiveWay[] = SERVICES.map(() => ({ lag: 0, k: 1, clearT: 0 }));
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
      const g = this.give[i], ty = VESSEL[s.kind], vs = ty.kt * 0.5144, sched = at(s, i, t - g.lag, this.seed);
      if (!sched.moving) { g.k = 1; g.clearT = 0; g.lag = Math.max(0, g.lag - dt); this.remember(s, i, t); continue; } // (alongside: she makes up lost time by leaving on schedule)
      const h = sched.h * D2R, ux = Math.sin(h), uy = Math.cos(h), pass = ty.len / 2 + GIVE_PASS;
      // the fastest of GIVE_SPEEDS at which every boat in sight passes clear
      let allowed = 0;
      for (const k of GIVE_SPEEDS) {
        const vx = ux * vs * k, vy = uy * vs * k;
        let ok = true;
        for (const b of boats) {
          const rx = b.x - sched.x, ry = b.y - sched.y; if (rx * rx + ry * ry > GIVE_RANGE * GIVE_RANGE || skip?.(b)) continue;
          // (overtaking her, Rule 13: from more than 22.5° abaft her beam, faster along her route than she's going; it keeps clear)
          if ((rx * ux + ry * uy) / (Math.hypot(rx, ry) || 1) < -0.383 && b.vx * ux + b.vy * uy > vs * g.k) continue;
          const wx = b.vx - vx, wy = b.vy - vy, ww = wx * wx + wy * wy;
          const tc = ww > 1e-6 ? Math.max(0, Math.min(GIVE_LOOK, -(rx * wx + ry * wy) / ww)) : 0;
          if (Math.hypot(rx + wx * tc, ry + wy * tc) < pass) { ok = false; break; }
        }
        if (ok) { allowed = k; break; }
      }
      // (slowing at once; picking up again only once the faster speed has stayed clear a while)
      let want = allowed;
      if (allowed > g.k) { g.clearT += dt; if (g.clearT < GIVE_HOLD) want = g.k; } else g.clearT = 0;
      const dk = GIVE_ACCEL / vs * dt; g.k += Math.max(-dk, Math.min(dk, want - g.k));
      if (g.k > 0.9999 && want === 1) g.k = 1; else if (g.k < 1e-4 && want === 0) g.k = 0;
      g.lag += (1 - g.k) * dt;
      this.remember(s, i, t);
    }
  }
  /** Her place every PAST_EVERY s, as she actually was (her wake reads it). */
  private remember(s: Service, i: number, t: number): void {
    const P = this.past[i], b = Math.floor(t / PAST_EVERY) % BUCKETS;
    if (P.length && P[P.length - 1].b === b) return;
    const v = this.place(s, i, t); P.push({ b, x: v.x, y: v.y, h: v.h, v: v.v, moving: v.moving }); if (P.length > PAST_KEEP) P.shift();
  }
  /** Where service i was at time t: as recorded (the 4-second bucket that holds t), else by her timetable and her way
   * off it now. The clock wraps at midnight UTC: buckets counted round it. */
  private placeAt(s: Service, i: number, t: number): Vessel {
    const P = this.past[i];
    if (P.length) {
      const last = P[P.length - 1], back = ((last.b - Math.floor(t / PAST_EVERY) % BUCKETS) % BUCKETS + BUCKETS) % BUCKETS, k = P.length - 1 - back;
      if (k >= 0 && P[k].b === (last.b - back + BUCKETS) % BUCKETS) { const q = P[k]; return { id: i, kind: s.kind, x: q.x, y: q.y, h: q.h, v: q.v, moving: q.moving }; }
    }
    return this.place(s, i, t);
  }
  /** The give-way state worth recording (the race track's frames): [service, behind her timetable s, her speed as a
   * share of her service speed] for each vessel slowed for a boat now; undefined when none is. */
  givingWay(): [number, number, number][] | undefined {
    let out: [number, number, number][] | undefined;
    this.give.forEach((g, i) => { if (g.k !== 1) (out ??= []).push([i, Math.round(g.lag * 10) / 10, Math.round(g.k * 100) / 100]); });
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
        const q = this.placeAt(s, i, t - age); // (her track behind her as she sailed it, every 4 s)
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
