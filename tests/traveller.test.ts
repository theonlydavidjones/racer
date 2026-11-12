import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { takeLine } from '../src/boat/physics';
import { travellerRate } from '../src/boat/controls';
import type { Boat } from '../src/boat/boat';

/** Time (s) for your traveller to run from one end to the other with the line held that way (+1 to leeward). */
function run(W: number, dir: 1 | -1): number {
  const twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: W }) as Boat; b.isUser = true;
  sail(b, 10, () => { b.h = 360 - twa; });
  takeLine(b, 'traveller'); b.ctl.traveller = -dir; b.ctlCmd.traveller = dir;
  let t = 0; sail(b, 15, () => { b.h = 360 - twa; if (dir * b.ctl.traveller < 0.999) t += 1 / 60; else return true; });
  return t;
}

describe('The traveller (owner, 12 Nov 2026: "releasing it is very rapid; pulling it in is slightly slower but still quick")', () => {
  it('eased to leeward it runs end to end in about a second', () => {
    expect(run(10, 1)).toBeLessThan(1.3);
  });
  it('hauled to windward it is a little slower: under two seconds in light air, a few in a breeze', () => {
    const light = run(5, -1), breeze = run(20, -1);
    expect(light).toBeGreaterThan(1.2); expect(light).toBeLessThan(2);
    expect(breeze).toBeGreaterThan(light);
    expect(breeze).toBeLessThan(4);
  });
  it('easing is always quicker than hauling, and hauling slows as the breeze builds', () => {
    for (const tws of [3, 10, 18, 28]) expect(travellerRate(true, tws)).toBeGreaterThan(travellerRate(false, tws));
    expect(travellerRate(false, 18)).toBeLessThan(travellerRate(false, 6));
  });
});
