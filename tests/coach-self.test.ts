// The coach's estimate of the boat as she is, is the speed she sails at (coach.ts speedFactor, `now`)
import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { speedFactor } from '../src/boat/coach';
import { polar } from '../src/boat/polar';
import type { Boat } from '../src/boat/boat';

const hold = (b: Boat, t: number) => { const h = b.h; sail(b, t, () => { b.h = h; }); };

describe('the trim coach: its estimate of her as she is', () => {
  // Every gain the coach promises is a ratio against this estimate, so an error here is an error in the promise. Heeled
  // well past her best in 20 kt, with a line set wrong, the coach turned her drive into speed from the upright polar
  // speed where the step does it from the heeled hull's (physics.ts: vB, speedForDrive): near hull speed the
  // resistance's slope changes within a few cm/s, and the estimate sat 0.08–0.10% off (measured on main, 16 Nov 2026),
  // against promises of half a percent. Settled, it is now within 0.05% in each case (0.03% is its standing offset in every wind).
  it('is her settled speed to 0.05%, close-hauled in 20 kt with a line set wrong', () => {
    for (const [k, v] of [['outhaul', 0], ['backstay', 0], ['vang', 1]] as const) {
      const b = testBoat({ heading: 316, kt: 5, windKt: 20 }); sail(b, 30, () => { b.h = courseHeading(b, 316); });
      takeLine(b, k); (b.ctlTarget ??= {})[k] = v; hold(b, 90);
      const est = speedFactor(b, b.ctl, true) * Math.max(0.5, polar(20, Math.min(180, b.twa + (b.leeway ?? 0))));
      expect(Math.abs(est / b.v - 1), `${k} at ${v}: she sails ${b.v.toFixed(4)} m/s, the coach has her at ${est.toFixed(4)}`).toBeLessThan(0.0005);
    }
  });
});
