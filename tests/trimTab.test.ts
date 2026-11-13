import { describe, expect, it } from 'vitest';
import { testBoat } from './helpers/testBoat';
import { trimTab } from '../src/ui/sailBand';
import { allToCrew } from '../src/boat/physics';
import type { Boat } from '../src/boat/boat';

describe('The band\'s trim tab (the owner: "Auto-Trim" when it\'s all auto trim, "Hand Back" when 1 or more lines are manual)', () => {
  it('reads Auto-Trim while the crew has every line', () => {
    const b = testBoat({ heading: 0, kt: 4 }); allToCrew(b);
    expect(trimTab(b)).toBe('Auto-Trim');
  });
  it('reads Hand Back once any one line is yours: a sheet, a car, or the whisker pole; and Auto-Trim again once handed back', () => {
    const takes: ((b: Boat) => void)[] = [b => { b.hand = { vang: true }; }, b => { b.hand = { car: true }; }, b => { b.poleMine = true; }];
    for (const take of takes) {
      const b = testBoat({ heading: 0, kt: 4 }); allToCrew(b); take(b);
      expect(trimTab(b)).toBe('Hand Back');
      allToCrew(b);
      expect(trimTab(b)).toBe('Auto-Trim');
    }
  });
});
