import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { sailFrame, sailWind, windAtHeight, gradientAt } from '../src/boat/physics';
import { CE_ABOVE_WL } from '../src/boat/balance';
import { D2R, KT } from '../src/core/math';
import { DEFAULT_KEYS } from '../src/ui/keys';
import type { Boat } from '../src/boat/boat';

/** Close-hauled in 12 kt, settled. */
function beating(): Boat {
  const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 12 }) as Boat;
  sail(b, 30, () => { b.h = 360 - twa; });
  return b;
}

describe('The wind indicator: the wind she feels at each height (physics.ts windAtHeight)', () => {
  it('its label is the apparent wind the sails are trimmed to (in her course\'s frame), at their centre of effort', () => {
    const b = beating(); b.heelRate = 0; // (no roll: the rig's sway is then the same at every height)
    const fr = sailFrame(b), w = windAtHeight(b, CE_ABOVE_WL);
    const s = sailWind(b.ww.from, b.ww.kt, b.h + fr.rot, fr.along - (b.astern ?? 0), fr.across, b.heel ?? 0);
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
  it('the arrows close the wind triangle: the apparent air is the true wind less her own velocity', () => {
    const b = beating(); b.heelRate = 0; b.sway = 0; b.sailRot = 0; b.astern = 0;
    for (const z of [1, CE_ABOVE_WL, 10.7]) {
      const w = windAtHeight(b, z), go = (from: number, kt: number) => [-Math.sin(from * D2R) * kt * KT, -Math.cos(from * D2R) * kt * KT];
      const [tx, ty] = go(w.tw.from, w.tw.kt), [ax, ay] = go(w.air.from, w.air.kt);
      expect(ax).toBeCloseTo(tx - Math.sin(b.h * D2R) * b.v, 6);
      expect(ay).toBeCloseTo(ty - Math.cos(b.h * D2R) * b.v, 6);
    }
  });
  it('its key is ` (backquote), not taken by any other action', () => {
    expect(DEFAULT_KEYS.windLadder).toEqual(['`']);
    const others = Object.entries(DEFAULT_KEYS).filter(([k]) => k !== 'windLadder').flatMap(([, v]) => v);
    expect(others).not.toContain('`');
  });
});
