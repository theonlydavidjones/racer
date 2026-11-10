import { D2R, clamp } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';
import type { Shape } from './controls';
import type { SailTrim } from './trim';

/**
 * Heel and helm balance, from the forces on the sails and the hull.
 *
 * Heel: each sail's aerodynamic force is q·A·C, with q from the apparent wind. Its coefficient rises with angle of
 * attack up to about the best trim and a little beyond (an over-trimmed, stalling sail still pushes hard sideways),
 * collapses as the sail luffs, grows with depth (a full sail makes more force), and falls with twist (an open
 * leech spills wind up high). The part across the boat, times the height of the rig's centre of effort above the
 * keel's centre of lateral resistance, is the heeling moment. Against it: the hull's righting moment (displacement
 * × righting arm, which grows with heel) and the crew hiking on the windward side. The boat heels until they match,
 * quickly (a second or so), so a gust heels her at once and the depowering controls (backstay, outhaul and
 * Cunningham to flatten; traveller down and vang-sheeting to ease the boom; twist to spill) bring her back up.
 *
 * Helm balance: the main's force acts aft of the keel and turns the bow toward the wind; the jib's force acts
 * forward and turns it away. Heel moves the drive out to leeward, which turns her toward the wind too (the more
 * she heels, the more weather helm), and a main eased out on a reach or run pushes from well outboard (the reason
 * boats round up in gusts downwind). The rudder angle that cancels the yaw is the helm the boat needs: a couple of
 * degrees of weather helm is ideal (the rudder adds a little lift to windward and you feel the boat); more is a
 * brake, and lee helm is worse. Let go of the tiller and she turns by herself.
 *
 * Figures (righting arm, centre of effort height, the fore–aft positions) are estimates for a Folkboat, not
 * measurements.
 */

const RHO_AIR = 1.225, RHO_W = 1025, G = 9.81;
const AREA = { main: orc.boat.mainArea, jib: orc.boat.jibArea };
/** Displacement sailing, with crew (kg); metacentric height (m) for the righting arm. */
const DISP = orc.boat.displacementSailing, GM = 0.92;
/** Three crew hiking: their weight (kg) and how far to windward of the centreline they can sit (m). */
const CREW = { kg: 240, reach: 1.05 };
/** Centre of effort height above the centre of lateral resistance (m), at moderate twist. */
const CE_HEIGHT = 4.3;
/** Fore–aft lever (m, + forward of the centre of lateral resistance) of each sail's side force. */
const LEVER = { main: -0.62, jib: 1.55 };
/** Rudder: area (m²), lift slope (per radian), arm from the centre of lateral resistance (m). */
const RUDDER = { area: 0.42, slope: 3.0, arm: 2.6, aspect: 1.4 };
/** Full helm (deg of rudder) for the sim's fastest turn. */
export const FULL_RUDDER = 30;
/** Ideal weather helm, deg: the rudder's small lift to windward pays for its drag. */
export const IDEAL_HELM = 2.5;

export interface SailForce { heel: number; drive: number }

/** Force coefficient (lift-ish) for a sail from its trim and shape. */
function coef(t: SailTrim, s: Shape): number {
  const cmax = 0.85 + 5.5 * s.depth; // fuller sail, more force: 0.10 → 1.4, 0.14 → 1.62
  const twist = clamp(1 - 0.013 * (s.twist - 8), 0.7, 1.08);
  // angle of attack: rises to the best trim, holds on a little past it (stalling sails still push sideways)
  const aoa = t.flow === 'luffing' ? 1 - t.amount * 0.92 : t.flow === 'stalled' ? 1 - 0.18 * t.amount : 1;
  return cmax * twist * aoa;
}

/** Heeling force (N, across the boat) and drive (N) from both sails, for apparent wind `aws` (m/s) at `awa` (deg). */
export function sailForces(aws: number, awa: number, main: { trim: SailTrim; shape: Shape; out: number }, jib: { trim: SailTrim; shape: Shape } | null, luffing: boolean): { main: SailForce; jib: SailForce; twist: number } {
  const q = 0.5 * RHO_AIR * aws * aws, a = Math.abs(awa) * D2R;
  const one = (area: number, t: SailTrim, s: Shape): SailForce => {
    if (luffing) return { heel: q * area * 0.06 * Math.cos(a), drive: 0 };
    const cl = coef(t, s), cd = 0.07 + 0.11 * cl * cl;
    const L = q * area * cl, D = q * area * cd;
    return { heel: Math.max(0, L * Math.cos(a) + D * Math.sin(a)), drive: L * Math.sin(a) - D * Math.cos(a) };
  };
  return { main: one(AREA.main, main.trim, main.shape), jib: jib ? one(AREA.jib, jib.trim, jib.shape) : { heel: 0, drive: 0 }, twist: main.shape.twist };
}

/** Righting moment (N·m) at a heel angle (deg), with the crew hiking as hard as needed (`hike` 0..1). */
export function rightingMoment(heelDeg: number, hike = 1): number {
  const t = Math.abs(heelDeg) * D2R;
  const gz = GM * Math.sin(t) * (1 - 0.3 * Math.sin(t) ** 2); // the arm grows, then levels off
  return DISP * G * gz + CREW.kg * G * CREW.reach * hike * Math.cos(t);
}

/** Heel (deg, ≥ 0) where the heeling moment balances the righting moment. The crew hike once she's heeling. */
export function equilibriumHeel(heelForce: number, twist: number): number {
  const ce = CE_HEIGHT - 0.03 * (twist - 8); // more twist, lower centre of effort
  let lo = 0, hi = 75;
  for (let i = 0; i < 30; i++) {
    const h = (lo + hi) / 2, hike = clamp((h - 4) / 8, 0, 1);
    if (heelForce * ce * Math.cos(h * D2R) > rightingMoment(h, hike)) lo = h; else hi = h;
  }
  return (lo + hi) / 2;
}

/**
 * Helm balance: the rudder angle (deg) she needs to sail straight. Positive is weather helm (she wants to turn
 * toward the wind; you hold the tiller to windward), negative lee helm. `boomOut` is the boom's angle off the
 * centreline (deg); `v` boat speed (m/s).
 */
export function helmNeeded(f: { main: SailForce; jib: SailForce }, heelDeg: number, boomOut: number, v: number, twist: number): number {
  const h = Math.abs(heelDeg) * D2R, ce = CE_HEIGHT - 0.03 * (twist - 8);
  // side forces about the keel: the main aft (+ toward the wind), the jib forward (− away)
  let m = -(f.main.heel * LEVER.main + f.jib.heel * LEVER.jib);
  // drive pushed out to leeward by heel, and by the boom eased out: both turn her toward the wind
  m += (f.main.drive + f.jib.drive) * ce * 0.55 * Math.sin(h);
  m += Math.max(0, f.main.drive) * 1.6 * Math.sin(Math.abs(boomOut) * D2R) * 0.5;
  // (below ~3.5 kt the hull's grip falls away as fast as the rudder's, so the balance doesn't run away at low speed)
  const qw = 0.5 * RHO_W * Math.max(1.8, v) ** 2;
  return clamp(m / (qw * RUDDER.area * RUDDER.slope * RUDDER.arm) / D2R, -25, 25);
}

/** Drag (N) from the rudder held at `weather` deg of weather helm (negative: lee helm), at speed v. A little weather helm is free. */
export function rudderDrag(weather: number, v: number): number {
  const excess = weather >= 0 ? Math.max(0, weather - IDEAL_HELM) : -weather + IDEAL_HELM * 0.5;
  const cl = RUDDER.slope * excess * D2R;
  return 0.5 * RHO_W * v * v * RUDDER.area * (cl * cl / (Math.PI * RUDDER.aspect) + 0.02 * excess * D2R);
}

/** Speed lost to heeling past the boat's best angle (about 20° for a Folkboat): leeway, wetted shape, sail area tipped away. */
export const heelFactor = (heelDeg: number) => 1 - 0.55 * Math.max(0, (Math.abs(heelDeg) - 20) / 30) ** 2;
