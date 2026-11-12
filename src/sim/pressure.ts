import { LOA, markDist } from '../core/math';
import type { Boat } from '../boat/boat';
import type { World } from './world';

/**
 * How much pressure a boat's crew are under now, 0 … 1 (CrewState.pressure; crewPhys.ts stressOf): the moments that rattle
 * a crew, where races are won and lost and mistakes are made. The last minute before the start, worst at the gun;
 * inside the three-length zone of a mark to be rounded (RRS 18's zone: the mark-room, the rounding and its sail
 * handling at once); another boat close (within two lengths: a cross, a luff, a call); and doing penalty turns. Under it
 * a crew react more slowly, work more clumsily and trim less well, as much as their composure lets it get to them; and
 * they fumble now and then (crewWork.ts, physics.ts crewPole). No study measures this for sailing crews (the
 * researchers found the choking literature, golf putting, and two sailing studies where tiredness didn't affect
 * decisions); the moments are the owner's and coaching's, the sizes estimates.
 */
export function crewPressure(w: World, b: Boat): number {
  // (not racing: in the marina, finished or retired)
  if (b.docked || b.finished || b.retired) return 0;
  let p = 0;
  if (w.t < 0 && w.t > -60) p = Math.max(p, 0.4 + 0.6 * (1 + w.t / 60)); // (the last minute, building to the gun)
  else if (w.t >= 0 && w.t < 15 && !w.freeSail) p = Math.max(p, 0.8); // (the start itself)
  const nm = w.freeSail ? null : w.nextMark(b);
  if (nm && nm.type === 'round' && markDist(b, nm) < 3 * LOA) p = Math.max(p, 0.8);
  // (and still in the zone of the mark she's just rounded: the bear-away, the pole going on)
  const last = w.freeSail || b.leg < 1 ? null : w.C.marks[b.leg - 1];
  if (last && last.type === 'round' && markDist(b, last) < 3 * LOA) p = Math.max(p, 0.8);
  for (const o of w.boats) {
    if (o === b || o.docked || o.finished || o.retired) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < 2 * LOA) p = Math.max(p, 0.7 * (1 - d / (2 * LOA)) + 0.3);
  }
  if (b.penalty > 0 && b.penaltyDir) p = Math.max(p, 0.8); // (turning them)
  return Math.min(1, p);
}
