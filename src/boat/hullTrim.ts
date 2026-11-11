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
 * - Skin friction goes with the wetted surface. Bow-down a few centimetres lifts the transom and the after run clear
 *   (less wetted area); much more immerses the long bow overhang (more again); stern-down drags the transom. Modelled
 *   as a parabola: −2% wetted surface at its best, 5 cm by the bow, +6% at 5 cm by the stern (estimate).
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
  /** Wetted-surface change: its best (fraction) and where (m bow-down), and the parabola it follows (estimates). */
  wsBest: 0.02, wsAt: 0.05,
  /** Wave-resistance change per metre of bow-down trim, at full effect (Fn ≥ 0.4), an estimate. */
  waveK: 0.6,
  /** The keel's profile for the centre of lateral resistance: length and depth (m), from the ORC draft and the profile. */
  keelL: 5.9, keelT: 0.5 * orc.boat.draft,
  /** Added resistance in waves per metre of bow-down trim (fraction), an estimate. */
  seaK: 2,
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
  const ws = TRIM.wsBest * ((t - TRIM.wsAt) ** 2 - TRIM.wsAt ** 2) / TRIM.wsAt ** 2;
  const fn = Math.max(0.3, v) / Math.sqrt(9.81 * HULL.length);
  const wave = TRIM.waveK * smooth((fn - 0.25) / 0.15) * t;
  return (p.friction * ws + p.residuary * wave) / tot + sea * TRIM.seaK * t;
}
/** The trim (m) with the least resistance at speed v, within what weight can do (±15 cm). (Cached by 0.02 m/s.) */
interface Best { t: number; d: number; n: number; fF: number; wR: number }
const bestCache = new Map<number, Best>();
function best(v: number, sea = 0): Best {
  const ks = Math.round(clamp(sea, 0, 1) * 40), key = Math.round(clamp(v, 0.3, 8) * 50) * 100 + ks, hit = bestCache.get(key); if (hit) return hit;
  const u = Math.floor(key / 100) / 50, sq = ks / 40;
  let t0 = 0, lo = Infinity;
  for (let t = -0.15; t <= 0.1501; t += 0.005) { const d = trimDrag(u, t, sq); if (d < lo) { lo = d; t0 = t; } }
  // the least resistance a standard crew can reach from the cockpit: the polar's reference
  let reachD = Infinity; for (let t = TRIM.reach[0]; t <= TRIM.reach[1] + 1e-9; t += 0.0025) reachD = Math.min(reachD, trimDrag(u, t, sq));
  // the local exponent of resistance with speed (R ∝ vⁿ)
  const r1 = resistanceParts(u), r2 = resistanceParts(u * 1.02);
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
  const d = bt.fF * TRIM.wsBest * ((t - TRIM.wsAt) ** 2 - TRIM.wsAt ** 2) / TRIM.wsAt ** 2 + bt.wR * t - bt.d; // (trimDrag, at the cached speed)
  return 1 / (1 + Math.max(0, d)) ** (1 / Math.max(1.5, bt.n));
}
/** How far forward (m) the centre of lateral resistance moves with trim t (m, + bow down). */
export const clrShift = (t: number) => (t / TRIM.lwl) * TRIM.keelL ** 2 / (12 * TRIM.keelT);
