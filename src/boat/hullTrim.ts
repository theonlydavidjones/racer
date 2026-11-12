import { clamp } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';
import { HULL, resistanceParts } from './dynamics';

/**
 * Fore-and-aft trim: where the weight sits along the boat trims her bow-down or stern-down, and that changes her
 * resistance and her helm.
 *
 * How far she trims: a weight moment M (kg·m, + forward) trims her by M / MCT centimetres, where MCT (the moment to
 * change trim one centimetre) is Δ·GM_L / (100·LWL). GM_L ≈ BM_L = I_L / ∇, with the waterplane's longitudinal
 * inertia I_L ≈ c·B_WL·LWL³. No Folkboat hydrostatics are published that we could reach (the class rules give the
 * principal dimensions only), so: LWL 6.00 m (folkboat.com, NFIA), B_WL ≈ 1.85 m and c ≈ 0.04 (a fine-ended yacht
 * waterplane; a rectangle would be 1/12) are estimates. That gives MCT ≈ 27 kg·m/cm: two crew (150 kg) moving 1 m
 * forward trim her about 5–6 cm by the bow.
 *
 * What it does to the resistance (directions from sailing practice: the Folk Boat Year Book 2022 says weight aft
 * upwind in heavy weather to get the bow out, forward downwind in light to moderate air; sailmakers' guides say forward
 * in light air to lift the transom clear and cut wetted area; the magnitudes are estimates, none measured for a
 * Folkboat):
 * - Skin friction goes with the wetted surface. Trimmed by the bow, the fuller after sections come out of the water
 *   as the fine bow goes in, and with both ends raked at about 45–50° her waterline length hardly changes: clipping the
 *   hull's own sections (render/hull.ts) at a trimmed waterplane, at constant displacement, gives a wetted surface that
 *   falls nearly linearly, about 0.037% per centimetre by the bow (−0.19% at 5 cm, −0.74% at 20 cm, +0.42% at 10 cm by
 *   the stern), with no minimum within what weight can do (physics review, November 2026). The trend is the geometry's;
 *   the magnitude is an estimate, the hull's sections being estimated. This is what long-overhang keelboat crews do:
 *   "In light to moderate wind, keeping the bow down and the stern up is pretty fast … Whoever is the tactician moves
 *   to the bow or by the mast downwind … When it's breezy, we bring the forward person back" (North Sails Dragon
 *   Speed Guide); on a Folkboat's light-air run, one crew astride the bow and one on the foredeck (the owner).
 * - Wave-making grows with bow-down trim once she's making waves (Froude number past about 0.25): the bow ploughs
 *   into her own bow wave. ±6% of the wave resistance per 10 cm of trim at Fn ≥ 0.4 (estimate).
 * - In a seaway upwind, bow-down trim makes her plough into the chop and pitch: the waves' added resistance grows with it
 *   (+20% of the added resistance per 10 cm by the bow, an estimate). This is the Year Book's "weight aft upwind in
 *   heavy weather to get the bow out": on the Bay a breeze always comes with a chop.
 * Friction dominates at low speed and wave-making near hull speed, so the best trim moves aft as she speeds up, and aft
 * again in a chop.
 *
 * And on the helm: bow-down deepens the forefoot and lifts the heel of the keel, moving the centre of lateral
 * resistance forward (more weather helm; Cockerill, "Boat Trim", Yachts & Yachting). For a lateral plane of length
 * l and mean depth T, trimmed by θ, the centroid moves θ·l²/(12·T): with the hull and keel's side-on area about half
 * of LWL × draft (physics.ts HOVE), about 9 cm per degree, a few tenths of a degree of helm: on a keelboat it's a
 * small effect (it's large on a dinghy, whose board is short and the hull's shape does the work).
 */
export const TRIM = {
  lwl: 6.0,
  bwl: 1.85,
  /** Waterplane longitudinal inertia coefficient (I_L = c·B·L³), an estimate. */
  cIL: 0.04,
  /** Wetted-surface change per metre of bow-down trim (fraction): from the hull's sections, above. */
  wsK: -0.037,
  /** Wave-resistance change per metre of bow-down trim, at full effect (Fn ≥ 0.4), an estimate. */
  waveK: 0.6,
  /** The keel's profile for the centre of lateral resistance: length and depth (m), from the ORC draft and the profile. */
  keelL: 5.9, keelT: 0.5 * orc.boat.draft,
  /** Added resistance in waves per metre of bow-down trim (fraction of the waves' own added resistance), an estimate: set
   * so a light-air chop doesn't outweigh the wetted surface (the guides put light-air crews forward upwind, chop or not),
   * while a breeze's steep sea does (the Year Book's weight aft upwind in heavy weather). */
  seaK: 0.1,
  /** The trim a standard crew (two, 150 kg) can give her from the cockpit, aft end to forward end (m): the polar is the boat sailed well, within this. */
  reach: [-0.016, 0.011] as [number, number]
};

/** Moment to change trim one centimetre (kg·m/cm) at displacement `disp` kg. */
export function mct(disp = HULL.displacement): number {
  const vol = disp / 1025, il = TRIM.cIL * TRIM.bwl * TRIM.lwl ** 3;
  return disp * (il / vol) / (100 * TRIM.lwl);
}
/** Trim (m, + bow down) from a fore-and-aft weight moment (kg·m, + forward of the reference). */
export const trimFromMoment = (m: number, disp = HULL.displacement) => m / mct(disp) / 100;

const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
/** The resistance change (fraction of the calm-water resistance) at speed v (m/s) and trim t (m, + bow down);
 * `sea`: the waves' added resistance as a share of the calm-water resistance. */
export function trimDrag(v: number, t: number, sea = 0): number {
  const p = resistanceParts(Math.max(0.3, v)), tot = p.friction + p.residuary;
  const ws = TRIM.wsK * t;
  const fn = Math.max(0.3, v) / Math.sqrt(9.81 * HULL.length);
  const wave = TRIM.waveK * smooth((fn - 0.25) / 0.15) * t;
  return (p.friction * ws + p.residuary * wave) / tot + sea * TRIM.seaK * t;
}
/** The trim (m) with the least resistance at speed v, within what weight can do (10 cm by the stern to 35 cm by the bow:
 * the crew right aft, or right up on the foredeck). (Cached by 0.02 m/s.) */
interface Best { t: number; d: number; n: number; fF: number; wR: number }
const bestCache = new Map<number, Best>();
function best(v: number, sea = 0): Best {
  const ks = Math.round(clamp(sea, 0, 1) * 40), key = Math.round(clamp(v, 0.3, 8) * 50) * 100 + ks, hit = bestCache.get(key); if (hit) return hit;
  const u = Math.floor(key / 100) / 50, sq = ks / 40;
  // (trimDrag's sum, with the hull's resistance at this speed worked out once)
  const r1 = resistanceParts(u), r2 = resistanceParts(u * 1.02), tot = r1.friction + r1.residuary;
  const fn0 = u / Math.sqrt(9.81 * HULL.length), wave0 = TRIM.waveK * smooth((fn0 - 0.25) / 0.15);
  const drag = (t: number) => (r1.friction * TRIM.wsK * t + r1.residuary * wave0 * t) / tot + sq * TRIM.seaK * t;
  let t0 = 0, lo = Infinity;
  for (let t = -0.1; t <= 0.3501; t += 0.005) { const d = drag(t); if (d < lo - 1e-12) { lo = d; t0 = t; } }
  // the least resistance a standard crew can reach from the cockpit: the polar's reference
  let reachD = Infinity; for (let t = TRIM.reach[0]; t <= TRIM.reach[1] + 1e-9; t += 0.0025) reachD = Math.min(reachD, drag(t));
  // the local exponent of resistance with speed (R ∝ vⁿ)
  const n = Math.log((r2.friction + r2.residuary) / (r1.friction + r1.residuary)) / Math.log(1.02);
  // (the friction share and the wave term's slope, so a step's trimDrag is a few multiplications: trimSpeedFactor)
  const fF = r1.friction / (r1.friction + r1.residuary), fn = u / Math.sqrt(9.81 * HULL.length);
  const out = { t: t0, d: reachD, n, fF, wR: (1 - fF) * TRIM.waveK * smooth((fn - 0.25) / 0.15) + sq * TRIM.seaK }; bestCache.set(key, out); return out;
}
export const bestTrim = (v: number, sea = 0) => best(v, sea).t;
/**
 * Speed factor from the trim at target speed vt (m/s): the same drive against a resistance changed by trimDrag gives
 * a speed lower by δR/n, where R ∝ vⁿ locally. Relative to the best trim a standard crew reaches from the cockpit (the
 * polar is the boat sailed well), so it's 1 there and a little less elsewhere (weight further forward than the cockpit
 * allows, at the mast, gains nothing beyond the polar, which is the boat sailed well).
 */
export function trimSpeedFactor(vt: number, t: number, sea = 0): number {
  const v = Math.max(0.5, vt), bt = best(v, sea);
  const d = bt.fF * TRIM.wsK * t + bt.wR * t - bt.d; // (trimDrag, at the cached speed)
  // (and a trim the cockpit can't reach, the crew right up on the foredeck in light air, pays its little: the owner's
  // crews go there because it's fast, and the polar is a crew sailing from the cockpit)
  return 1 / (1 + d) ** (1 / Math.max(1.5, bt.n));
}
/** How far forward (m) the centre of lateral resistance moves with trim t (m, + bow down). */
export const clrShift = (t: number) => (t / TRIM.lwl) * TRIM.keelL ** 2 / (12 * TRIM.keelT);

/**
 * The canoe body's wetted surface as she heels, from the Delft Systematic Yacht Hull Series regression (Keuning &
 * Sonnenberg 1999, TU Delft report 1177-P, as tabulated in Yerkes Medina, ULiège master's thesis 2022–23, pp. 64–67):
 * Sc(φ) = Sc(0)·[1 + (s0 + s1·B/T + s2·(B/T)² + s3·Cm)/100], a row of coefficients for each heel angle. Upright,
 * Sc(0) = (1.97 + 0.171·B/T)·(0.65/Cm)^⅓·√(∇c·LWL). For a narrow, deep hull like the Folkboat's it changes by well under
 * 1% at 5–10° (it saves wetted area only on beamy, shallow hulls): heeling her in light air is for the sails' shape,
 * not the wetted area. The Folkboat's waterline beam over canoe-body draft (1.85 / 0.55 m) and midship coefficient
 * (0.70) aren't published (the lines plan is the class's): estimates, inside the series' range (B/T 2.46–19.4,
 * Cm 0.65–0.78); ∇c ≈ 1.90 m³ the canoe body without its keel (an estimate).
 */
const DSYHS_HEEL: [number, number, number, number, number][] = [ // φ, s0, s1, s2, s3
  [5, -4.112, 0.054, -0.027, 6.329], [10, -4.522, -0.132, -0.077, 8.738], [15, -3.291, -0.389, -0.118, 8.949],
  [20, 1.850, -1.200, -0.109, 5.364], [25, 6.510, -2.305, -0.066, 3.443], [30, 12.334, -3.911, 0.024, 1.767],
  [35, 14.648, -5.182, 0.102, 3.497]
];
const HULL_BT = 1.85 / 0.55, HULL_CM = 0.70, CANOE_VOL = 1.90;
/** The canoe body's share of the whole hull's wetted surface (ORC's 14.75 m², keel and rudder included). */
const CANOE_SHARE = clamp((1.97 + 0.171 * HULL_BT) * Math.cbrt(0.65 / HULL_CM) * Math.sqrt(CANOE_VOL * TRIM.lwl) / 14.75, 0.3, 0.9);
/** The change (fraction) in the canoe body's wetted surface at heel (deg) against upright. */
export function heelWetted(heelDeg: number): number {
  const h = Math.min(35, Math.abs(heelDeg)), row = (r: number[]) => (r[1] + r[2] * HULL_BT + r[3] * HULL_BT ** 2 + r[4] * HULL_CM) / 100;
  if (h <= 5) return row(DSYHS_HEEL[0]) * h / 5;
  const i = Math.min(DSYHS_HEEL.length - 2, Math.floor(h / 5) - 1), f = (h - DSYHS_HEEL[i][0]) / 5;
  return row(DSYHS_HEEL[i]) * (1 - f) + row(DSYHS_HEEL[i + 1]) * f;
}
/**
 * Speed factor from the wetted surface at her heel against the polar crew's heel `refHeel` (the polar has theirs in it):
 * the change in skin friction (the canoe body's share of it) against a resistance R ∝ vⁿ.
 */
export function heelWettedFactor(vt: number, heelDeg: number, refHeel: number): number {
  const bt = best(Math.max(0.5, vt));
  return 1 / (1 + bt.fF * CANOE_SHARE * (heelWetted(heelDeg) - heelWetted(refHeel))) ** (1 / Math.max(1.5, bt.n));
}
