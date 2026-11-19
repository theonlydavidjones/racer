import { polar, beatAngle, runAngle } from '../boat/polar';
import { wrap, type Vec } from '../core/math';
import { landAt } from '../environment/sea';
import { tideLeg } from '../environment/tideLeg';

/**
 * The coach's word on a leg into a foul tide (the owner's race, 18 Nov 2026: Course 2 into a 2.4 kt ebb, the fleet
 * out in mid-stream): where an inshore track, where the stream is weaker, saves real time, one line, once a leg.
 * environment/tideLeg.ts does the sums (about 2 ms a call: call it once a leg, not a frame); this gives it the boat's
 * speed along any heading in the wind as it is, and words the answer.
 */
export interface TideEnv { currentAt(p: Vec): Vec; windHere(p: Vec): { from: number; kt: number } }
/** The least saving worth a word: under this a track's just a different way to go. */
export const TIDE_SAVING_S = 120;

/** Her speed made good along heading h (deg, true), m/s: her polar there; closer to the wind than she can sail, her
 *  best beat's speed made good toward h; deeper than her best run, her best run's likewise (tideLeg.ts's `speed`). */
export function speedAlong(kt: number, from: number, h: number): number {
  const a = Math.abs(wrap(h - from)), b = beatAngle(kt), r = runAngle(kt), rad = Math.PI / 180;
  if (a < b) return polar(kt, b) * Math.cos(b * rad) / Math.cos(a * rad);
  if (a > r) return polar(kt, r) * Math.cos((180 - r) * rad) / Math.cos((180 - a) * rad);
  return polar(kt, a);
}

/** Is the best track's side (offset `off`, + to starboard of from→to) the side with the nearer shore? The first land met
 *  walking out from the leg's middle each way, to 3 km. */
function shoreward(from: Vec, to: Vec, off: number): boolean {
  const L = Math.hypot(to.x - from.x, to.y - from.y), nx = (to.y - from.y) / L, ny = -(to.x - from.x) / L, mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const reach = (sgn: number): number => { for (let d = 50; d <= 3000; d += 50) if (landAt({ x: mx + sgn * nx * d, y: my + sgn * ny * d })) return d; return Infinity; };
  const side = Math.sign(off), here = reach(side), other = reach(-side);
  return here < other;
}

/** The line to say for the leg from `from` to `to`, or null: the tide must be against her down the leg, and the best
 *  track inshore of the rhumb line save at least TIDE_SAVING_S. */
export function tideLine(from: Vec, to: Vec, env: TideEnv): string | null {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, c = env.currentAt(mid);
  const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy);
  if (L < 300 || (c.x * dx + c.y * dy) / L >= -0.3) return null; // (a short leg, or the tide not clearly foul: a knot's worth is 0.5 m/s)
  const wind = env.windHere(mid);
  const r = tideLeg(from, to, p => env.currentAt(p), h => speedAlong(wind.kt, wind.from, h), p => !landAt(p));
  if (!Number.isFinite(r.rhumb) || r.off === 0 || r.saved < TIDE_SAVING_S) return null;
  if (!shoreward(from, to, r.off)) return null; // (a saving from standing out into the stream isn't "inshore": no word)
  // (dead downwind into the stream mid-channel she may barely stem it: the rhumb line's time is then hours, so say "over half an hour")
  return r.saved > 1800 ? 'Foul tide: stay inshore on this leg, it saves over half an hour.' : `Foul tide: stay inshore on this leg, it saves about ${Math.round(r.saved / 60)} min.`;
}
