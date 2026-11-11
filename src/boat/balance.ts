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
/** Displacement sailing, with crew (kg). */
const DISP = orc.boat.displacementSailing;
/**
 * Stability, from the ORC Club certificates the polar averages (2026: NED 737 IJsvogel, NED 923 Tuuli, EST F39 Castor;
 * EST F51 FRIDA's wasn't to hand): ORC computes it from the measured hull offsets and the measured centre of gravity.
 * Rated righting moment at 1° in lightship trim 25.7, 19.6 and 19.2 kg·m at 1998, 1967 and 1930 kg, with the centre
 * of gravity (VCGM) 0.339, 0.186 and 0.192 m below the measurement waterline: GM 0.74, 0.57, 0.57 m (IJsvogel's
 * lower centre of gravity is her extra stiffness), so the metacentre is KM = GM + VCG ≈ 0.39 m above the waterline.
 * Sailing trim adds the crew, at ORC's crew height 0.05·LSM + 0.36 ≈ 0.66 m above the waterline (ORC VPP Documentation
 * 2025, §4.2.2 eq. 4.3), and the gear, taken at the waterline: with three crew, GM ≈ 0.52 m. (The crew's own moment
 * across the boat is added separately, crewPhys.ts; here they count as weight on the centreline at their height.) The
 * metacentre is taken as unchanged over the few centimetres she sinks with crew aboard: that needs the waterplane,
 * which only ORC's offset file has.
 */
export const STAB = {
  rm1: (25.7 + 19.6 + 19.2) / 3, light: (1998 + 1967 + 1930) / 3, vcg: -(0.339 + 0.186 + 0.192) / 3,
  crewZ: 0.05 * orc.boat.imsL + 0.36
};
const KM = STAB.rm1 / (STAB.light * Math.sin(D2R)) + STAB.vcg;
/** Metacentric height (m) in sailing trim at displacement `disp` (kg) with `crewKg` of people aboard. */
export function gmSailing(disp = DISP, crewKg = 240): number {
  return KM - (STAB.light * STAB.vcg + crewKg * STAB.crewZ) / disp; // (the gear, the rest of the weight, at the waterline)
}
/** Three crew hiking: their weight (kg) and how far to windward of the centreline they can sit (m). */
const CREW = { kg: 240, reach: 1.05 };
/**
 * Centre of effort height above the centre of lateral resistance (m), at moderate twist. From the ORC sail
 * measurements (P 8.75, E 3.38, girths MQW 2.89, MHW 2.22, MTW 1.32, MUW 0.72, MHB 0.11: the main's centroid 3.23 m above
 * the boom, which is BAS 1.00 m above the sheer; their area integrates to the certificate's 17.89 m²) and the jib's
 * (luff 5.95 m on IG 6.50, J 2.00: centroid about 2.2 m above the sheer), weighted by area (17.89, 7.30 m²): 3.64 m
 * above the sheer, which is about 0.65 m above the waterline at the mast (the Danish class's correction-weight sheet:
 * the waterline 620–665 mm below the deck line), so 4.29 m above the waterline; and ORC puts the hull's hydrodynamic
 * centre of pressure 0.43 × draft below it (VPP Documentation 2025, eq. 4.29: 0.49 m). (Rig dimensions: ORC
 * certificate EST F51 FRIDA and EST F39 Castor, 2026.)
 */
export const CE_HEIGHT = 4.78;
/** The centre of effort's height above the waterline (m), near the roll axis: the lever for the rig's sweep as she rolls. */
export const CE_ABOVE_WL = 4.29;
/** Fore–aft lever (m, + forward of the centre of lateral resistance) of each sail's side force. */
export const LEVER = { main: -0.62, jib: 1.55 };
/** Chord of each sail at its centre of effort (m). */
const CHORD = { main: 2.4, jib: 2.0 };
/** Rudder: area (m²), lift slope (per radian), arm from the centre of lateral resistance (m). */
export const RUDDER = { area: 0.42, slope: 3.0, arm: 2.6, aspect: 1.4 };
/** Full helm (deg of rudder) for the sim's fastest turn. */
export const FULL_RUDDER = 30;
/** Ideal weather helm, deg: the rudder's small lift to windward pays for its drag. */
export const IDEAL_HELM = 2.5;

export interface SailForce { heel: number; drive: number; ceAft?: number }

/** Force coefficient (lift-ish) for a sail from its trim and shape. */
function coef(t: SailTrim, s: Shape): number {
  const cmax = (0.85 + 5.5 * s.depth) * (s.clMul ?? 1); // fuller sail, more force: 0.10 → 1.4, 0.14 → 1.62 (a porous old sail a little less)
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
    const cl = coef(t, s), cd = (s.cd0 ?? 0.07) + 0.11 * cl * cl; // profile drag (more from an old sail's hooked leech) + induced
    const L = q * area * cl, D = q * area * cd;
    return { heel: Math.max(0, L * Math.cos(a) + D * Math.sin(a)), drive: L * Math.sin(a) - D * Math.cos(a), ceAft: s.ceAft };
  };
  return { main: one(AREA.main, main.trim, main.shape), jib: jib ? one(AREA.jib, jib.trim, jib.shape) : { heel: 0, drive: 0 }, twist: main.shape.twist };
}

/** Righting moment (N·m) at a heel angle (deg), with the crew hiking as hard as needed (`hike` 0..1). */
export function rightingMoment(heelDeg: number, hike = 1, disp = DISP): number {
  return hullRighting(heelDeg, disp) + CREW.kg * G * CREW.reach * hike * Math.cos(Math.abs(heelDeg) * D2R);
}
/** The hull's own righting moment (N·m): displacement (people included, sitting on the centreline) × righting arm.
 * Signed with the heel: it always pushes her back upright. */
export function hullRighting(heelDeg: number, disp = DISP, crewKg = 240): number {
  const t = heelDeg * D2R;
  // (the righting arm beyond small angles: GM·sin φ, levelling off as the deck edge nears the water; the curve's shape
  // past a few degrees isn't on the certificates, which print only the moment at 1°)
  return disp * G * gmSailing(disp, crewKg) * Math.sin(t) * (1 - 0.3 * Math.sin(t) ** 2);
}
/** The heeling moment (N·m) at heel `heelDeg` from a side force, with the centre of effort lowered by twist. */
export const heelingMoment = (heelForce: number, twist: number, heelDeg: number) => heelForce * (CE_HEIGHT - 0.03 * (twist - 8)) * Math.cos(heelDeg * D2R);

/**
 * Heel (deg, + to leeward, − to windward) with the crew where they are: the sails' heeling moment plus the crew's
 * weight to leeward (or minus it to windward) against the hull's righting moment. `crewMoment(h)`: + to windward, N·m.
 * With little wind in the sails and the crew up to windward she heels to windward.
 */
export function heelWithCrew(heelForce: number, twist: number, disp: number, crewMoment: (h: number) => number, crewKg = 240): number {
  let lo = -40, hi = 75;
  for (let i = 0; i < 30; i++) {
    const h = (lo + hi) / 2;
    if (heelingMoment(heelForce, twist, h) - crewMoment(h) > hullRighting(h, disp, crewKg)) lo = h; else hi = h;
  }
  return (lo + hi) / 2;
}

/** Heel (deg, ≥ 0) where the heeling moment balances the righting moment. The crew hike once she's heeling. */
export function equilibriumHeel(heelForce: number, twist: number): number {
  const ce = CE_HEIGHT - 0.03 * (twist - 8); // more twist, lower centre of effort
  let lo = -40, hi = 75;
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
export function helmNeeded(f: { main: SailForce; jib: SailForce }, heelDeg: number, boomOut: number, v: number, twist: number, clrFwd = 0): number {
  // (clrFwd: the centre of lateral resistance moved forward by trimming her bow-down, hullTrim.ts: the side force then acts further aft of it)
  const m = sailYaw(f, heelDeg, boomOut, twist) + (f.main.heel + f.jib.heel) * clrFwd;
  // (below ~3.5 kt the hull's grip falls away as fast as the rudder's, so the balance doesn't run away at low speed)
  const qw = 0.5 * RHO_W * Math.max(1.8, v) ** 2;
  return clamp(m / (qw * RUDDER.area * RUDDER.slope * RUDDER.arm) / D2R, -25, 25);
}

/**
 * The sails' turning moment about the keel (N·m, + toward the wind): side forces ahead of and behind the centre of
 * lateral resistance, and the drive pushed out to leeward by heel and by an eased boom.
 */
export function sailYaw(f: { main: SailForce; jib: SailForce }, heelDeg: number, boomOut: number, twist: number): number {
  // (heel signed, + to leeward: heeled to windward, the drive pushes from to windward of the keel and turns her away)
  const h = heelDeg * D2R, ce = CE_HEIGHT - 0.03 * (twist - 8);
  // side forces about the keel: the main aft (+ toward the wind), the jib forward (− away)
  // (a stretched old sail's draft sits further aft, and its force with it, by a share of the chord at the centre of effort)
  let m = -(f.main.heel * (LEVER.main - CHORD.main * 0.5 * (f.main.ceAft ?? 0)) + f.jib.heel * (LEVER.jib - CHORD.jib * 0.5 * (f.jib.ceAft ?? 0)));
  // drive pushed out to leeward by heel, and by the boom eased out: both turn her toward the wind
  m += (f.main.drive + f.jib.drive) * ce * 0.55 * Math.sin(h);
  m += Math.max(0, f.main.drive) * 1.6 * Math.sin(Math.abs(boomOut) * D2R) * 0.5;
  return m;
}

/** Drag (N) from the rudder held at `weather` deg of weather helm (negative: lee helm), at speed v. A little weather helm is free. */
export function rudderDrag(weather: number, v: number): number {
  const excess = weather >= 0 ? Math.max(0, weather - IDEAL_HELM) : -weather + IDEAL_HELM * 0.5;
  const cl = RUDDER.slope * excess * D2R;
  return 0.5 * RHO_W * v * v * RUDDER.area * (cl * cl / (Math.PI * RUDDER.aspect) + 0.02 * excess * D2R);
}

/** Speed lost to heeling past the boat's best angle (about 20° for a Folkboat): leeway, wetted shape, sail area tipped away. */
export const heelFactor = (heelDeg: number) => 1 - 0.55 * Math.max(0, (Math.abs(heelDeg) - 20) / 30) ** 2;

/**
 * Roll. Heel follows its balance point (heelWithCrew) as a damped oscillator, I·φ'' = K·(φeq − φ) − c·φ', so a gust or
 * a crew move rolls her over in a second or so, and a crew throwing their weight out rolls her up. Stiffness K is the
 * hull's righting moment per radian at small angles (Δ·g·GM, from the ORC certificates above). The inertia is the
 * boat's mass about a roll radius of gyration of half the beam with an added-inertia coefficient of 0.3: Klaka's
 * full-scale tests of a 10 m yacht (Curtin CMST report C2000-21, 2000: GM 1.07 m inclined, roll period 3.82 s, a 1-DOF
 * model with σ = 0.3 predicting 3.64 s, which puts her gyradius at about 0.5 × beam): a natural period of about 3.5 s.
 * Damping: at rest, Klaka measured a damping ratio of 0.079 with the main hoisted (0.025 without); under way the keel,
 * moving sideways through the water as she rolls, meets the flow at an angle and its lift opposes the roll (c =
 * ½ρ·V·A·(πAR/2)·z², A and AR the hull and keel's side-on area and aspect as in physics.ts HOVE, z the depth of ORC's
 * hydrodynamic centre of pressure, 0.43 × draft); and the sails' own lift is changed by the rig sweeping through the air
 * (physics.ts rigSway), which also gives a roll tack's snap upright its small pull.
 */
export const ROLL = { gyration: 0.5 * orc.boat.beam, added: 0.3, zetaRest: 0.079, keelArea: 0.5 * orc.boat.imsL * orc.boat.draft, keelZ: 0.43 * orc.boat.draft };
export function rollStep(heel: number, rate: number, heelEq: number, disp: number, dt: number, v = 0, crewKg = 240): { heel: number; rate: number } {
  const gm = gmSailing(disp, crewKg), I = disp * ROLL.gyration ** 2 * (1 + ROLL.added), K = disp * G * gm;
  const wn = Math.sqrt(K / I), ar = 2 * orc.boat.draft ** 2 / ROLL.keelArea;
  const cKeel = 0.5 * RHO_W * Math.max(0, v) * ROLL.keelArea * (Math.PI * ar / 2) * ROLL.keelZ ** 2;
  const zeta = ROLL.zetaRest + cKeel / (2 * Math.sqrt(K * I));
  const acc = wn * wn * (heelEq - heel) - 2 * zeta * wn * rate;
  const r = rate + acc * dt;
  return { heel: heel + r * dt, rate: r };
}

/**
 * Light air: the sails' own weight. A sail holds its shape when the wind's pressure across it beats the cloth's
 * weight; in a drifter it doesn't, and the sails slat and hang in folds. Heeling her to leeward lets gravity hold
 * the cloth out to leeward (the weight's component across the sail, w·g·sin φ), which is why a crew sits to leeward in
 * light air. The class rules set the main's and jib's woven cloth at no less than 250 g/m²
 * (NFIA Class Rules 2025–2028, CR 9.12): the lightest a Folkboat's sails may be, used here (heavier cloth slats sooner). The drive lost while the pressure is less than about three times the cloth's
 * weight, up to 30% when it's nothing, is an estimate; relative to the sails held out by a 6° heel (as a good crew
 * sails her in light air), since the polar is the boat sailed well.
 */
export const CLOTH = 0.25;
const slat = (aws: number, cl: number, heelDeg: number) => {
  const wg = CLOTH * G, r = (0.5 * RHO_AIR * aws * aws * Math.max(0.3, cl) + wg * Math.sin(heelDeg * D2R)) / wg;
  const x = clamp(r / 3, 0, 1);
  return 0.3 * (1 - x * x * (3 - 2 * x));
};
/** Drive factor (≤ 1) from the sails' weight at apparent wind `aws` (m/s), heel `heelDeg` (+ to leeward). */
export function clothFill(aws: number, heelDeg: number, cl = 1.2): number {
  return Math.min(1, (1 - slat(aws, cl, heelDeg)) / (1 - slat(aws, cl, 6)));
}
