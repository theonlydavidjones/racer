import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_CREW, Z, atWinch, newCrew, type CrewPlace, type CrewSpec } from '../src/boat/crewPhys';
import { testBoat, sail } from './helpers/testBoat';
import { ownerOf } from '../src/boat/crewWork';
import { beatAngle } from '../src/boat/polar';

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
      const g = a.goal?.z ?? a.z; if (Math.abs(g - goalWas[k][i]) > 0.3) { trips[k][i]++; } goalWas[k][i] = g;
      const at = a.goal?.z ?? a.z, seat = !a.job && at >= 0.88 && !atWinch(at); // (the step in past the winch, on the way: not a seat)
      if (seat && !Number.isNaN(prev[k][i]) && Math.abs(at - prev[k][i]) > 0.05) moves[k][i]++;
      // (along the boat while their place is a seat: a job's trip, the mast and the run's foredeck aside)
      if (seat && a.z >= 0.88) walked[k][i] += Math.abs(a.z - zWas[k][i]);
      zWas[k][i] = a.z;
      prev[k][i] = seat ? at : NaN;
    }));
  }
  const per = (a: number[][]) => ai.flatMap((_, k) => a[k].slice(1)).map(m => +(m / (secs / 60)).toFixed(2));
  return { seats: per(moves), trips: per(trips), walked: per(walked) };
}

describe('The crew keep their stations (crewPhys.ts stationZ, chooseFore)', () => {
  // (on this race, before the stations (claude/crew-winch-seats) and now, a minute: changes of seat 0 and 0; the forward
  // hand's trips 1.5 and 1.27 in 12 kt, the other crew's 0.07 and 0; along the boat while at a seat, a few centimetres to
  // 0.3 m, a little more now in light air, where both go forward of the winch once it's paid for two minutes. Trips are jobs: the cabin
  // top, the mast, the run's foredeck)
  for (const kt of [12, 6]) it(`in ${kt} kt: no changes of seat, few trips, little walking at the seats`, () => {
    const m = stationMoves(kt);
    // (one a race at most: in light air, both forward of the winch once it's paid for two minutes, and back)
    for (const s of m.seats) expect(s, 'changes of seat a minute').toBeLessThan(0.1);
    m.walked.forEach(x => expect(x, 'm along the boat a minute, at a seat').toBeLessThan(0.4));
    m.trips.forEach((t, j) => expect(t, `crew ${j % 2 + 1}: trips a minute`).toBeLessThan(j % 2 === 0 ? 0.1 : 1.4));
  }, 600_000);
});

describe('Forward of the winch, both crew (crewPhys.ts stationZ, chooseFore)', () => {
  const crewOf = (skill: number): CrewSpec => ({ helm: { ...DEFAULT_CREW.helm, skill }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill })) });
  // (a puffy breeze, as the Bay's: the arms cross the deck's edge with the puffs)
  const beat = (kt: number, secs: number, place?: CrewPlace, skill = 0.9) => {
    const twa = beatAngle(kt), b = testBoat({ heading: 360 - twa, kt: 3, windKt: kt }); b.crew = newCrew(crewOf(skill), 'S'); if (place) b.crew.place = place;
    const seats: number[][] = [[], []]; let inside = 0;
    sail(b, secs, t => { b.h = 360 - twa; b.ww = { ...b.ww, kt: kt + 1.5 * Math.sin(t * 2 * Math.PI / 30) };
      b.crew!.people.slice(1).forEach((a, j) => { const g = a.goal?.z ?? a.z; if (!a.job && !atWinch(g) && !seats[j].includes(+g.toFixed(2))) seats[j].push(+g.toFixed(2));
        // (settled at their place, not on the way: the walk round the winch and up beside the cabin are a trip's)
        if (a.z < 1.06 && Math.abs(a.x) < 0.5 && Math.abs(a.z - g) < 0.02) inside++; }); });
    return { b, seats, inside };
  };
  for (const kt of [5, 9]) it(`placed forward in ${kt} kt: the front hand on the cabin top's edge, never inside the cabin, and they stay put`, () => {
    const { b, seats, inside } = beat(kt, 240, { across: null, fore: 'fwd' });
    expect(inside, 'steps with the front hand inside the cabin').toBe(0);
    expect(b.crew!.people[1].z).toBeCloseTo(Z.cabinSide, 1); expect(b.crew!.people[2].z).toBeCloseTo(Z.deckFwd, 1);
    for (const s of seats) expect(s.length, `seats taken: ${s}`).toBeLessThanOrEqual(2); // (where they start, and there)
  }, 120_000);
  it('on their own: forward of the winch after minutes of light air upwind, never in a breeze', () => {
    expect(beat(5, 300).b.crew!.fore01).toBe(1);
    expect(beat(16, 300).b.crew!.fore01).toBe(0);
  }, 120_000);
  it('forward of the winch, the helm takes the main (the owner): its sheet comes to the thwart behind them', () => {
    expect(ownerOf('mainsheet', 2, DEFAULT_CREW, 'cockpit', true)).toBe(0);
    expect(ownerOf('jibsheet', 2, DEFAULT_CREW, 'cockpit', true)).toBe(2);
    const { b } = beat(5, 300), c = b.crew!;
    expect(c.fore01).toBe(1);
    // (no crew holding the mainsheet from up forward, and the main still trimmed: the helm has it)
    expect(c.people.slice(1).some(p => p.job?.line === 'mainsheet')).toBe(false);
    expect(Math.abs(b.ctl.mainsheet - (b.ctlTarget?.mainsheet ?? b.ctl.mainsheet))).toBeLessThan(0.05);
  }, 120_000);
});

