import { describe, expect, it } from 'vitest';
import { crewPoleCall } from '../src/ai/ai';
import { allToCrew } from '../src/boat/physics';
import type { World } from '../src/sim/world';
import { testBoat } from './helpers/testBoat';

// The crew's call on the whisker pole (ai.ts crewPoleCall): theirs on the AI boats, and on yours until you take it
// (the sail controls band's Pole tab), back with Auto-trim (owner, 12 Nov 2026).
const world = (t = 60) => ({ t, nextMark: () => null }) as unknown as World;

describe('The crew calls the whisker pole', () => {
  it('out running deep, in on a reach, with a gap between so they do not set and stow it over and over', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.twa = 165; crewPoleCall(world(), b); expect(b.poleWant).toBe(true);
    b.twa = 150; crewPoleCall(world(), b); expect(b.poleWant).toBe(true); // (inside the gap: stays as it was)
    b.twa = -140; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
    b.twa = -150; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
    b.twa = -160; crewPoleCall(world(), b); expect(b.poleWant).toBe(true); // (port tack: the same, by the angle's size)
  });
  it('never before the start, nor with the jib down', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.twa = 170; crewPoleCall(world(-30), b); expect(b.poleWant).toBe(false);
    b.rig = { main: 1, jib: 0, mainUp: true, jibUp: false }; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
  });
  it('Auto-trim hands the pole back to the crew', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.poleMine = true; allToCrew(b); expect(b.poleMine).toBe(false);
  });
});
