import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import type { Boat } from '../src/boat/boat';

/** Close-hauled in `kt`, the crew settled; then your mainsheet held and moved by each of `moves` in turn (+ eases,
 * − trims), 25 s each: the car's position (−1 windward … +1 leeward) before, and after each move. */
function sheetWork(kt: number, moves: number[]): { before: number; after: number[] } {
  const b = testBoat({ heading: 360 - 42, kt: 4.5, windKt: kt }) as Boat;
  sail(b, 40);
  const before = b.ctl.traveller, start = b.ctl.mainsheet, after: number[] = [];
  b.hand = { ...(b.hand ?? {}), mainsheet: true };
  for (const m of moves) { b.ctl.mainsheet = Math.min(1, Math.max(0, start + m)); sail(b, 25); after.push(b.ctl.traveller); }
  return { before, after };
}

describe('The traveler with your mainsheet in your hand: the boom is yours, the car stays where it was set for the wind', () => {
  it('ease the sheet, then trim back: the crew neither haul the car up nor drop it down (in light air, a moderate breeze and a breeze)', () => {
    for (const kt of [4, 10, 15, 18, 22]) {
      const r = sheetWork(kt, [0.3, 0]);
      // (the car stays where it was set for the wind: on main, easing took it to −1)
      for (const a of r.after) expect(Math.abs(a - r.before), `${kt} kt: ${r.before.toFixed(2)} → ${r.after.map(x => x.toFixed(2)).join(', ')}`).toBeLessThan(0.02);
    }
  });
  it('trim harder in a moderate breeze: the car isn\'t dropped to leeward to undo it (the guide: the middle, 6–14 kt)', () => {
    for (const kt of [8, 12]) {
      const r = sheetWork(kt, [-0.15]);
      expect(Math.abs(r.after[0]), `${kt} kt`).toBeLessThan(0.15);
    }
  });
});
