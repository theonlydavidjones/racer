/**
 * How a cloth flag flaps in the wind, from measurements of flags in a flow.
 *
 * Chen, Wu, Sun & Yu, "Bifurcation and chaos of a flag in an inviscid flow", J. Fluids Struct. 45 (2014),
 * doi:10.1016/j.jfluidstructs.2013.11.020, Fig. 9 (its flag's length L, the flow U; M* = ρs/(ρf·L) its mass ratio,
 * U* = U·√(ρf·L³/EI) its flow against its bending stiffness):
 *  - a flag flaps at a frequency proportional to the wind: f·L/U is fixed for each flapping mode, and steps up a mode as
 *    U* grows: measured about 0.3 in the first mode and 0.43 in the second, computed 0.37–0.44, 0.67, then 0.68 and
 *    0.88 in the higher ones; their measurements ran at 0.65–0.8 of their computation's (2-D, inviscid, a square flag);
 *  - its fly end swings about 0.2–0.4 L to each side (A/L: measured 0.27–0.39 in the first two modes, computed 0.19–0.25
 *    in the higher), much the same at any wind once it flaps.
 * A cloth flag in air is light (M* about 0.1–0.3) and has almost no bending stiffness (U* very large), so it flaps in the
 * higher modes, with more waves along it (Eloy et al. 2008; Virot et al. 2013): their computed 0.68–0.88 scaled by the
 * measured-to-computed ratio gives f·L/U about 0.45–0.65. Here 0.55, and a swing of 0.19 L, their higher modes'. So a
 * 0.6 m ensign flaps about 5 times a second in 10 kt, 12 in 25 kt. (A check: the peak-to-peak Strouhal number 2A·f/U
 * comes to 0.21, inside the 0.2–0.4 flapping flags and swimming fish settle at.)
 *  - The wave travels from the hoist to the fly, growing all the way (none at the hoist, where it's held); two
 *    half-waves lie along the flag, so the wave runs at 0.55 U (c = f·λ, λ = L).
 *  - The cloth doesn't stretch, so what waves is the cloth's angle, and its shape is that angle summed along it: a swing
 *    of 0.19 L at the fly with two half-waves along it takes the cloth there round to near 90°, the fly's snap.
 *  - Real flapping is never a pure tone (the higher modes are quasi-periodic and chaotic in the same study): a second,
 *    weaker wave at an unrelated rate rides on it.
 *  - The cloth doesn't stretch: as it swings, its fly end is drawn back toward the hoist (flagRow).
 * In light air a flag hangs: the Beaufort scale's force 3 (7–10 kt, WMO) is the breeze that "extends light flags". Here
 * it starts to lift from 3 kt and streams fully from 8.
 * One limit is the screen's, not the flag's: a flap shown in fewer than about five frames looks like a flicker that
 * can't be followed (and at two, it seems to run backwards), so the drawn rate stops at a fifth of the frame rate. Past
 * that a hard breeze still shows, as it does on a real flag: its swing tightens and its fly snaps (Virot et al. 2013, the
 * flapping losing its rhythm at the highest speeds), in proportion to how far past it the wind is (a picture of it, not
 * a measurement).
 */

export const FLAG = {
  /** f·L/U, the flapping frequency against the wind and the flag's length (Chen et al. 2014, see above). */
  strouhal: 0.55,
  /** The cloth's greatest angle to the wind's line (rad), at the fly: it gives the fly end a swing of 0.19 L to each side (Chen et al. 2014). */
  angle: 1.5,
  /** Half-waves along the flag. */
  halfWaves: 2,
  /** The fastest flap drawn, in flaps per frame (a fifth: five frames to a flap). */
  perFrame: 0.2,
  /** The wind (m/s) where the flag starts to lift, and where it streams fully (3 and 8 kt; Beaufort force 3). */
  lift: 3 * 0.5144, stream: 8 * 0.5144,
};

/** How far the flag streams out of its droop (0 hanging … 1 streaming) in an apparent wind of `aws` m/s. */
export function flagExtension(aws: number): number {
  const k = Math.min(1, Math.max(0, (aws - FLAG.lift) / (FLAG.stream - FLAG.lift)));
  return k * k * (3 - 2 * k);
}

/** The flapping rate (Hz) of a flag `fly` metres long in an apparent wind of `aws` m/s. */
export const flagHz = (aws: number, fly: number): number => FLAG.strouhal * Math.max(0, aws) / fly;

/**
 * The rate to draw at a frame `dt` seconds long (no more than the screen can show), and how hard past that the wind is
 * (0 within it … 1 at twice it or more): it tightens the swing and sharpens the snap at the fly.
 */
export function flagDrawn(aws: number, fly: number, dt: number): { hz: number; snap: number } {
  const hz = flagHz(aws, fly), cap = dt > 0 ? FLAG.perFrame / dt : Infinity;
  return { hz: Math.min(hz, cap), snap: hz > cap ? Math.min(1, hz / cap - 1) : 0 };
}

/**
 * The cloth's angle to the wind's line (rad) at `u` along the flag (0 at the hoist, 1 at the fly), at flapping phase
 * `ph` (radians, advancing at 2π·hz), streaming `ext` (0..1), `snap` past the drawn rate.
 */
export function flagAngle(u: number, ph: number, ext: number, snap = 0): number {
  const kx = FLAG.halfWaves * Math.PI * u, w2 = 0.3 + 0.4 * snap;
  const s = Math.sin(kx - ph) + w2 * Math.sin(1.7 * kx - 1.37 * ph + 0.8);
  // the wave grows from nothing at the hoist (held there) to its full swing at the fly end (÷ the two waves' joint peak)
  return FLAG.angle * (1 - 0.35 * snap) * ext * u * s / (1 + w2);
}

/**
 * One row of the cloth along the fly, `n` + 1 points evenly spaced along it (it doesn't stretch): `xs` gets how far each
 * point lies downwind of the hoist, `zs` its sideways offset (m), for a flag `fly` metres long.
 */
export function flagRow(n: number, ph: number, fly: number, ext: number, snap: number, xs: Float64Array, zs: Float64Array): void {
  const ds = fly / n; xs[0] = 0; zs[0] = 0;
  for (let i = 1; i <= n; i++) {
    const th = flagAngle((i - 0.5) / n, ph, ext, snap);
    xs[i] = xs[i - 1] + ds * Math.cos(th); zs[i] = zs[i - 1] + ds * Math.sin(th);
  }
}

/**
 * Striking the ensign, or hoisting it: how far along it is (0 flying … 1 struck), stepped `dt` seconds toward `struck`.
 * The flag comes down its staff hand over hand in the first 3 s, then the staff is lifted out of its socket and goes
 * below (1 s); hoisting, the other way round. `slide` is how far down the staff the flag is (0..1), `out` how far the
 * staff is out of its socket (0..1).
 */
export function ensignStep(down: number, struck: boolean, dt: number): { down: number; slide: number; out: number } {
  const want = struck ? 1 : 0, d = want > down ? Math.min(want, down + dt / 4) : Math.max(want, down - dt / 4);
  return { down: d, slide: Math.min(1, d / 0.75), out: Math.max(0, (d - 0.75) / 0.25) };
}
