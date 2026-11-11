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
 * Friction dominates at low speed and wave-making near hull speed, so the best trim moves aft as she speeds up.
 *
 * And on the helm: bow-down deepens the forefoot and lifts the heel of the keel, moving the centre of lateral
 * resistance forward (more weather helm; Cockerill, "Boat Trim", Yachts & Yachting). For a keel profile of length
 * l and depth T, trimmed by θ, the centroid moves θ·l²/(12·T): about 2 cm per degree for the Folkboat's long keel, so
 * on a keelboat it's a small effect (it's large on a dinghy, whose board is short and the hull's shape does the work).
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
  keelL: 5.9, keelT: orc.boat.draft
};

/** Moment to change trim one centimetre (kg·m/cm) at displacement `disp` kg. */
export function mct(disp = HULL.displacement): number {
  const vol = disp / 1025, il = TRIM.cIL * TRIM.bwl * TRIM.lwl ** 3;
  return disp * (il / vol) / (100 * TRIM.lwl);
}
/** Trim (m, + bow down) from a fore-and-aft weight moment (kg·m, + forward of the reference). */
export const trimFromMoment = (m: number, disp = HULL.displacement) => m / mct(disp) / 100;

const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
/** The resistance change (fraction of the calm-water resistance) at speed v (m/s) and trim t (m, + bow down). */
export function trimDrag(v: number, t: number): number {
  const p = resistanceParts(Math.max(0.3, v)), tot = p.friction + p.residuary;
  const ws = TRIM.wsBest * ((t - TRIM.wsAt) ** 2 - TRIM.wsAt ** 2) / TRIM.wsAt ** 2;
  const fn = Math.max(0.3, v) / Math.sqrt(9.81 * HULL.length);
  const wave = TRIM.waveK * smooth((fn - 0.25) / 0.15) * t;
  return (p.friction * ws + p.residuary * wave) / tot;
}
/** The trim (m) with the least resistance at speed v, within what weight can do (±15 cm). */
export function bestTrim(v: number): number {
  let best = 0, lo = Infinity;
  for (let t = -0.15; t <= 0.1501; t += 0.005) { const d = trimDrag(v, t); if (d < lo) { lo = d; best = t; } }
  return best;
}
/**
 * Speed factor from the trim at target speed vt (m/s): the same drive against a resistance changed by trimDrag gives
 * a speed lower by δR/n, where R ∝ vⁿ locally. Relative to the best trim (the polar is the boat sailed well), so it's 1
 * at the best trim and a little less elsewhere.
 */
export function trimSpeedFactor(vt: number, t: number): number {
  const v = Math.max(0.5, vt), d = trimDrag(v, t) - trimDrag(v, bestTrim(v));
  const r1 = resistanceParts(v), r2 = resistanceParts(v * 1.02);
  const n = Math.log((r2.friction + r2.residuary) / (r1.friction + r1.residuary)) / Math.log(1.02);
  return 1 / (1 + Math.max(0, d)) ** (1 / Math.max(1.5, n));
}
/** How far forward (m) the centre of lateral resistance moves with trim t (m, + bow down). */
export const clrShift = (t: number) => (t / TRIM.lwl) * TRIM.keelL ** 2 / (12 * TRIM.keelT);
