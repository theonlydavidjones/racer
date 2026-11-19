import { brg, hypot, type Vec } from '../core/math';

/**
 * Cheating the tide: how long a leg takes sailed along a track stood off to one side of the rhumb line, against the
 * rhumb line itself, in the current as it is. The Cityfront on an ebb is the case (the owner's race, 18 Nov 2026,
 * Course 2: the fleet ran east into 2.4 kt in mid-stream and took twice the real fleet's time, which can only have
 * gone inshore, where the stream is weaker: environment/current.ts shoreRelief, an estimate).
 *
 * Each track: from the start, out to the offset line by 15% of the way along the leg, along it, and back in to the mark
 * over the last 15% (or each fraction in `backs`: 0 stays on the offset line until abeam of the mark and crosses
 * straight to it, as a boat working the beach does before she crosses the stream to a mark out in it; Skipper Model). Each piece is sailed in steps of `step` m: in the current at the step's middle, the boat holds
 * her course over the ground along the piece by steering up into the cross-current (she makes good
 * √(v² − c⊥²) + c∥ along it, v her speed through the water); a cross-current as fast as she sails, or a foul one she
 * can't stem, and that track can't be sailed. A step on land, and that track's out.
 *
 * `speed(h)`: her speed made good through the water along heading h (deg), m/s: her polar speed there, or, for a
 * heading closer to the wind than she can sail, her best beat's speed made good toward it (polar VMG / cos of the angle
 * off the beat), and the same deep downwind. The caller has the polar and the wind; this has only the water.
 *
 * The current is one moment's (`cur`): over a 15–30 minute leg near the ebb's peak it changes by a tenth or so (NOAA
 * SFB1204 on 7 Nov 2026: 2.38 kt at 13:35, 2.21 at 14:30). For a leg sailed as the tide turns, pass the current at the
 * middle of her time on it.
 *
 * Cost: one cur, one wet and one speed call for each `step` along each track: 13 tracks of a 1.2 km leg at 50 m are
 * about 330 of each. Meant for a fresh plan every few seconds, not every step.
 */
export interface TideLeg {
  /** The best track's offset (m, + to starboard of the rhumb line from `from` to `to`), 0 when the rhumb line is best. */
  off: number;
  /** Its time (s), and the rhumb line's (Infinity where it can't be sailed). */
  time: number; rhumb: number;
  /** The rhumb line's time less the best track's (s). */
  saved: number;
  /** The best track's corners: from, the two on the offset line, to. */
  path: Vec[];
}
export const TIDE_LEG_OFFSETS = [-600, -500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500, 600];

export function tideLeg(from: Vec, to: Vec, cur: (p: Vec) => Vec, speed: (h: number) => number, wet: (p: Vec) => boolean,
  offsets: readonly number[] = TIDE_LEG_OFFSETS, step = 50, backs: readonly number[] = [0.15]): TideLeg {
  const L = hypot(to.x - from.x, to.y - from.y);
  if (L < 1) return { off: 0, time: 0, rhumb: 0, saved: 0, path: [from, to] };
  const ux = (to.x - from.x) / L, uy = (to.y - from.y) / L, nx = uy, ny = -ux; // (starboard of the leg's direction)
  const piece = (a: Vec, b: Vec): number => {
    const l = hypot(b.x - a.x, b.y - a.y); if (l < 1e-6) return 0;
    const sx = (b.x - a.x) / l, sy = (b.y - a.y) / l, v = speed(brg(sx, sy)), n = Math.max(1, Math.ceil(l / step)), dl = l / n;
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      if (!wet(p)) return Infinity;
      const c = cur(p), along = c.x * sx + c.y * sy, across = c.x * sy - c.y * sx;
      if (Math.abs(across) >= v) return Infinity;
      const made = Math.sqrt(v * v - across * across) + along;
      if (!(made > 0.05)) return Infinity;
      t += dl / made;
    }
    return t;
  };
  let best: TideLeg | null = null, rhumb = Infinity;
  for (const d of offsets) for (const f of d === 0 ? [0] : backs) {
    const path = d === 0 ? [from, to] : [from, { x: from.x + ux * 0.15 * L + nx * d, y: from.y + uy * 0.15 * L + ny * d }, { x: to.x - ux * f * L + nx * d, y: to.y - uy * f * L + ny * d }, to];
    let time = 0; for (let i = 1; i < path.length && time < Infinity; i++) time += piece(path[i - 1], path[i]);
    if (d === 0) rhumb = time;
    if (!best || time < best.time) best = { off: d, time, rhumb: 0, saved: 0, path };
  }
  best!.rhumb = rhumb; best!.saved = rhumb - best!.time;
  return best!;
}
