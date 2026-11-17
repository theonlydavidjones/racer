import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { crewHeading, startThreshold } from '../src/boat/crewWork';
import { testBoat } from './helpers/testBoat';

// Where the crew are taking a line, by their own decisions (crewWork.ts crewHeading), which the trim coach judges a fix
// against (coach.ts withCrew): not this moment's plan, which swings with each puff.
describe('Where the crew are taking a line (crewWork.ts crewHeading)', () => {
  const fresh = () => { const b = testBoat({ heading: 312, kt: 5, windKt: 18 }); b.crew = newCrew(DEFAULT_CREW, 'S'); b.ctl.vang = 0.9; return b; };
  it('a job under way: the setting they are making', () => {
    const b = fresh(); b.crew!.people[2].job = { line: 'vang', reach: 0, work: 0, station: null, to: 0.3 } as never;
    expect(crewHeading(b, 'vang')).toBe(0.3);
  });
  it('a line they mean to set, their lasting wish well off it and a real change: that wish', () => {
    // (off by one and a half of their threshold: not a big change, set to the 20 s wish)
    const b = fresh(), th = startThreshold('vang', 0.6, 0.8), lw = 0.9 - 1.5 * th;
    b.crew!.lineWant = { vang: lw }; b.crew!.lineSlow = { vang: 0.3 }; b.crewPlan = { vang: 0.9 - 1.6 * th } as never; b.crewWorth = { vang: 1 } as never;
    expect(crewHeading(b, 'vang')).toBe(lw);
  });
  it('a line they set a moment ago, their wish barely moved since: where it is (undefined)', () => {
    const b = fresh(), c = b.crew!, near = 0.9 - 1.5 * startThreshold('vang', 0.6, 0.9);
    c.lineSet = { vang: 0 }; c.lineTwa = { vang: b.twa ?? 0 }; c.lineRef = { vang: 0.9 }; c.lineWant = { vang: near }; c.lineSlow = { vang: 0.9 };
    expect(crewHeading(b, 'vang')).toBeUndefined();
  });
  it('just after a puff: the 20 s wish still well off, this moment\'s back at the line: where it is (undefined)', () => {
    const b = fresh(); b.crew!.lineWant = { vang: 0.3 }; b.crew!.lineSlow = { vang: 0.3 };
    b.crewPlan = { vang: 0.9 } as never; b.crewWorth = { vang: 1 } as never; // (the plan's vang back where the line is)
    expect(crewHeading(b, 'vang')).toBeUndefined();
  });
  it('a big change, both wishes well off: set right through to this moment\'s', () => {
    const b = fresh(); b.crew!.lineWant = { vang: 0.5 }; b.crew!.lineSlow = { vang: 0.5 };
    b.crewPlan = { vang: 0.2 } as never; b.crewWorth = { vang: 1 } as never;
    expect(crewHeading(b, 'vang')).toBe(0.2);
  });
  it('a crew placed by you: a line they wait on for a big change stays where it is', () => {
    const b = fresh(), c = b.crew!; c.place = { across: 'hike', fore: null } as never; b.ctl.cunningham = 0.5; c.lineWant = { cunningham: 0.6 }; c.lineSlow = { cunningham: 0.6 };
    expect(crewHeading(b, 'cunningham')).toBeUndefined();
  });
});
