import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt } from './helpers/testBoat';
import { KT, wrap } from '../src/core/math';
import { allToCrew, takeLine } from '../src/boat/physics';

// The owner (ROADMAP 8d): "when I heave the boat to, resetting it to auto crew and auto tune should keep her hove to".
// A crew told "we're hove to" keep the jib backed to windward, the main eased and the tiller lashed to leeward; only the
// helm sails her off again, by letting the lashing go (physics.ts trimSails, keepHove).

/** Hove to on starboard in `windKt`, as tests/heaveto.test.ts heaves her to: the windward sheet hauled, the main eased,
 * the tiller lashed to leeward, two minutes to settle. */
function hoveTo(windKt: number) {
  const b = testBoat({ heading: 318, kt: 4.5, windKt });
  sail(b, 30, () => { b.h = 318 + (b.leeway ?? 0); });
  takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0;
  takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0.55;
  sail(b, 20);
  b.lashed = -0.7;
  sail(b, 120);
  return b;
}

describe('hove to, Auto keeps her hove to', () => {
  for (const W of [10, 18])
    it(`in ${W} kt: every line back to the crew and the crew's place to Auto, and she lies hove to for two minutes`, () => {
      const b = hoveTo(W);
      expect(b.hove).toBe(true);
      const before = { main: b.ctl.mainsheet, w: b.ctl.jibsheetW };
      allToCrew(b); if (b.crew) b.crew.place = undefined; // (Auto-trim and the crew's Auto)
      let lo = 999, hi = -999, u = 0, n = 0, unbacked = 0;
      sail(b, 120, () => {
        const a = Math.abs(wrap(b.ww.from - b.h)); lo = Math.min(lo, a); hi = Math.max(hi, a); u += b.v; n++;
        if (!b.hove || !((b.jibBacked ?? 0) > 0)) unbacked++;
      });
      expect(unbacked, 'steps with the jib not backed, or not hove to').toBe(0);
      expect(hi - lo, 'her heading swing, deg').toBeLessThan(30);
      expect(lo, 'never up head to wind').toBeGreaterThan(30); expect(hi, 'never off on a reach').toBeLessThan(80);
      expect(u / n / KT, 'forereaching, kn').toBeLessThan(2);
      // (the crew left the hove-to set where it was: the windward sheet made fast, the main where it was eased)
      expect(b.ctl.jibsheetW).toBeCloseTo(before.w, 2); expect(b.ctl.mainsheet).toBeCloseTo(before.main, 2);
    }, 180_000);

  it('taken through the wind while the crew hold her hove to (a big shift), the made-fast sheet is the leeward one: the jib fills, not backed again', () => {
    const b = hoveTo(14);
    allToCrew(b); if (b.crew) b.crew.place = undefined;
    sail(b, 20);
    const made = b.ctl.jibsheetW, tack = b.tack;
    b.ww.from = (b.ww.from + 270) % 360; // (the wind backs 90 degrees: it's on her other side now)
    // (the crew take a couple of seconds to settle the sheets on the new side; from then the made-fast sheet holds, the
    // jib filling on it, until they ease it for the course she bears away onto, at about six seconds: so it's held
    // through the window between, not sampled at one moment after it)
    sail(b, 2.5);
    expect(b.tack).not.toBe(tack);
    sail(b, 2.5, () => {
      expect(b.ctl.jibsheet, 'the sheet that was made fast, leeward now').toBeCloseTo(made, 2);
      expect(b.jibBacked).toBe(0);
    });
    sail(b, 1);
    expect(b.jibBacked).toBe(0); expect(b.hove).toBe(false);
  }, 180_000);
  it('then let the lashing go and steer off: the crew let the windward sheet fly, and she sails', () => {
    const b = hoveTo(15);
    allToCrew(b); if (b.crew) b.crew.place = undefined;
    sail(b, 30);
    expect(b.hove).toBe(true);
    b.lashed = null; b.turnDir = -1; b.turnTarget = 300; sail(b, 90);
    expect(b.hove).toBe(false); expect(b.jibBacked).toBe(0);
    expect(kt(b)).toBeGreaterThan(4);
  }, 180_000);
});
