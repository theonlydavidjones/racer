import { describe, expect, it } from 'vitest';
import { bayTide, depthBand, sfTide, tideHeightAt } from '../src/environment/tide';
import { LL } from '../src/geo/geo';
import bayTides from '../src/environment/data/bay-tides.json';

/**
 * The water's depth over the chart in San Rafael and San Leandro Bays rises and falls with each bay's own tide station
 * (NOAA's subordinates of San Francisco: Point San Quentin, 9414873; San Leandro Channel, 9414724), not the City's.
 */
const day = Date.UTC(2026, 10, 14, 8); // (14 Nov 2026, from midnight in San Francisco)
/** The first high water in the day's 24 hours (ms) and its height, a minute at a time. */
const highWater = (f: (ms: number) => number) => { let best = -Infinity, at = 0; for (let m = 0; m < 24 * 60; m++) { const h = f(day + m * 60e3); if (h > best) { best = h; at = day + m * 60e3; } } return { at, h: best }; };
const ST = (bayTides as unknown as { stations: Record<string, { dtHigh: number; kHigh: number }> }).stations;

describe('each bay\'s depth grid has its own tide', () => {
  for (const [bay, id, p] of [['San Rafael Bay', '9414873', LL(37.955, -122.49)], ['San Leandro Bay', '9414724', LL(37.749, -122.225)]] as const) {
    it(`${bay}: its station's (${id}), its high water NOAA's offset after San Francisco's and its ratio of the height`, () => {
      expect(depthBand(p)).not.toEqual([0, 0]); // (on the grid)
      for (let m = 0; m < 24 * 60; m += 37) expect(tideHeightAt(p, day + m * 60e3)).toBeCloseTo(bayTide(id, day + m * 60e3).h, 9);
      const sf = highWater(sfTide), here = highWater(ms => tideHeightAt(p, ms)), S = ST[id];
      expect((here.at - sf.at) / 60e3).toBeGreaterThan(S.dtHigh - 6); expect((here.at - sf.at) / 60e3).toBeLessThan(S.dtHigh + 6);
      expect(here.h / sf.h).toBeCloseTo(S.kHigh, 1);
    });
  }
  it('off the grids, San Francisco\'s; across a grid\'s edge, no step in the water', () => {
    const off = LL(37.81, -122.42);
    expect(depthBand(off)).toEqual([0, 0]);
    expect(tideHeightAt(off, day)).toBe(sfTide(day));
    // San Rafael Bay's grid's east edge (122.45 W) and San Leandro Bay's west edge (122.246 W), on the water, a meter apart
    for (const [lat, lon] of [[37.95, -122.45], [37.749, -122.246]]) for (let m = 0; m < 24 * 60; m += 30) {
      const a = LL(lat, lon), t = day + m * 60e3, d = Math.abs(tideHeightAt({ x: a.x - 0.5, y: a.y }, t) - tideHeightAt({ x: a.x + 0.5, y: a.y }, t));
      expect(d, `${lat}, ${lon} at ${m} min`).toBeLessThan(0.005);
    }
  });
});
