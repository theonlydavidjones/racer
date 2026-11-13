import { D2R } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';

/**
 * Folkboat speed and turning dynamics.
 *
 * Speed: m·dv/dt = drive − hull resistance − windage − turning drag.
 * Drive is set so the boat settles exactly at its polar target speed: drive = R(target), shaped below and above
 * that speed by how the sails' drive changes with the apparent wind (a DriveCurve: driveCurve.ts, from the sail model;
 * close-hauled she has less push slow than at speed, on a run more).
 * Hull resistance uses the certificate's wetted surface (ITTC-57 friction) and a residuary
 * (wave) term that climbs steeply toward hull speed. The constants below are the tuning knobs;
 * tests/boat.test.ts pins the behaviour they produce.
 */
const RHO_WATER = 1025, RHO_AIR = 1.225, NU = 1.19e-6, G = 9.81;

export const HULL = {
  displacement: orc.boat.displacementSailing, // kg, sailing trim incl. crew (ORC)
  wettedSurface: orc.boat.wettedSurface, // m² (ORC)
  length: orc.boat.imsL, // m, ORC sailing length
};

export const HANDLING = {
  /** Effective mass in surge: displacement plus ~8% added mass of water. */
  mass: HULL.displacement * 1.08,
  /**
   * Friction form factor for a full-bodied long-keel hull. Unsourced. ORC's VPP uses 1.05 for the canoe body with the
   * Hughes friction line, 0.066/(log10 Re − 2.03)², at Re on 0.85 × its sailing length (ORC VPP Documentation 2023,
   * §6.1.1 eq. 6.2), and puts the rest of the hull's form effect in its residuary resistance. So the two figures aren't
   * directly comparable: this one and the RESIDUARY table below have to be checked together.
   */
  formFactor: 1.15,
  /** Drag area of the sails when they flog (luffing or head to wind). A flogging sail lies mostly
   * edge-on to the wind: ~0.12 × 25.8 m² of main and jib. */
  flogCdA: 3,
  /** Turning radius with the helm hard over, m (about 1.2 boat lengths for a long keel). An uncited estimate: it sets
   * the penalty turns' pace too (physics.ts PENALTY_TURN_RATE, where the sim's 720 is compared with a real one). */
  turnRadius: 9,
  /** Turn rate when nearly stopped, by sculling (physics.ts: only toward close-hauled from above it, rule 42.3(d)), deg/s. An estimate. */
  minTurnRate: 4,
  /** Hard limit on turn rate, deg/s. */
  maxTurnRate: 22,
  /** Speed lost to the rudder and hull yawing: dv/dt = −k·v·|ω| (ω in rad/s). An uncited estimate (with turnRadius it
   * sets how long penalty turns take: physics.ts PENALTY_TURN_RATE). */
  turnDrag: 0.15,
  /** Drive while luffing (sails eased until they lift), as a fraction of normal target speed. */
  luffFactor: 0.12,
  /** How much the sails flog while luffing (fully eased: they flog, and the boat coasts to a stop). */
  luffFlog: 1,
};

/** Wave-making (residuary) resistance as a fraction of displacement weight, by Froude number. */
const RESIDUARY: [number, number][] = [
  [0, 0], [0.15, 0.0003], [0.2, 0.0008], [0.25, 0.0018], [0.3, 0.004], [0.35, 0.0085],
  [0.4, 0.019], [0.45, 0.038], [0.5, 0.062], [0.6, 0.11],
  // past Fn 0.6 the polar never goes (a displacement hull can't climb its own bow wave), but the force model (heaving
  // to) can be pushed there, so the wall keeps rising: the same slope as 0.5–0.6, extrapolated
  [0.7, 0.16], [0.8, 0.21], [1.0, 0.31]
];

function residuaryFraction(fn: number): number {
  const t = RESIDUARY;
  if (fn >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) if (fn <= t[i][0]) {
    const [x0, y0] = t[i - 1], [x1, y1] = t[i];
    return y0 + (y1 - y0) * (fn - x0) / (x1 - x0);
  }
  return 0;
}

/** Drive left when you ease the sails to slow down. Upwind and reaching they flog and stop pulling;
 * from a broad reach to a run, eased sails still fill against the shrouds, so easing barely slows you
 * (to slow down there, head up first). */
export function luffDriveFactor(twa: number): number {
  const t = Math.min(1, Math.max(0, (twa - 100) / 60));
  return HANDLING.luffFactor + (0.75 - HANDLING.luffFactor) * t * t * (3 - 2 * t);
}

/** Calm-water hull resistance at speed v (m/s), newtons. (Tabled every 1 mm/s up to 10 m/s and interpolated: the AI's
 * predictions ask for it thousands of times a step.) */
const RES_STEP = 0.001, RES_N = 10001, resTable = new Float64Array(RES_N).fill(NaN);
const resAt = (i: number) => { let r = resTable[i]; if (Number.isNaN(r)) { const p = resistanceParts(i * RES_STEP); r = resTable[i] = p.friction + p.residuary; } return r; };
export function hullResistance(v: number): number {
  if (v <= 0) return 0;
  const x = v / RES_STEP, i = Math.floor(x);
  if (i >= RES_N - 1) { const r = resistanceParts(v); return r.friction + r.residuary; }
  const f = x - i;
  return resAt(i) * (1 - f) + resAt(i + 1) * f;
}
/** The two parts of the calm-water resistance (N): skin friction (goes with the wetted surface) and wave-making. */
export function resistanceParts(v: number): { friction: number; residuary: number } {
  if (v <= 0) return { friction: 0, residuary: 0 };
  const re = Math.max(1e5, v * HULL.length / NU);
  const cf = 0.075 / (Math.log10(re) - 2) ** 2;
  const friction = 0.5 * RHO_WATER * HULL.wettedSurface * cf * v * v * HANDLING.formFactor;
  const fn = v / Math.sqrt(G * HULL.length);
  return { friction, residuary: HULL.displacement * G * residuaryFraction(fn) };
}

/** The sails' drive at speed v as a share of their drive at the target speed (driveCurve.ts driveRatio, for the wind and
 * angle she's sailing). Without one, the drive is the target's at every speed (eased sails, or nothing better known). */
export type DriveCurve = (v: number) => number;
/** Sail drive (N) at speed v when the trimmed target speed is vt. */
export function drive(v: number, vt: number, k?: DriveCurve): number {
  if (vt <= 0) return 0;
  return driveFrom(hullResistance(vt), v, vt, k);
}
/** drive(v, vt), given hullResistance(vt) (`rvt`): for a search over v at one vt, which needn't look it up each time. */
export const driveFrom = (rvt: number, v: number, _vt: number, k?: DriveCurve): number => rvt * (k ? k(v) : 1);

/**
 * The speed (m/s) she settles at with K times the drive that holds her at vt: a sheet off its mark, a sail half hoisted,
 * a flatter shape. Where K × her drive (with `k`, how the sails' drive changes with her speed: driveCurve.ts) meets the
 * hull's resistance. Near hull speed the resistance climbs as v^3 to v^5.6, so a 10% loss of drive there costs 2–3% of
 * speed, not the 5% that "speed goes as the square root of drive" (resistance as v²) would make it.
 */
export function speedForDrive(vt: number, K: number, k?: DriveCurve): number {
  if (vt <= 0 || K <= 0) return 0;
  if (Math.abs(K - 1) < 1e-9) return vt;
  const rvt = hullResistance(vt), f = (v: number) => K * driveFrom(rvt, v, vt, k) - hullResistance(v);
  // (the one crossing, bracketed between rest and 1.4·vt, found by false position with the Illinois step: to 1 ppm of
  // vt in 6–10 looks where bisection took 20; it runs every step for every boat)
  let a = 0, fa = f(0), c = vt * (K > 1 ? 1.4 : 1), fc = f(c), side = 0;
  if (fc >= 0) return c;
  for (let i = 0; i < 40; i++) {
    const m = (a * fc - c * fa) / (fc - fa), fm = f(m);
    if (Math.abs(c - a) < 1e-6 * vt || Math.abs(fm) < 1e-7 * rvt) return m;
    if (fm > 0) { a = m; fa = fm; if (side === 1) fc /= 2; side = 1; } else { c = m; fc = fm; if (side === -1) fa /= 2; side = -1; }
  }
  return (a + c) / 2;
}
/** speedForDrive as a ratio of speeds: what K × the drive is worth at vt (1 at K = 1). */
export const driveSpeedRatio = (vt: number, K: number, k?: DriveCurve): number => vt > 0.05 ? speedForDrive(vt, K, k) / vt : Math.sqrt(Math.max(0, K));
/** The effective exponent n of drive against speed at vt (a drive ratio K is worth K^(1/n) in speed, near K = 1). */
export const driveExponent = (vt: number, k?: DriveCurve): number => vt > 0.05 ? Math.log(0.95) / Math.log(speedForDrive(vt, 0.95, k) / vt) : 2;

/**
 * Air drag (N) against forward motion when the sails aren't drawing: rig windage plus flogging sails.
 * `flog` is 0..1, how much the sails are flogging (1 when luffing or head to wind). `hoisted` 0..1: how much of her sail
 * is up (the area's share). The flogging cloth is no more than is hoisted; the rig's windage counts as far as the sails
 * aren't drawing (flogging, or struck: with them down, all of it, at any angle forward of the beam). Hoisted in full, as
 * before: flog × (windage + flogging).
 * aws is apparent wind speed (m/s), awa apparent wind angle (deg); only wind from forward of the beam slows the boat.
 */
export function airDrag(aws: number, awa: number, flog: number, hoisted = 1): number {
  const bare = Math.max(flog, 1 - hoisted), cloth = Math.min(flog, hoisted);
  if (awa >= 90 || bare <= 0) return 0;
  const q = 0.5 * RHO_AIR * aws * aws;
  return q * (windFore(awa) * bare + HANDLING.flogCdA * cloth * Math.cos(awa * D2R));
}

/**
 * Windage: the wind on her hull, mast and crew, as drag areas (Cd × area, m²) at apparent wind angle `awa` (deg): the
 * fore-and-aft part (`windFore`: positive pushes her astern, negative, the wind abaft the beam, ahead) and the sideways
 * part (`windSide`, to leeward). Each times ½ρV² is the force.
 *
 * The sizes bow-on and beam-on are ORC's windage model's (VPP Documentation 2023, §5.3, Table 5.10):
 *  - hull: Cd 0.816 on freeboard × beam bow-on, freeboard × LOA beam-on (0.65 m freeboard, an estimate; 2.20 m beam,
 *    7.64 m LOA, the class's);
 *  - mast: 0.4 bow-on and 0.6 side-on (with sail set; 0.8 bare), on its section × 9.5 m (0.075 m across, 0.10 m fore
 *    and aft: estimates);
 *  - crew: 1.08 on 0.25 m² bow-on and 0.5 m² a person beam-on (ORC's "0.5·Mvblcrew", read as a head count: an estimate).
 * Rigging wire, small beside these, is left out. So about 1.7 m² bow-on and 6.2 m² beam-on with three aboard (the sim
 * had 2.0 fore and aft at every angle, and 5.5 side-on).
 *
 * Between bow-on and beam-on:
 *  - mast and crew are bluff: their drag lies along the apparent wind, ORC's blend between the two (eq. 5.26,
 *    Cd·A = Cd_front·A_front·|cos β| + Cd_side·A_side·sin β), its parts cos and sin of the angle, as ORC resolves it.
 *  - the hull is a slab: the wind on its side pushes it sideways, not astern. ORC's blend, all of it along the wind,
 *    gives her more drag astern with the wind 70° off the bow than dead ahead (a VPP's shortcut, close enough on the
 *    wind with sails drawing; wrong for a boat under bare poles, hove to or motoring). Measured ships' hulls don't:
 *    their fore-and-aft force holds about level to 30–45° and falls to nothing beam-on. So the hull's parts follow
 *    Blendermann's fit to wind-tunnel loads (Blendermann 1994, "Parameter identification of wind loads on ships",
 *    J. Wind Eng. Ind. Aerodyn. 51, 339–351, as in Fossen's Handbook of Marine Craft Hydrodynamics §10.1 and his MSS
 *    library's blendermann94.m; read from that code, the paper itself not reached): fore-and-aft front·cos γ / den,
 *    sideways side·sin γ / den, den = 1 − ½δ(1 − front/side)·sin² 2γ. δ, the cross-force parameter, is 0.6: his speed
 *    boat's (0.60) and tender's (0.65), the smallest craft in his table (ships' hulls, not a yacht's: an estimate).
 */
const WINDAGE = {
  hullFront: 0.816 * 0.65 * 2.2, hullSide: 0.816 * 0.65 * 7.64, delta: 0.6,
  bluffFront: 0.4 * 0.075 * 9.5 + 1.08 * 0.25, mastSide: 0.6 * 0.10 * 9.5, crewSide: 1.08 * 0.5
};
/** Mast and crew: their drag area along the apparent wind (ORC's blend). */
const bluffCdA = (c: number, s: number, crew: number) => WINDAGE.bluffFront * Math.abs(c) + (WINDAGE.mastSide + WINDAGE.crewSide * crew) * s;
/** The hull's share of Blendermann's denominator (1 bow-on and beam-on, least at 45°). */
const hullDen = (c: number, s: number) => 1 - 2 * WINDAGE.delta * (1 - WINDAGE.hullFront / WINDAGE.hullSide) * s * s * c * c;
export function windFore(awa: number, crew = 3): number {
  const a = Math.abs(awa) * D2R, c = Math.cos(a), s = Math.sin(a);
  return (WINDAGE.hullFront / hullDen(c, s) + bluffCdA(c, s, crew)) * c;
}
export function windSide(awa: number, crew = 3): number {
  const a = Math.abs(awa) * D2R, c = Math.cos(a), s = Math.sin(a);
  return (WINDAGE.hullSide / hullDen(c, s) + bluffCdA(c, s, crew)) * s;
}

/** How much the sails flog (0..1): none at or above the beat angle, fully by head to wind; partly when eased to luff. */
export function flogAmount(twa: number, beat: number, noGo: number, luffing: boolean): number {
  const byAngle = twa >= beat ? 0 : Math.min(1, (beat - twa) / (beat - noGo));
  return luffing ? Math.max(HANDLING.luffFlog * (1 - Math.min(1, Math.max(0, (twa - 100) / 60))), byAngle) : byAngle;
}

/** Surge acceleration, m/s². */
export function surgeAccel(v: number, vt: number, windageN: number, dispKg = HULL.displacement, k?: DriveCurve): number {
  return (drive(v, vt, k) - hullResistance(v) - windageN) / (HANDLING.mass * dispKg / HULL.displacement);
}

/** Fastest the helm can turn the boat at speed v (m/s), deg/s. Rudder authority comes from water flow. */
export function maxTurnRate(v: number): number {
  return Math.min(HANDLING.maxTurnRate, Math.max(HANDLING.minTurnRate, v / HANDLING.turnRadius / D2R));
}
/** The turn rate the rudder alone gives at speed v (m/s) through the water, deg/s: none without water flowing past it. */
export const flowTurnRate = (v: number): number => Math.min(HANDLING.maxTurnRate, Math.max(0, v) / HANDLING.turnRadius / D2R);

/**
 * Time (s) to make `dist` metres of progress in some direction if the boat sheets in now and
 * holds its heading: it accelerates from v0 toward target vt; `along` is the cosine between
 * heading and the direction of progress, `drift` is current along that direction (m/s).
 * Returns Infinity if not reached within `limit` seconds.
 */
export function timeToCover(dist: number, v0: number, vt: number, along = 1, drift = 0, limit = 240, k?: DriveCurve): number {
  if (dist <= 0) return 0;
  const dt = 0.25;
  let v = v0, x = 0;
  for (let t = 0; t < limit; t += dt) {
    const v1 = Math.max(0, v + surgeAccel(v, vt, 0, HULL.displacement, k) * dt);
    const dx = ((v + v1) / 2 * along + drift) * dt;
    if (x + dx >= dist) return t + dt * (dist - x) / Math.max(1e-6, dx);
    x += dx; v = v1;
  }
  return Infinity;
}

/** Distance (m) the boat coasts in `seconds` if the sails are eased right now (luffing), starting at v0.
 * Uses the true wind as the apparent wind, which is close enough once the boat has slowed. `vt`: her trimmed target
 * speed on this heading, for the drive eased sails still give (a little on a reach; most of it on a run, where they
 * fill against the shrouds: luffDriveFactor, as physics.ts applies it). */
export function coastDistance(v0: number, seconds: number, windKt: number, twa: number, vt = 0): number {
  const dt = 0.25, aws = windKt * 0.5144, vLuff = vt * luffDriveFactor(twa);
  let v = v0, x = 0;
  for (let t = 0; t < seconds && (v > 0.01 || vLuff > 0); t += dt) {
    const a = surgeAccel(v, vLuff, airDrag(aws, twa, flogAmount(twa, 90, 0, true)));
    const v1 = Math.max(0, v + a * dt);
    x += (v + v1) / 2 * Math.min(dt, seconds - t); v = v1;
  }
  return x;
}
