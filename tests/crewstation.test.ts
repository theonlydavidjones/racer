import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { CourseFile } from '../src/courses/course';
import { atWinch } from '../src/boat/crewPhys';

/**
 * The crew keep their stations (the owner, 14 Nov 2026: "the fore/aft movement has been a key source of the jitteriness
 * of the crew"): two crew sit either side of the jib winch, the front hand between the cabin and the winch and the middle
 * hand between the winch and the thwart, and move forward of it together only when the weight's really wanted there,
 * and then for minutes, not a puff. A race of AI boats in the Bay's gusty westerly: each crew member's moves along the
 * boat (more than 0.3 m) while sailing, counted by the minute, jobs and the run's foredeck aside.
 */
export function stationMoves(kt: number) {
  // (two AI boats, as tests/helpers/crewsettle.ts sails them; yours, left unsteered, isn't counted)
  const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as never, 1);
  const ai = w.boats.filter(b => !b.isUser);
  // (a seat: no job, and in the cockpit or beside the cabin, z 0.88 and aft; the cabin top, the mast and the foredeck are
  // jobs and their trips. A new seat: the place they're making for moves more than 5 cm, from one seat to another)
  const prev = ai.map(b => b.crew!.people.map(() => NaN)), moves = ai.map(b => b.crew!.people.map(() => 0));
  const zWas = ai.map(b => b.crew!.people.map(a => a.z)), walked = ai.map(b => b.crew!.people.map(() => 0)), trips = ai.map(b => b.crew!.people.map(() => 0)), goalWas = ai.map(b => b.crew!.people.map(a => a.goal?.z ?? a.z));
  let secs = 0;
  while (w.t < 800) {
    w.step(DT);
    if (w.t < 0) continue;
    secs += DT;
    ai.forEach((b, k) => b.crew!.people.forEach((a, i) => {
      if (i === 0) return;
      walked[k][i] += Math.abs(a.z - zWas[k][i]); zWas[k][i] = a.z;
      const g = a.goal?.z ?? a.z; if (Math.abs(g - goalWas[k][i]) > 0.3) { trips[k][i]++; } goalWas[k][i] = g;
      const at = a.goal?.z ?? a.z, seat = !a.job && at >= 0.88 && !atWinch(at); // (the step in past the winch, on the way: not a seat)
      if (seat && !Number.isNaN(prev[k][i]) && Math.abs(at - prev[k][i]) > 0.05) moves[k][i]++;
      prev[k][i] = seat ? at : NaN;
    }));
  }
  const per = (a: number[][]) => ai.flatMap((_, k) => a[k].slice(1)).map(m => +(m / (secs / 60)).toFixed(2));
  return { seats: per(moves), trips: per(trips), walked: per(walked) };
}

describe('The crew keep their stations (crewPhys.ts stationZ, chooseFore)', () => {
  // (before the stations, on this race: the forward hand 1.5 trips and 3.1 m along the boat a minute in 12 kt, the other
  // crew 0.26 m, sliding along the cockpit; now 1.0 and 0.02, the forward hand's walking about the same, 2.4 to 3.0 m by
  // the race. That's their jobs: the cabin top, the mast, the run's foredeck; the seats no longer change)
  for (const kt of [12, 6]) it(`in ${kt} kt: no changes of seat, the other crew all but still, few trips`, () => {
    const m = stationMoves(kt);
    for (const s of m.seats) expect(s, 'changes of seat a minute').toBeLessThan(0.05);
    m.walked.forEach((x, j) => expect(x, `crew ${j % 2 + 1}: m along the boat a minute`).toBeLessThan(j % 2 === 0 ? 0.1 : 3.2));
    for (const t of m.trips) expect(t, 'trips a minute').toBeLessThan(1.2);
  }, 600_000);
});
