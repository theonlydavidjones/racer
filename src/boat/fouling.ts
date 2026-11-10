/**
 * Hull fouling and the skin friction it adds.
 *
 * Roughness: each fouling condition has an equivalent sand-grain roughness k_s (Schultz 2007, "Effects of coating
 * roughness and biofouling on ship resistance and powering", Biofouling 23(5)): typical as-applied antifouling 30 µm,
 * light slime 100 µm, heavy slime 300 µm, small calcareous (barnacles, tubeworms) 1 mm, medium 3 mm, heavy 10 mm.
 *
 * Over time (a calibration, not a measurement on Bay yachts): slime builds over the first weeks, 15 µm after one,
 * 50 after two, 100 (light slime) after three, 300 (heavy slime) by six. Copper antifouling holds off the hard
 * growth for about six weeks (SF Bay panel tests: Davidson et al. 2020, Smithsonian SERC), then barnacles and
 * tubeworms: 300 µm at eight weeks, 1 mm at ten, 3 mm at twenty. Growth runs faster in warm water: the weeks count
 * for more in late summer than in January (a biological Q10 of about 2, an assumption).
 *
 * Friction: the roughness function ΔU⁺(k⁺) lowers the velocity profile, and with it the skin-friction coefficient.
 * Slime is soft and waves in the flow, and measured biofilm drag follows the Colebrook function, which has no smooth
 * regime (Schultz & Swain 1999: +33–187%). Hard growth follows the Cebeci–Bradshaw (Nikuradse) function, smooth until
 * k⁺ ≈ 2.25. A Folkboat is slow (friction velocity u_τ ≈ 0.04–0.11 m/s), so rigid roughness under ~100 µm hardly
 * matters to her, but slime costs a lot; fouling hurts most in light air, where friction is 80% of her resistance,
 * least near hull speed, where the waves she makes dominate. The rough-plate friction coefficient comes from an
 * explicit approximation to the boundary-layer integration (within ~3% for k_s ≤ 3 mm at 4–6 kt).
 *
 * Finish: an as-rolled antifouling has about 3% more friction than a wet-sanded, burnished racing bottom (Schultz
 * 2002, sanded vs unsanded paint; less at a Folkboat's speeds than on his plates).
 */

const NU = 1.19e-6, KAPPA = 0.41, LEN = 5.934; // seawater viscosity (m²/s), von Kármán's constant, her friction length (m)

export interface Fouling { label: string; slime: number; calc: number } // roughness (m)

const lerpLog = (pts: [number, number][], x: number): number => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], t = (x - x0) / (x1 - x0);
    return y0 <= 0 ? y1 * t : Math.exp(Math.log(y0) + (Math.log(y1) - Math.log(y0)) * t);
  }
  return pts[pts.length - 1][1];
};
const SLIME: [number, number][] = [[0, 0], [1, 15e-6], [2, 50e-6], [3, 100e-6], [6, 300e-6]];
const CALC: [number, number][] = [[6, 0], [8, 300e-6], [10, 1e-3], [20, 3e-3], [40, 10e-3]];

/** Surface water temperature in the Central Bay by month (°C, approximate: about 11 in winter, 16–17 in late summer). */
export const BAY_WATER_C = [11, 11.5, 12, 12.5, 13.5, 15, 15.5, 16, 17, 16, 14, 12];

/** The fouling on her bottom `weeks` after it was cleaned, in the month (1–12) she's sailing. */
export function fouling(weeks: number, month = 9): Fouling {
  const T = BAY_WATER_C[(month - 1 + 12) % 12], eff = weeks * 2 ** ((T - 14) / 10);
  const slime = lerpLog(SLIME, eff), calc = eff <= 6 ? 0 : lerpLog(CALC, eff);
  const label = calc >= 3e-3 ? 'heavy barnacles and weed' : calc >= 1e-3 ? 'barnacles and tubeworms' : calc > 0 ? 'first barnacles' : slime >= 250e-6 ? 'heavy slime' : slime >= 80e-6 ? 'slime' : slime > 0 ? 'a slime film' : 'clean';
  return { label, slime, calc };
}

const colebrook = (kp: number) => Math.log(1 + kp) / KAPPA;
const cebeciBradshaw = (kp: number) => {
  if (kp < 2.25) return 0;
  const lk = Math.log(kp);
  return kp >= 90 ? lk / KAPPA + 5 - 8.5 : (5 - 8.5 + lk / KAPPA) * Math.sin(0.4258 * (lk - 0.811));
};

/** Smooth-hull friction coefficient (ITTC-57) at speed v. */
export const cfSmooth = (v: number) => 0.075 / (Math.log10(Math.max(1e5, v * LEN / NU)) - 2) ** 2;

/** The friction coefficient of the fouled hull at speed v (m/s). */
export function cfRough(f: Fouling, v: number): number {
  const cf0 = cfSmooth(v);
  if (v < 0.05 || (f.slime <= 0 && f.calc <= 0)) return cf0;
  let cf = cf0;
  for (let i = 0; i < 16; i++) {
    const ut = v * Math.sqrt(cf / 2), ks = ut / NU;
    const kpS = f.slime * ks, kpC = f.calc * ks, kbar = Math.max(kpS, kpC);
    const du = Math.hypot(colebrook(kpS) * (f.slime > 0 ? 1 : 0), cebeciBradshaw(kpC)); // slime and hard growth together
    const alpha = 0.8 - 0.008 * Math.log(1 + kbar);
    const s = Math.max(2, Math.sqrt(2 / cf0) - alpha * du);
    cf = cf + (2 / (s * s) - cf) * 0.6; // relaxed fixed point
  }
  return cf;
}

/** Roughness of the paint itself, as an added fraction of smooth friction: an as-rolled antifouling vs a burnished racing finish. */
export const finishFactor = (f: 'race' | 'antifouling') => f === 'race' ? 0 : 0.03;

/** Added friction coefficient ΔC_F at speed v: fouling plus the paint's finish. */
export const dCfAt = (f: Fouling, finish: 'race' | 'antifouling', v: number) => cfRough(f, v) - cfSmooth(v) + finishFactor(finish) * cfSmooth(v);
