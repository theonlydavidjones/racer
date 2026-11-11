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
/**
 * The metacentre's height above the centre of buoyancy (m): KM from the certificates (above) less the centre of
 * buoyancy's height, about 0.22 m below the waterline for the canoe body and the keel's volume (an estimate: the hull's
 * offsets aren't published). And the heel at which the deck edge reaches the water (deg): the sheer about 0.65 m above
 * the water at about 1.1 m out (an estimate from the profile and the 2.20 m beam).
 */
const BM = KM + 0.22, DECK_EDGE = 30;
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

/*
 * The sails' forces: ORC's aerodynamic model (ORC VPP Documentation 2025, chapter 5), with the Folkboat's measured rig.
 * Each sail has a maximum lift coefficient and a parasitic drag coefficient that depend on the apparent wind angle,
 * fitted by ORC to wind-tunnel and full-scale data (Tables 5.1 and 5.4). A Folkboat has a backstay and no runners: the
 * main takes the medium set, halfway between ORC's low and high sets (fractionality IG/(P+BAS) = 0.67 gives fcoef = 1:
 * eqs. 5.5–5.6), the jib the low set (eq. 5.9); woven polyester sails carry ORC's low-technology cloth adjustment
 * (Table 5.3; for the jib a third of the roller-furling change, Table 5.6). How much of that lift a sail makes depends
 * on how deep the crew has set it ("flat", eq. 5.48: lift in proportion to the camber, down to ORC's flattest 0.42) and
 * on its trim (trim.ts: luffing or stalled). Drag is the parasitic drag (the jib's falls with flat, eq. 5.47, and the
 * fcdmult curve), plus the quadratic parasitic drag and the induced drag of the rig's effective height (eqs. 5.41–5.46).
 * The centre of effort is each sail's weighted by its force (eq. 5.39), lowered as the sails are flattened and twisted
 * off (the twist function, eq. 5.40); the heeling arm runs from it down to ORC's hydrodynamic centre of pressure, 0.43
 * × draft below the waterline (eq. 4.29).
 */
const tab = (xs: readonly number[], ys: readonly number[], x: number) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * f; }
  return ys[ys.length - 1];
};
/** ORC Table 5.1, mainsail: apparent wind angle (deg), and the low and high drag and lift sets; Table 5.3 the cloth adjustment. */
const MAIN_C = {
  b: [0, 7, 9, 12, 28, 60, 90, 120, 150, 180],
  cdLo: [0.04310, 0.02586, 0.02328, 0.02328, 0.03259, 0.11302, 0.38250, 0.96888, 1.31578, 1.34483],
  clLo: [0.00000, 0.86207, 1.05172, 1.16379, 1.34698, 1.35345, 1.26724, 0.93103, 0.38793, -0.11207],
  cdHi: [0.03448, 0.01724, 0.01466, 0.01466, 0.02586, 0.11302, 0.38250, 0.96888, 1.31578, 1.34483],
  clHi: [0.00000, 0.94828, 1.13793, 1.25000, 1.42681, 1.38319, 1.26724, 0.93103, 0.38793, -0.11207],
  dcd: [0.0028, 0.0028, 0.0028, 0.0028, 0.0028, 0, 0, 0, 0, 0],
  dcl: [0, 0.0284, 0.0284, 0.0284, 0.0284, 0.0085, 0, 0, 0, 0],
  kpp: 0.01379
};
/** ORC Table 5.4, jib (low set); Table 5.6 the roller-furling lift change, a third of which is the cloth adjustment. */
const JIB_C = {
  b: [7, 15, 20, 27, 50, 60, 100, 150, 180],
  cd: [0.05, 0.032, 0.031, 0.037, 0.25, 0.35, 0.73, 0.95, 0.90],
  cl: [0, 1.0, 1.375, 1.45, 1.45, 1.25, 0.40, 0, -0.10],
  dcl: [0, 0.10, 0.10, 0.05, 0, 0, 0, 0, 0],
  kpp: 0.016
};
/** ORC's drag multiplier along the depowering curve (Figure 5.16 table): flat → fcdmult. */
const FCD = { f: [0.1, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0], m: [1.06, 1.06, 1.06, 1.055, 1.048, 1.035, 1.02, 1.008, 1.002, 1.0, 1.004, 1.06] };
/**
 * The rig (ORC 2026 certificates EST F51 FRIDA and EST F39 Castor): P 8.75, E 3.38, BAS 1.00, IG 6.50, J 2.00, jib
 * luff 5.95 and LP 2.36 (m). Derived: fractionality IG/(P+BAS) 0.667; overlap LP/J 1.18; roach (eq. 5.3) 0.193; the
 * main's centre of effort (eq. 5.7: the girth trapezoids' centroid, 3.23 m, + 0.024·P) 3.44 m above the boom, so 4.44
 * above the sheer; the jib's about 2.2 m above the sheer (its centroid, with the tack just above the deck); the sheer
 * 0.65 m above the waterline at the mast (Danish class correction-weight sheet: the waterline 620–665 mm below the deck
 * line); the highest point of the sails P + BAS above the sheer.
 */
export const RIG = {
  P: 8.75, E: 3.38, BAS: 1.0, IG: 6.5, J: 2.0, frac: 6.5 / 9.75, overlap: 2.36 / 2.0, roach: 0.193,
  zMain: 4.44, zJib: 2.2, hbi: 0.65, rm4: 0.43 * orc.boat.draft,
  /** The depth (camber/chord) of each sail with every flattening control off: "flat" is a sail's depth against this. */
  fullDepth: { main: 0.145, jib: 0.141 }
};
/** Effective span coefficient (eq. 5.42) and its fall-off as the sails are eased (eq. 5.43, Figure 5.15: 1.451 at 20° to 0.80 at 80°, taken as linear between). */
const EFF_SPAN = 1.1 + 0.08 * (RIG.roach - 0.2) + 0.5 * (0.68 + 0.31 * RIG.frac + 0.075 * RIG.overlap - 1.1);
const kheff = (awa: number) => 1.451 + (0.80 - 1.451) * clamp((awa - 20) / 60, 0, 1);

/** Heeling force (N, across the mast), drive (N) from both sails, and the height of their centre of effort above the hull's centre of pressure (m, `ceh`), for the apparent wind at the sails `aws` (m/s) at `awa` (deg). */
export function sailForces(aws: number, awa: number, main: { trim: SailTrim; shape: Shape; out: number }, jib: { trim: SailTrim; shape: Shape } | null, luffing: boolean): { main: SailForce; jib: SailForce; twist: number; ceh: number; flat: number } {
  const q = 0.5 * RHO_AIR * aws * aws, b = clamp(Math.abs(awa), 0, 180), a = b * D2R;
  const Am = AREA.main, Aj = jib ? AREA.jib : 0, Aref = Am + Aj;
  // each sail's maximum lift and parasitic drag at this wind angle (the jib blanketed by the main on a run, §5.6.2)
  const fj = (AREA.jib - Math.min(AREA.jib, RIG.IG * RIG.J / 2)) / AREA.jib, bkJ = b <= 135 ? 1 : 1 - fj * (b - 135) / 45;
  const clM = (tab(MAIN_C.b, MAIN_C.clLo, b) + tab(MAIN_C.b, MAIN_C.clHi, b)) / 2 - tab(MAIN_C.b, MAIN_C.dcl, b);
  const cdM = (tab(MAIN_C.b, MAIN_C.cdLo, b) + tab(MAIN_C.b, MAIN_C.cdHi, b)) / 2 + tab(MAIN_C.b, MAIN_C.dcd, b);
  const clJ = (tab(JIB_C.b, JIB_C.cl, b) - tab(JIB_C.b, JIB_C.dcl, b) / 3) * bkJ, cdJ = tab(JIB_C.b, JIB_C.cd, b) * bkJ;
  // the rig's efficiency: quadratic parasitic drag (eq. 5.41) and induced drag from its effective height (eqs. 5.45–5.46)
  const clMax = (clM * Am + clJ * Aj) / Aref;
  const kpp = clMax > 0.05 ? (MAIN_C.kpp * clM * clM * Am + JIB_C.kpp * clJ * clJ * Aj) / (Aref * clMax * clMax) : MAIN_C.kpp;
  const heff = EFF_SPAN * kheff(b) * (RIG.P + RIG.BAS + RIG.hbi);
  const ce = kpp + Aref / (Math.PI * heff * heff);
  // how much lift each sail makes: its depth against its fullest (flat), its trim, a worn sail's lost lift
  const trimK = (t: SailTrim) => (t.flow === 'luffing' ? 1 - t.amount * 0.92 : t.flow === 'stalled' ? 1 - 0.18 * t.amount : 1);
  const flatOf = (s: Shape, full: number) => clamp(s.depth / full, 0.42, 1);
  const fM = flatOf(main.shape, RIG.fullDepth.main), fJ = jib ? flatOf(jib.shape, RIG.fullDepth.jib) : 1;
  const one = (area: number, clmax: number, cd0: number, flat: number, jibSail: boolean, t: SailTrim, s: Shape): SailForce => {
    if (luffing) return { heel: q * area * 0.06 * Math.cos(a), drive: 0 };
    const cl = clmax * flat * trimK(t) * (s.clMul ?? 1), m = tab(FCD.f, FCD.m, flat);
    const cd = (jibSail ? cd0 * flat * m : cd0) + ((s.cd0 ?? 0.07) - 0.07) + ce * cl * cl * m; // (a worn sail's hooked leech adds its own profile drag)
    const L = q * area * cl, D = q * area * cd;
    return { heel: Math.max(0, L * Math.cos(a) + D * Math.sin(a)), drive: L * Math.sin(a) - D * Math.cos(a), ceAft: s.ceAft };
  };
  const mainF = one(Am, clM, cdM, fM, false, main.trim, main.shape);
  const jibF = jib ? one(Aj, clJ, cdJ, fJ, true, jib.trim, jib.shape) : { heel: 0, drive: 0 };
  // centre of effort (eq. 5.39), lowered as she's depowered (eq. 5.40), above the hull's centre of pressure
  const wM = Math.hypot(clM, cdM) * Am, wJ = Math.hypot(clJ, cdJ) * Aj;
  const flat = (fM * Am + fJ * Aj) / Aref;
  const zce = (RIG.zMain * wM + RIG.zJib * wJ) / Math.max(1e-6, wM + wJ);
  const low = (0.5 * (1 - flat) + 0.902 * (1 - flat) * (1 - RIG.frac)) * (1 - (RIG.overlap - 0.9) / 0.6);
  const ceh = RIG.hbi + zce * (1 - low) + RIG.rm4;
  return { main: mainF, jib: jibF, twist: main.shape.twist, ceh, flat };
}

/** Righting moment (N·m) at a heel angle (deg), with the crew hiking as hard as needed (`hike` 0..1). */
export function rightingMoment(heelDeg: number, hike = 1, disp = DISP): number {
  return hullRighting(heelDeg, disp) + CREW.kg * G * CREW.reach * hike * Math.cos(Math.abs(heelDeg) * D2R);
}
/** The hull's own righting moment (N·m): displacement (people included, sitting on the centreline) × righting arm.
 * Signed with the heel: it always pushes her back upright. */
export function hullRighting(heelDeg: number, disp = DISP, crewKg = 240): number {
  const t = heelDeg * D2R, td = Math.min(Math.abs(t), DECK_EDGE * D2R);
  // (the righting arm past small angles: the wall-sided formula, GZ = sin φ·(GM + ½·BM·tan²φ) (Rawson & Tupper, Basic
  // Ship Theory, ch. 4), the waterplane widening as she heels, until the deck edge reaches the water; past that it grows
  // no further. The certificates print only the moment at 1°, so the curve's shape past a few degrees is this formula)
  return disp * G * Math.sin(t) * (gmSailing(disp, crewKg) + 0.5 * BM * Math.tan(td) ** 2);
}
/**
 * The heeling moment (N·m) from the sails' heeling force acting `ceh` m above the hull's centre of pressure
 * (sailForces). The force is already the one square to the heeled mast, from the wind the heeled sails see (sailWind,
 * ORC eqs. 7.2–7.3), so the moment has no further cos(heel): ORC eq. 5.56, ½ρVa²·Aref·CH·(HBI + ZCE). (`heelDeg` kept
 * for the callers; unused.)
 */
export const heelingMoment = (heelForce: number, ceh: number, heelDeg?: number) => { void heelDeg; return heelForce * ceh; };

/**
 * Heel (deg, + to leeward, − to windward) with the crew where they are: the sails' heeling moment plus the crew's
 * weight to leeward (or minus it to windward) against the hull's righting moment. `crewMoment(h)`: + to windward, N·m.
 * With little wind in the sails and the crew up to windward she heels to windward.
 */
export function heelWithCrew(heelForce: number, ceh: number, disp: number, crewMoment: (h: number) => number, crewKg = 240): number {
  let lo = -40, hi = 75;
  for (let i = 0; i < 30; i++) {
    const h = (lo + hi) / 2;
    if (heelingMoment(heelForce, ceh, h) - crewMoment(h) > hullRighting(h, disp, crewKg)) lo = h; else hi = h;
  }
  return (lo + hi) / 2;
}

/**
 * Helm balance: the rudder angle (deg) she needs to sail straight. Positive is weather helm (she wants to turn
 * toward the wind; you hold the tiller to windward), negative lee helm. `boomOut` is the boom's angle off the
 * centreline (deg); `v` boat speed (m/s).
 */
export function helmNeeded(f: { main: SailForce; jib: SailForce }, heelDeg: number, boomOut: number, v: number, ceh: number, clrFwd = 0): number {
  // (clrFwd: the centre of lateral resistance moved forward by trimming her bow-down, hullTrim.ts: the side force then acts further aft of it)
  const m = sailYaw(f, heelDeg, boomOut, ceh) + (f.main.heel + f.jib.heel) * clrFwd;
  // (below ~3.5 kt the hull's grip falls away as fast as the rudder's, so the balance doesn't run away at low speed)
  const qw = 0.5 * RHO_W * Math.max(1.8, v) ** 2;
  return clamp(m / (qw * RUDDER.area * RUDDER.slope * RUDDER.arm) / D2R, -25, 25);
}

/**
 * The sails' turning moment about the keel (N·m, + toward the wind): side forces ahead of and behind the centre of
 * lateral resistance, and the drive pushed out to leeward by heel and by an eased boom.
 */
export function sailYaw(f: { main: SailForce; jib: SailForce }, heelDeg: number, boomOut: number, ceh: number): number {
  // (heel signed, + to leeward: heeled to windward, the drive pushes from to windward of the keel and turns her away)
  const h = heelDeg * D2R, ce = ceh;
  // side forces about the keel: the main aft (+ toward the wind), the jib forward (− away)
  // (a stretched old sail's draft sits further aft, and its force with it, by a share of the chord at the centre of effort)
  // (the heeling forces are square to the heeled mast: across the water, their horizontal part, cos(heel))
  let m = -Math.cos(h) * (f.main.heel * (LEVER.main - CHORD.main * 0.5 * (f.main.ceAft ?? 0)) + f.jib.heel * (LEVER.jib - CHORD.jib * 0.5 * (f.jib.ceAft ?? 0)));
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

/**
 * What pushes her along (N): the sails' drive less the hull and keel's induced drag for the side force they answer, at
 * boat speed v (m/s) and heel (deg). ORC VPP Documentation 2025, eq. 6.37: DI = FH² / (π·½ρV²·Te²), FH the side force
 * across the water (the sails' heeling force × cos heel). Te is ORC's effective draft, MHSD = 0.92 × the deepest
 * station's reduced draft (eq. 4.20); the Folkboat's reduced drafts aren't published (ORC works them from the hull's
 * offsets), so the full draft stands in for the deepest one: the largest Te, the least drag ORC's formula allows (an
 * estimate). And ORC's multiplier for a boat sailed nearly upright (Fig. 6.9: the keel and rudder sharing the lift
 * badly, even a little lee helm, at small heel), "fully active upwind", gone once the drive is more than 0.4 of the side
 * force: read off the figure, 1.57 upright, 1.31 at 5°, 1.08 at 10°, 1 from 15°. (A Folkboat's drive is 0.4–0.5 of
 * her side force even close-hauled, so by ORC's own rule the multiplier hardly applies to her.) Te is taken as fixed
 * with heel, as ORC prints MHSD; with FH the side force across the water, the drag falls as cos² of the heel.
 */
const DI_FACTOR = [1.57, 1.45, 1.31, 1.18, 1.08, 1.03, 1.0]; // every 2.5° of heel, ORC Fig. 6.9
export function diFactor(heelDeg: number, drive: number, side: number): number {
  const x = clamp(Math.abs(heelDeg) / 2.5, 0, DI_FACTOR.length - 1), i = Math.min(DI_FACTOR.length - 2, Math.floor(x));
  const k = DI_FACTOR[i] + (DI_FACTOR[i + 1] - DI_FACTOR[i]) * (x - i);
  const r = side > 1 ? drive / side : 1, t = clamp((r - 0.25) / 0.15, 0, 1), on = 1 - t * t * (3 - 2 * t); // (upwind: full; by 0.4: gone)
  return 1 + (k - 1) * on;
}
export function netDrive(f: { main: SailForce; jib: SailForce }, heelDeg: number, v: number): number {
  const q = 0.5 * RHO_W * Math.max(0.5, v) ** 2, side = f.main.heel + f.jib.heel, drive = f.main.drive + f.jib.drive;
  const fh = side * Math.cos(Math.min(60, Math.abs(heelDeg)) * D2R), te = 0.92 * orc.boat.draft;
  return drive - diFactor(heelDeg, drive, Math.abs(side)) * fh * fh / (Math.PI * q * te * te);
}

/**
 * Speed lost to the hull heeling past about 20°: the heeled hull's own resistance as the lee rail nears the water. ORC's
 * VPP works it from the hull's offsets (VPP Documentation 2025, §6.4), which aren't published for the Folkboat (ORC
 * and the NFIA hold them), so this curve is an estimate. (Fitting it so that the speed search depowers where North
 * Sails' guide does needs an impossible cost, 19% at 16°: see ROADMAP, the depowering question.)
 */
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
