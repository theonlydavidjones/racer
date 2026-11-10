import { beatFor, targetFor } from '../boat/seaway';
import { polar, runAngle } from '../boat/polar';
import type { Boat } from '../boat/boat';
import { V, brg, unit, wrap, type Vec } from '../core/math';
import type { CourseMark } from '../courses/course';
import type { World } from './world';

export interface Laylines {
  mark: CourseMark;
  kind: 'up' | 'down';
  /** Unit ground-track directions that arrive at the mark, one per tack (starboard first).
   * The layline itself runs from the mark back along −dir. */
  tracks: [Vec, Vec];
}

/** The mark a boat should be thinking about: before her start, the first mark. */
export function targetMark(w: World, b: Boat): CourseMark | null {
  if (b.finished) return null;
  if (!b.started && !w.freeSail) return w.C.marks[0] ?? null;
  return w.nextMark(b);
}

/**
 * Laylines to the boat's target mark: the close-hauled tracks that just fetch it on a beat, or the
 * best-VMG downwind tracks on a run. Uses the wind on the water at the boat and the current at the
 * mark, so the lines bend with the tide like a sailor's.
 */
export function laylinesFor(w: World, b: Boat): Laylines | null {
  const m = targetMark(w, b);
  if (!m || m.type !== 'round') return null;
  const ww = b.ww, c = w.currentAt(m.p);
  // a Just Sail destination: a beat or a run depending on where you are now
  const off = Math.abs(wrap(ww.from - brg(m.p.x - b.x, m.p.y - b.y)));
  const leg = m.key === 'dest' ? (off < 55 ? 'beat' : off > 125 ? 'run' : 'reach') : m.leg;
  if (leg === 'reach') return null;
  const up = leg === 'beat', ang = up ? beatFor(b) : runAngle(ww.kt), vs = up ? targetFor(b, ang) : polar(ww.kt, ang); // upwind: the best angle in the chop she's in
  const track = (h: number) => { const u = V(h); return unit({ x: u.x * vs + c.x, y: u.y * vs + c.y }); };
  // starboard tack: wind over the starboard side, heading = from − angle
  return { mark: m, kind: up ? 'up' : 'down', tracks: [track(ww.from - ang), track(ww.from + ang)] };
}
