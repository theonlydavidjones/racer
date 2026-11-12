/**
 * How a cloth flag flaps in the wind, from measurements of flags in a flow.
 *
 * Chen, Wu, Sun & Yu, "Bifurcation and chaos of a flag in an inviscid flow", J. Fluids Struct. 45 (2014),
 * doi:10.1016/j.jfluidstructs.2013.11.020, Fig. 9 (experiment and simulation, the flag's length L, the flow U):
 *  - a flag flaps at a frequency proportional to the wind: f·L/U is fixed for each flapping mode, and it jumps up a mode
 *    as the flow grows stiffer-relative (U* = U·L·√(m/D), m the cloth's mass per area, D its bending stiffness): about
 *    0.3 in the first mode, 0.43 in the second (measured), 0.68 and 0.88 in the higher ones (computed);
 *  - its fly end swings about 0.2–0.4 L either side (A/L, measured 0.27–0.39 in the first two modes, computed about
 *    0.2–0.25 in the higher), and that hardly changes with the wind once it flaps.
 * A cloth flag, with almost no bending stiffness, sits far up the U* scale, in the higher modes: here f·L/U = 0.8 and
 * A/L = 0.22. So a 0.6 m ensign flaps about 7 times a second in 10 kt, 17 in 25 kt.
 *  - The wave travels from the hoist to the fly, growing all the way (none at the hoist, where it's held); at those
 *    modes about 2½ half-waves lie along the flag, so the wave runs at about 0.7 U (c = f·λ, λ = 0.8 L).
 *  - Real flapping is never a pure tone (the higher modes are quasi-periodic and chaotic in the same study): a second,
 *    weaker wave at an unrelated rate rides on it.
 * In light air a flag hangs: the Beaufort scale's force 3 (7–10 kt, WMO) is the breeze that "extends light flags". Here
 * it starts to lift from 3 kt and streams fully from 8.
 * One limit is the screen's, not the flag's: a picture drawn 60 times a second can't show a flap faster than about
 * 12 a second without it seeming to crawl backwards (the wagon-wheel effect), so the rate stops there; a real flag that
 * fast is a blur anyway.
 */

export const FLAG = {
  /** f·L/U, the flapping frequency against the wind and the flag's length (Chen et al. 2014, the higher modes). */
  strouhal: 0.8,
  /** The fly end's swing either side, as a share of the flag's length (Chen et al. 2014). */
  tip: 0.22,
  /** Half-waves along the flag. */
  halfWaves: 2.5,
  /** The fastest flapping drawn (Hz): the screen's limit, not the flag's. */
  maxHz: 12,
  /** The wind (m/s) where the flag starts to lift, and where it streams fully (3 and 8 kt; Beaufort force 3). */
  lift: 3 * 0.5144, stream: 8 * 0.5144,
};

/** How far the flag streams out of its droop (0 hanging … 1 streaming) in an apparent wind of `aws` m/s. */
export function flagExtension(aws: number): number {
  const k = Math.min(1, Math.max(0, (aws - FLAG.lift) / (FLAG.stream - FLAG.lift)));
  return k * k * (3 - 2 * k);
}

/** The flapping rate (Hz) of a flag `fly` metres long in an apparent wind of `aws` m/s. */
export function flagHz(aws: number, fly: number): number {
  return Math.min(FLAG.maxHz, FLAG.strouhal * Math.max(0, aws) / fly);
}

/**
 * The cloth's sideways offset (m) at `u` along the flag (0 at the hoist, 1 at the fly), at flapping phase `ph`
 * (radians, advancing at 2π·flagHz) for a flag `fly` metres long, streaming `ext` (0..1).
 */
export function flagOffset(u: number, ph: number, fly: number, ext: number): number {
  const kx = FLAG.halfWaves * Math.PI * u;
  // the wave grows from nothing at the hoist (held there) to its full swing at the fly end
  const env = u * Math.sqrt(u);
  const s = Math.sin(kx - ph) + 0.3 * Math.sin(1.7 * kx - 1.37 * ph + 0.8);
  return FLAG.tip * fly * env * ext * s / 1.3; // (1.3: the two waves' joint peak at most, so the fly end swings tip·L)
}

/**
 * Striking the ensign, or hoisting it: how far along it is (0 flying … 1 struck), stepped `dt` seconds toward `struck`.
 * The flag comes down its staff hand over hand in the first 3 s, then the staff comes out of its socket and goes below
 * (1 s); hoisting, the other way round. `slide` is how far down the staff the flag is (0..1), `out` how far the staff is
 * out of its socket (0..1).
 */
export function ensignStep(down: number, struck: boolean, dt: number): { down: number; slide: number; out: number } {
  const want = struck ? 1 : 0, d = want > down ? Math.min(want, down + dt / 4) : Math.max(want, down - dt / 4);
  return { down: d, slide: Math.min(1, d / 0.75), out: Math.max(0, (d - 0.75) / 0.25) };
}
