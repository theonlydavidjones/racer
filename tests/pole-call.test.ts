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
