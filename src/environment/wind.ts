import { n360 } from '../core/math';

/** True wind over the ground. `from` is a compass direction, `kt` is speed in knots. */
export interface Wind { from: number; kt: number }

/** Synthetic oscillating breeze: a 120 s and a 41 s direction oscillation plus a 63 s pressure pulse.
 * TODO: replace with station-history base wind plus modelled puffs and shifts. */
export interface WindModel { base: number; kt: number; phase: [number, number, number] }

export function windAt(m: WindModel, t: number): Wind {
  const p = m.phase;
  const from = m.base + 6 * Math.sin(2 * Math.PI * t / 120 + p[0]) + 2.5 * Math.sin(2 * Math.PI * t / 41 + p[1]);
  return { from: n360(from), kt: m.kt * (1 + 0.08 * Math.sin(2 * Math.PI * t / 63 + p[2])) };
}
