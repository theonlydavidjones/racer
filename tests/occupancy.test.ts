import { describe, expect, it } from 'vitest';
import { mooredIn, slipTaken, slipsIn, HARBORS } from '../src/geo/marina';

/** Which slips have a boat in them: chosen once in geo/marina.ts, for the sim (berthing) and the drawing alike. */
describe('slip occupancy', () => {
  it('the SF Marina about 87% full (Latitude 38, 2024), elsewhere about 78%; the same boats every time', () => {
    const share = (id: string) => slipsIn(id).filter(slipTaken).length / slipsIn(id).length;
    expect(share('west-harbor')).toBeGreaterThan(0.8); expect(share('west-harbor')).toBeLessThan(0.94);
    for (const H of HARBORS) if (slipsIn(H.id).length > 40 && !['west-harbor', 'gashouse-cove'].includes(H.id)) { expect(share(H.id)).toBeGreaterThan(0.65); expect(share(H.id)).toBeLessThan(0.9); }
    expect(mooredIn('west-harbor')).toBe(mooredIn('west-harbor')); // (worked out once)
    expect(mooredIn('west-harbor').map(b => b.slip.id).slice(0, 5)).toEqual(mooredIn('west-harbor').map(b => b.slip.id).slice(0, 5));
  });
  it('every harbor with slips has some empty ones to berth in', () => {
    for (const H of HARBORS) { const s = slipsIn(H.id); if (s.length > 10) expect(s.some(x => !slipTaken(x))).toBe(true); }
  });
});
