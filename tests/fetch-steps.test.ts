// The planner makes the chop's fetch ready a ray per slice (environment/sea.ts SeaField.fetchSteps, sim/outlook.ts
// chopSteps): fetch must then answer the same, to the bit, as working it all out at once. Checked in the open Bay, by the
// marinas (the fine map's blend of four nodes, and the points where fetch falls back to the point itself), and in every
// direction, on and off its 2° steps.
import { describe, expect, it } from 'vitest';
import { SeaField, fineFetch } from '../src/environment/sea';
import { HARBORS } from '../src/geo/marina';
import { LL } from '../src/geo/geo';

describe('the fetch made ready a ray at a time', () => {
  it('the same fetch as working it out at once, in the open and by every marina', () => {
    let seed = 2468;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    const pts = Array.from({ length: 300 }, () => LL(37.72 + 0.2 * rnd(), -122.55 + 0.3 * rnd()));
    // (by each marina: points over its basin and out past its works, where the fine tracing hands over to the coarse)
    for (const H of HARBORS) for (let k = 0; k < 12; k++) pts.push({ x: H.reach.x0 - 150 + (H.reach.x1 - H.reach.x0 + 300) * rnd(), y: H.reach.y0 - 150 + (H.reach.y1 - H.reach.y0 + 300) * rnd() });
    const sliced = new SeaField(null), once = new SeaField(null);
    let n = 0, fine = 0, yields = 0;
    for (const p of pts) {
      const from = n % 2 ? 2 * Math.floor(180 * rnd()) : 360 * rnd();
      const g = sliced.fetchSteps(p, from); while (!g.next().done) yields++;
      const a = sliced.fetch(p, from), b = once.fetch(p, from);
      expect(Object.is(a, b), `fetch at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) from ${from.toFixed(1)}°: ${a} made ready, ${b} at once`).toBe(true);
      n++; if (fineFetch(p)) fine++;
    }
    // (both kinds checked, and the work really was sliced)
    expect(fine).toBeGreaterThan(50); expect(n - fine).toBeGreaterThan(200); expect(yields).toBeGreaterThan(10 * n);
  });
});
