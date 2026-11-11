import { D2R } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';

/**
 * Folkboat speed and turning dynamics.
 *
 * Speed: m·dv/dt = drive − hull resistance − windage − turning drag.
 * Drive is set so the boat settles exactly at its polar target speed: drive = R(target),
 * plus a boost at low speed (stopped or slow, the apparent wind is broader and nearly as
 * strong as the true wind, so the sails pull harder than at full speed).
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
  /** Friction form factor for a full-bodied long-keel hull. */
  formFactor: 1.15,
  /** Extra drive at zero speed, as a fraction of the drive at target speed. */
  driveBoost: 0.6,
  /** Drag area of hull, mast and rigging, m². */
  windageCdA: 2.0,
  /** Drag area of the sails when they flog (luffing or head to wind). A flogging sail lies mostly
   * edge-on to the wind: ~0.12 × 25.8 m² of main and jib. */
  flogCdA: 3,
  /** Turning radius with the helm hard over, m (about 1.2 boat lengths for a long keel). */
  turnRadius: 9,
  /** Turn rate available when nearly stopped (backing the jib, sculling), deg/s. */
  minTurnRate: 4,
  /** Hard limit on turn rate, deg/s. */
  maxTurnRate: 22,
  /** Speed lost to the rudder and hull yawing: dv/dt = −k·v·|ω| (ω in rad/s). */
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

/** Sail drive (N) at speed v when the trimmed target speed is vt. */
export function drive(v: number, vt: number): number {
  if (vt <= 0) return 0;
  return hullResistance(vt) * (1 + HANDLING.driveBoost * Math.max(0, 1 - v / vt));
}

/**
 * Air drag (N) against forward motion when the sails aren't drawing: rig windage plus flogging sails.
 * `flog` is 0..1, how much the sails are flogging (1 when luffing or head to wind).
 * aws is apparent wind speed (m/s), awa apparent wind angle (deg); only wind from forward of the beam slows the boat.
 */
export function airDrag(aws: number, awa: number, flog: number): number {
  if (awa >= 90 || flog <= 0) return 0;
  const q = 0.5 * RHO_AIR * aws * aws;
  return flog * q * (HANDLING.windageCdA + HANDLING.flogCdA) * Math.cos(awa * D2R);
}

/** How much the sails flog (0..1): none at or above the beat angle, fully by head to wind; partly when eased to luff. */
export function flogAmount(twa: number, beat: number, noGo: number, luffing: boolean): number {
  const byAngle = twa >= beat ? 0 : Math.min(1, (beat - twa) / (beat - noGo));
  return luffing ? Math.max(HANDLING.luffFlog * (1 - Math.min(1, Math.max(0, (twa - 100) / 60))), byAngle) : byAngle;
}

/** Surge acceleration, m/s². */
export function surgeAccel(v: number, vt: number, windageN: number, dispKg = HULL.displacement): number {
  return (drive(v, vt) - hullResistance(v) - windageN) / (HANDLING.mass * dispKg / HULL.displacement);
}

/** Fastest the helm can turn the boat at speed v (m/s), deg/s. Rudder authority comes from water flow. */
export function maxTurnRate(v: number): number {
  return Math.min(HANDLING.maxTurnRate, Math.max(HANDLING.minTurnRate, v / HANDLING.turnRadius / D2R));
}

/**
 * Time (s) to make `dist` metres of progress in some direction if the boat sheets in now and
 * holds its heading: it accelerates from v0 toward target vt; `along` is the cosine between
 * heading and the direction of progress, `drift` is current along that direction (m/s).
 * Returns Infinity if not reached within `limit` seconds.
 */
export function timeToCover(dist: number, v0: number, vt: number, along = 1, drift = 0, limit = 240): number {
  if (dist <= 0) return 0;
  const dt = 0.25;
  let v = v0, x = 0;
  for (let t = 0; t < limit; t += dt) {
    const v1 = Math.max(0, v + surgeAccel(v, vt, 0) * dt);
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
