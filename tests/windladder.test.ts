import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { sailWind, windAtHeight, gradientAt } from '../src/boat/physics';
import { CE_ABOVE_WL } from '../src/boat/balance';
import { KT } from '../src/core/math';
import { DEFAULT_KEYS } from '../src/ui/keys';
import type { Boat } from '../src/boat/boat';

/** Close-hauled in 12 kt, settled. */
function beating(): Boat {
  const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 12 }) as Boat;
  sail(b, 30, () => { b.h = 360 - twa; });
  return b;
}

describe('The wind indicator: the wind she feels at each height (physics.ts windAtHeight)', () => {
  it('at the sails\' centre of effort it is the wind the sails get (sailWind), apart from the rig\'s sway', () => {
    const b = beating(); b.heelRate = 0; // (no roll: the sway term is then the same at every height)
    const w = windAtHeight(b, CE_ABOVE_WL), s = sailWind(b.ww.from, b.ww.kt, b.h, b.v - (b.astern ?? 0), b.sway ?? 0, b.heel ?? 0);
    expect(w.aw.kt).toBeCloseTo(s.aws / KT, 6);
    expect(w.aw.awa).toBeCloseTo(s.awa, 6);
  });
  it('the true wind follows the log profile: all of it at 10 m, less lower down (ORC VPP eq. 7.1)', () => {
    const b = beating();
    expect(windAtHeight(b, 10).tw.kt).toBeCloseTo(b.ww.kt, 6);
    expect(gradientAt(1)).toBeGreaterThan(0.65); expect(gradientAt(1)).toBeLessThan(0.75);
    expect(windAtHeight(b, 1).tw.kt).toBeLessThan(windAtHeight(b, CE_ABOVE_WL).tw.kt);
  });
  it('upwind, the apparent wind is stronger and comes from further aft at the masthead than at the deck (twist)', () => {
    const b = beating(); b.heelRate = 0;
    const lo = windAtHeight(b, 1).aw, hi = windAtHeight(b, 10.7).aw;
    expect(hi.kt).toBeGreaterThan(lo.kt);
    expect(hi.awa).toBeGreaterThan(lo.awa + 1);
    expect(hi.awa - lo.awa).toBeLessThan(10); // (a few degrees: the twist the sails are cut for)
  });
  it('the apparent wind comes over the windward side: its bearing is her heading plus the wind angle on that side', () => {
    const b = beating(), a = windAtHeight(b, CE_ABOVE_WL).aw, rel = ((a.from - b.h + 540) % 360) - 180;
    expect(Math.abs(Math.abs(rel) - a.awa)).toBeLessThan(1e-6);
    expect(Math.sign(rel)).toBe(Math.sign(((b.ww.from - b.h + 540) % 360) - 180));
  });
  it('its key is ` (backquote), not taken by any other action', () => {
    expect(DEFAULT_KEYS.windLadder).toEqual(['`']);
    const others = Object.entries(DEFAULT_KEYS).filter(([k]) => k !== 'windLadder').flatMap(([, v]) => v);
    expect(others).not.toContain('`');
  });
});
