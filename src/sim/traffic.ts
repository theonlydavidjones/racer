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
  alcatraz: { name: 'Alcatraz ferry', len: 40, beam: 11, kt: 10, wakeH: 0.35 },
  tour: { name: 'Bay cruise boat', len: 45, beam: 12, kt: 11, wakeH: 0.4 },
  coastguard: { name: 'Coast Guard boat', len: 14, beam: 4.3, kt: 20, wakeH: 0.3 }
};

const route = (pts: [number, number][]) => pts.map(([la, lo]) => LL(la, lo));
// Tracks (lat, lon). The big ships keep to NOAA's traffic scheme (ENC cells US5OAKFF, FG, FH; ENC check #4): inbound by
// the lanes from sea (TSSLPT 0E22 and 6FB2, 69° and 55°), the south half of the Gate's precautionary area, the
// eastbound lane south of Alcatraz's separation zone (C832, 90°), across the precautionary area east of it, then south of
// Yerba Buena Island under the Bay Bridge's west span into the Oakland Inner Harbor channel (dredged, 14.6 m); outbound
// the same way back on the other side: the westbound lane north of the separation zone (6F4A, 258°), the north half of
// the Gate, the outbound lanes (A3CF, 4E4C: 240° and 245°). Each keeps to starboard, in water of 9 m (30 ft) or more or the
// dredged channel, never across a separation zone or line or land (tests/traffic.test.ts). One way each: a ship
// arriving is berthed, and one leaving is at sea (a loop's dwell at its start: the next ship).
export const ROUTES: Record<string, Vec[]> = {
  channel: route([[37.7895, -122.5480], [37.7914, -122.5400], [37.7945, -122.5250], [37.7980, -122.5150], [37.8045, -122.5050], [37.8098, -122.4950],
    [37.8155, -122.4790], [37.8178, -122.4600], [37.8186, -122.4450], [37.8188, -122.4300], [37.8150, -122.4050], [37.8045, -122.3800], [37.8025, -122.3660],
    [37.8020, -122.3560], [37.8030, -122.3500]]),
  channelOut: route([[37.8030, -122.3500], [37.8040, -122.3620], [37.8060, -122.3700], [37.8085, -122.3790], [37.8200, -122.4000], [37.8320, -122.4250],
    [37.8300, -122.4450], [37.8255, -122.4600], [37.8215, -122.4790], [37.8137, -122.5000], [37.8070, -122.5200], [37.8005, -122.5400], [37.7960, -122.5800]]),
  // (out clear of the pier heads: Piers 35 to 27 reach out to 37.810; geo/shore.ts)
  sausalito: route([[37.7960, -122.3910], [37.8050, -122.3930], [37.8110, -122.4040], [37.8190, -122.4330], [37.8400, -122.4640], [37.8560, -122.4770]]),
  alcatraz: route([[37.8085, -122.4030], // (off the head of Pier 33, the Alcatraz landing)
     [37.8180, -122.4130], [37.8252, -122.4202]]), // (alongside the island's dock: the old end was 110 m ashore; ENC check #5)
  // (from the berth on the west side of Pier 41, where OpenStreetMap's ferry routes end, out round Pier 45 and the Wharf's breakwater;
  // turning under the bridge mid-Gate, not at Lime Point, where the old turn was ashore: ENC check #5)
  tour: route([[37.8102, -122.4135], [37.8128, -122.4140], [37.8128, -122.4300], [37.8145, -122.4560], [37.8195, -122.4760], [37.8230, -122.4850], [37.8240, -122.4745], [37.8300, -122.4500], [37.8300, -122.4250], [37.8285, -122.4160], [37.8200, -122.4120], [37.8102, -122.4135]]), // (round Alcatraz's east end, not over it)
  // (from the station on Horseshoe Bay's east side, out by its mouth, not across the breakwater and the pier: ENC check #5)
  coastguard: route([[37.8325, -122.4724], [37.8305, -122.4724], [37.8200, -122.4600], [37.8150, -122.4400], [37.8260, -122.4350], [37.8305, -122.4724], [37.8325, -122.4724]])
};

export interface Service { kind: VesselKind; route: string; loop: boolean; phase: number; dwell: number }
export const SERVICES: Service[] = [
  { kind: 'container', route: 'channel', loop: true, phase: 0.15, dwell: 1500 }, // (inbound, one way: see ROUTES)
  { kind: 'tanker', route: 'channelOut', loop: true, phase: 0.62, dwell: 2100 }, // (outbound)
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
      if (hypot(now.x - p.x, now.y - p.y) > 2500) return;
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
