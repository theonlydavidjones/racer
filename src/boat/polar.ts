import { KT } from '../core/math';

/** Target boatspeed (m/s) for a true wind speed (kt) and true wind angle (deg).
 * TODO: this polar is invented. Replace with a realistic Folkboat polar. */
export function polar(kt: number, twa: number): number {
  const vmax = Math.min(6.3, 1.9 + 0.38 * kt);
  let f: number;
  if (twa < 30) f = 0;
  else if (twa < 42) f = 0.82 * (twa - 30) / 12;
  else if (twa < 90) f = 0.82 + 0.18 * (twa - 42) / 48;
  else if (twa < 130) f = 1;
  else f = 1 - 0.2 * (twa - 130) / 50;
  return vmax * f * KT;
}
