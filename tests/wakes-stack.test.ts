// Overlapping wind shadows combine as the root of the sum of their squared deficits (Katić et al. 1986), not their sum:
// one boat's shadow is unchanged, but a bunched fleet running in line no longer takes the wind down to a fifth.
import { describe, expect, it } from 'vitest';
import { WindSum, addBoatWake } from '../src/environment/shadows';

// a dead run in 8.6 kt at 4.5 kt (her apparent wind about 4 kt), the wind from the west: boats east of the point are
// downwind of it, west of it upwind (casting their shadow onto it)
const tws = 8.6, aws = (tws - 4.5) * 0.5144;
const ahead = (m: number, across = 0) => ({ x: -m, y: across, h: 90, arel: 175, awa: 175, aws, ww: { kt: tws } });
const k = (...cs: ReturnType<typeof ahead>[]) => { const s = new WindSum(); for (const c of cs) addBoatWake(s, c as never, { x: 0, y: 0 }, tws); return s.result(270).k; };

describe('wind shadows that overlap', () => {
  it('one boat directly upwind: a deep, narrow shadow a few mast heights long, as before', () => {
    expect(k(ahead(15))).toBeCloseTo(0.76, 2);
    expect(k(ahead(30))).toBeCloseTo(0.86, 2);
    expect(k(ahead(15, 6))).toBeGreaterThan(0.99); // (6 m off her wake's axis: clear)
  });
  it('three in line combine by the root of the sum of squares: each takes less of what the one before left', () => {
    const one = [ahead(11, 1), ahead(20, -1), ahead(30, 1)].map(c => 1 - k(c)), rss = Math.sqrt(one.reduce((a, d) => a + d * d, 0));
    expect(k(ahead(11, 1), ahead(20, -1), ahead(30, 1))).toBeCloseTo(1 - rss, 2);
    expect(k(ahead(11, 1), ahead(20, -1), ahead(30, 1))).toBeGreaterThan(0.6); // (summed, 0.47)
  });
  it('wakes pointing opposite ways cancel smoothly, as they would added (a ferry running faster than the wind)', () => {
    const at = (a: number, b: number) => { const s = new WindSum(); s.addDeficit(1, 0, a); s.addDeficit(-1, 0, b); return s.result(270); };
    // (wind from the west: a deficit along +x slows it, one along −x is air carried forward, more wind)
    expect(at(0.30, 0.29).k).toBeCloseTo(1 - 0.01 * Math.hypot(0.3, 0.29) / 0.59, 3);
    expect(at(0.30, 0.31).k).toBeCloseTo(1 + 0.01 * Math.hypot(0.3, 0.31) / 0.61, 3); // (no jump between the two)
    expect(Math.abs(at(0.30, 0.30).k - 1)).toBeLessThan(1e-9);
    const cross = new WindSum(); cross.addDeficit(1, 0, 0.3); cross.addDeficit(-0.9962, -0.0872, 0.3); // (toward 090° and toward 265°: nearly opposite)
    expect(Math.abs(cross.result(270).shift)).toBeLessThan(5);
  });
});
