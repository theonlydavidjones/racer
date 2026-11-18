// The passage planner's chop (sim/outlook.ts chop) is the wind sea alone, sea.at's windSeaOnly: the swell's reach (its
// shadows behind the islands, up to 100 ms a point, uncached) isn't the chop's. The same height and period as the whole
// sea's, at every cell, whichever way it's worked out (chopSteps a piece at a time, or at once).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { outlookFor } from '../src/sim/outlook';
import { windOnWater } from '../src/environment/current';
import { onLand } from '../src/geo/shore';

describe("the planner's chop: the wind sea alone, the same as the whole sea's", () => {
  it('equal at each 400 m cell, at once or a piece at a time', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings, 1, { freeSail: true });
    w.step(DT);
    const o = outlookFor(w), o2 = outlookFor(w), t = Math.round(w.clockUtc / 10) * 10;
    let n = 0;
    for (let x = -12000; x <= 6000; x += 2400) for (let y = -2400; y <= 4800; y += 2400) {
      const q = { x, y }; if (onLand(q)) continue;
      const c = o.current(q, t), full = w.sea.at(q, windOnWater(o.wind(q, t), c), c, r => o.current(r, t), w.seaDurationAt(t));
      const a = o.chop(q, t);
      const g = o2.chopSteps!(q, t); let r = g.next(); while (!r.done) r = g.next(); const b = o2.chop(q, t);
      expect([a.hs, a.tp], `${x}, ${y}`).toEqual([full.hsW, full.tpW]);
      expect([b.hs, b.tp], `${x}, ${y}`).toEqual([a.hs, a.tp]); n++;
    }
    expect(n).toBeGreaterThan(10);
  }, 120_000);
});
