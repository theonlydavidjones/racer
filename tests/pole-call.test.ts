import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { crewPoleCall } from '../src/ai/ai';
import type { World } from '../src/sim/world';

// The AI crews' call on the whisker pole (ai.ts crewPoleCall): once the run's settled, not as her course crosses it.
const crew = () => newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)), 'S');
const world = () => ({ t: 0, nextMark: () => null }) as unknown as World;

describe('The AI crew\'s pole call (ai.ts crewPoleCall)', () => {
  it('swinging slowly round through the run in 6 kt: the pole is never called for', () => {
    // (a circle at 4°/s, as a penalty turned slowly or a course wandering round: before, the pole was called each time
    // she passed 157° and dropped below 150°, a set and a stow, four trips, crewstation's 6 kt seed 21)
    const b = testBoat({ heading: 315, kt: 3, windKt: 6 }); b.crew = crew(); const w = world();
    let h = 315, calls = 0, was = false;
    sail(b, 240, t => {
      if (t > 30) { h = (h + 4 / 60) % 360; b.h = h; b.desired = h; }
      (w as { t: number }).t = t; crewPoleCall(w, b);
      if (b.poleWant && !was) calls++; was = !!b.poleWant;
    });
    expect(calls, 'pole calls while circling').toBe(0);
  });
  it('a circle too slow to be a swing (2.5°/s), through the run: the pole is never called for either', () => {
    // (under about 3°/s she's not swinging, Boat.settle's since, and is past 157° some 18 s unbroken: her heading's
    // turned more than POLE_TURN by then, the physics review)
    const b = testBoat({ heading: 315, kt: 3, windKt: 6 }); b.crew = crew(); const w = world();
    let h = 315, calls = 0, was = false;
    sail(b, 300, t => {
      if (t > 30) { h = (h + 2.5 / 60) % 360; b.h = h; b.desired = h; }
      (w as { t: number }).t = t; crewPoleCall(w, b);
      if (b.poleWant && !was) calls++; was = !!b.poleWant;
    });
    expect(calls, 'pole calls while circling').toBe(0);
  });
  it('a bear-away deep onto the run, and a gybe in the first seconds past 157°: the pole goes out on the course she holds', () => {
    // (her heading's mark for the slow-circle check taken where she crossed 157°: a bear-away to 175° or a gybe in the
    // hold took her past it for good, and the pole stayed in for the leg, the physics review)
    // (the wind from 0°: her heading is her true wind angle to 180°, and 195° is 165° on the other gybe)
    for (const [to, what] of [[178, 'a deep run'], [195, 'gybed 38° on from where she crossed 157°']] as const) {
      const b = testBoat({ heading: 90, kt: 3, windKt: 6 }); b.crew = crew(); const w = world();
      let h = 90, at: number | null = null;
      sail(b, 90, t => {
        if (t > 10) h = Math.min(to, h + 6 / 60);
        b.h = h; b.desired = h; (w as { t: number }).t = t; crewPoleCall(w, b);
        if (b.poleWant && at == null) at = t;
      });
      expect(at, `the pole out on ${what}`).not.toBeNull();
    }
  });
  it('a run held: the pole is called for within a quarter of a minute, and a 3 s luff to 148° doesn\'t take it in', () => {
    const b = testBoat({ heading: 180 - 15, kt: 3, windKt: 6 }); b.crew = crew(); const w = world();
    let at: number | null = null, stowed = false;
    sail(b, 90, t => {
      b.h = t > 60 && t < 63 ? 148 : 165; b.desired = b.h; (w as { t: number }).t = t; crewPoleCall(w, b);
      if (b.poleWant && at == null) at = t;
      if (at != null && t > 60 && t < 70 && !b.poleWant) stowed = true;
    });
    expect(at, 'called for on the run').not.toBeNull(); expect(at!).toBeLessThan(15);
    expect(stowed, 'stowed for a 3 s luff').toBe(false);
  });
});
