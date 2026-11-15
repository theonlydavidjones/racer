import { describe, expect, it } from 'vitest';
import { type Vec } from '../src/core/math';
import { FLAT_SEA } from '../src/environment/sea';
import { onLand } from '../src/geo/shore';
import type { Outlook } from '../src/sim/outlook';
import { sailLeg } from '../src/sim/routing';

/** A light westerly in Angel Island's lee, the tide as it ran there on the Berkeley–Belvedere plan (15:00). */
function lee(kt: number, cur: Vec): Outlook {
  const wind = () => ({ kt, from: 271 });
  return {
    t0: 0, stations: null, chop: () => ({ hs: 0, tp: 1 }), sea: () => FLAT_SEA, current: () => cur,
    wind: () => ({ ...wind(), gust: 1.3 }), breeze: () => ({ ...wind(), gust: 1.3 }), windOnWater: () => wind()
  } as Outlook;
}

describe("the planner in a dead end: both boards blocked close ahead (Angel Island's north-east corner)", () => {
  // (from where the Berkeley–Belvedere plan came in under the corner, 37.8645° N, to the strait's eastern entrance, the
  // island between: tacking every half-minute from one blocked board to the other, the tide set her ashore)
  const from = { x: 2145, y: 6012 }, to = { x: 703, y: 7126 };
  for (const [kt, cur] of [[2.5, { x: 0.08, y: -0.09 }], [3, { x: 0.04, y: -0.05 }], [2.5, { x: 0.15, y: 0 }]] as [number, Vec][])
    it(`stands off and goes round in ${kt} kt, the tide ${cur.x}, ${cur.y} m/s, not onto the island`, () => {
      const r = sailLeg(lee(kt, cur), from, to, 0, 'middle');
      expect(r.why).not.toBe('land');
      expect(r.ok).toBe(true);
      expect(r.path.some(q => onLand(q.p))).toBe(false);
    });
});
