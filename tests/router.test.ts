import { describe, expect, it } from 'vitest';
import { routeLeg } from '../src/sim/router';
import type { Outlook } from '../src/sim/outlook';
import { speedInChop } from '../src/boat/seaway';
import { LL } from '../src/geo/geo';
import { KT } from '../src/core/math';

/**
 * The isochrone router (sim/router.ts) on open water, in a made-up day: the wind and current set by hand, so what it
 * should find is known. Between Alcatraz and Angel Island, over a kilometer from either shore.
 */
const A = LL(37.8400, -122.4300), B = { x: A.x + 600, y: A.y }; // (600 m east)
const day = (kt: number, from: number, cur: { x: number; y: number }): Outlook => ({
  t0: 0, stations: null,
  wind: () => ({ kt, from, gust: 1 }),
  current: () => cur,
  windOnWater: () => ({ kt, from }),
  sea: () => { throw new Error('not used'); },
  chop: () => ({ hs: 0, tp: 0 }),
  breeze: () => ({ kt, from, gust: 1 }),
});

describe('the isochrone router', () => {
  it('a calm with the tide under her: she drifts there, not given up as land (Deep Physics, M1)', () => {
    // (the air moving with the water, 1 m/s east: no wind on the water. Still air over a stream would give her the
    // stream's own breeze, 1.9 kt from ahead, which she can sail)
    const r = routeLeg(day(1 / KT, 270, { x: 1, y: 0 }), A, B, 0);
    expect(r.ok).toBe(true);
    expect(r.minutes).toBeGreaterThan(9); // (570 m to within 30 m of the mark at 1 m/s: 9.5 min)
    expect(r.minutes).toBeLessThan(10);
  });
  it('arrives when she first comes within reach of the mark, not at the closest point (S4)', () => {
    const r = routeLeg(day(10, 0, { x: 0, y: 0 }), A, B, 0); // (a beam reach in 10 kt, no tide)
    const v = speedInChop(10, 90, 0, 0), want = (600 - 30) / v / 60;
    expect(r.ok).toBe(true);
    expect(Math.abs(r.minutes / want - 1)).toBeLessThan(0.02);
  });
});
