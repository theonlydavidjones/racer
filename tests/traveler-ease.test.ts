import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import type { Boat } from '../src/boat/boat';

/** Close-hauled in `kt`, the crew settled; then your mainsheet, eased by `ease` (0..1, 1 all the way), for 30 s. */
function easedIn(kt: number, ease: number): { before: number; after: number } {
  const b = testBoat({ heading: 360 - 42, kt: 4.5, windKt: kt }) as Boat;
  sail(b, 40);
  const before = b.ctl.traveller;
  b.hand = { ...(b.hand ?? {}), mainsheet: true }; b.ctl.mainsheet = Math.min(1, b.ctl.mainsheet + ease);
  sail(b, 30);
  return { before, after: b.ctl.traveller };
}

describe('The traveler, with your mainsheet in your hand (North Sails Folkboat guide: the car in the middle to 14 kt, eased to leeward above)', () => {
  it('in a breeze, ease the sheet and the crew don\'t haul the car to windward against you', () => {
    for (const kt of [15, 18]) {
      const r = easedIn(kt, 0.3);
      expect(r.after, `${kt} kt: from ${r.before.toFixed(2)}`).toBeGreaterThanOrEqual(Math.min(r.before, 0) - 0.02); // (−1 windward … +1 leeward)
    }
  });
  it('in a moderate breeze they keep it no further up than the middle', () => {
    expect(easedIn(10, 0.3).after).toBeGreaterThanOrEqual(-0.02);
  });
  it('in light air they may still bring it up to windward for your eased sheet (the guide: 15–20 cm up below 6 kt)', () => {
    const r = easedIn(4, 0.2);
    expect(r.after).toBeLessThanOrEqual(r.before + 0.02);
  });
});
