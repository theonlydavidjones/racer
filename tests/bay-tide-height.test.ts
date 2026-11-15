import { describe, expect, it } from 'vitest';
import { bayTide, depthBand, sfTide, tideHeightAt } from '../src/environment/tide';
import { LL } from '../src/geo/geo';
import bayTides from '../src/environment/data/bay-tides.json';

/**
 * The water's depth over the chart in San Rafael and San Leandro Bays rises and falls with each bay's own tide station
 * (NOAA's subordinates of San Francisco: Point San Quentin, 9414873; San Leandro Channel, 9414724), the one its stream
 * fills it by, not the City's: over the whole grid, its edges too.
 */
const day = Date.UTC(2026, 10, 14, 8); // (14 Nov 2026, from midnight in San Francisco)
/** The day's highest high water (ms) and its height, a minute at a time, within `from`–`to` minutes of its start. */
const highWater = (f: (ms: number) => number, from = 0, to = 24 * 60) => { let best = -Infinity, at = 0; for (let m = from; m < to; m++) { const h = f(day + m * 60e3); if (h > best) { best = h; at = day + m * 60e3; } } return { at, h: best }; };
const ST = (bayTides as unknown as { stations: Record<string, { dtHigh: number; kHigh: number }> }).stations;

describe('each bay\'s depth grid has its own tide', () => {
  // (deep in each grid, and on its water a stone's throw inside its edges: San Rafael Bay's south edge below Point San
  // Quentin and its east edge; San Leandro Bay's south flats and its west edge)
  const GRIDS = [
    ['San Rafael Bay', '9414873', [LL(37.955, -122.49), LL(37.9365, -122.478), LL(37.955, -122.4505)]],
    ['San Leandro Bay', '9414724', [LL(37.749, -122.225), LL(37.7355, -122.22), LL(37.749, -122.2455)]]
  ] as const;
  for (const [bay, id, pts] of GRIDS) {
    it(`${bay}: its station's (${id}) everywhere on the grid, its high water NOAA's offset after San Francisco's at its ratio`, () => {
      for (const p of pts) {
        expect(depthBand(p), `${p.x}, ${p.y}`).not.toEqual([0, 0]); // (on the grid)
        for (let m = 0; m < 24 * 60; m += 37) expect(tideHeightAt(p, day + m * 60e3)).toBe(bayTide(id, day + m * 60e3).h);
      }
      // (a high water well inside the day, so San Francisco's and the bay's are the same tide)
      const sf = highWater(sfTide, 60, 22 * 60), here = highWater(ms => tideHeightAt(pts[0], ms), 60, 23 * 60), S = ST[id];
      expect((here.at - sf.at) / 60e3).toBeGreaterThan(S.dtHigh - 6); expect((here.at - sf.at) / 60e3).toBeLessThan(S.dtHigh + 6);
      expect(here.h / sf.h).toBeCloseTo(S.kHigh, 1);
    });
  }
  it('off the grids, San Francisco\'s', () => {
    const off = LL(37.81, -122.42);
    expect(depthBand(off)).toEqual([0, 0]);
    expect(tideHeightAt(off, day)).toBe(sfTide(day));
  });
});
