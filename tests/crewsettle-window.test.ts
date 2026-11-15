import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { DT } from '../src/sim/world';
import { SETTLE_S, spinOf, turning } from './helpers/crewsettle';
import { testBoat } from './helpers/testBoat';

// The settled-crew watch (tests/helpers/crewsettle.ts): what starts it over, and that a real spin still counts.
describe('The settled-crew watch: pole work starts it over; a spin still fails', () => {
  const boat = () => { const b = testBoat({ heading: 0, kt: 5, windKt: 12 }); b.crew = newCrew(DEFAULT_CREW, 'S'); return b; };
  it('a tack, or the pole being worked, starts the watch over; steady sailing does not', () => {
    const b = boat();
    expect(turning(b)).toBe(false);
    b.crew!.people[2]!.job = { line: 'pole', reach: 0, work: 2, station: null };
    expect(turning(b), 'the pole coming down').toBe(true);
    b.crew!.people[2]!.job = { line: 'jibsheet', reach: 0, work: 0, station: null };
    expect(turning(b), 'a sheet: not').toBe(false);
    b.tacking = true; expect(turning(b)).toBe(true);
    expect(SETTLE_S).toBe(10);
  });
  // (a figure's heading, sample by sample: so many degrees a second for so long)
  const yaws = (parts: [number, number][]) => { const out: number[] = []; let y = 0; for (const [degS, s] of parts) for (let i = 0; i < s / DT; i++) out.push(y += degS * Math.PI / 180 * DT); return out; };
  it('a whole turn with no pole job, as the owner saw, is over the bound', () => {
    expect(spinOf(yaws([[120, 3]]))).toBeGreaterThan(270); // (360° in 3 s)
    expect(spinOf(yaws([[0, 1], [180, 1.6], [0, 2]]))).toBeGreaterThan(270); // (288° in 1.6 s, steady either side)
  });
  it('turning round to walk aft along the deck, half a circle, is under it', () => {
    expect(spinOf(yaws([[180, 1], [0, 3]]))).toBeLessThan(270);
  });
});
