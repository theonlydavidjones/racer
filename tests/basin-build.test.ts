import { describe, expect, it, vi } from 'vitest';

/**
 * The harbors' still-water grids (environment/current.ts basinCalm) are built before the start near the course, and a
 * slice at a time as a boat sails toward one, so the race never stops to build one mid-step (the Coordinator, v177).
 */
describe('the basin grids are built ahead, a slice at a time, and come out the same', () => {
  const pts = Array.from({ length: 200 }, (_, i) => ({ x: 4900 + (i % 20) * 15, y: -3600 + Math.floor(i / 20) * 50 })); // (South Beach and round it)
  it('sliced or all at once, the same calm everywhere', async () => {
    vi.resetModules(); const A = await import('../src/environment/current');
    while (A.warmBasins([pts[0]], 3000, 0.3)) { /* a slice at a time */ }
    const sliced = pts.map(p => A.basinCalm(p));
    vi.resetModules(); const B = await import('../src/environment/current');
    expect(pts.map(p => B.basinCalm(p))).toEqual(sliced);
  });
  it('every grid, cell for cell, the same built in one go and in slices of random size (and finished by a query part-way)', async () => {
    vi.resetModules(); const A = await import('../src/environment/current'), MA = await import('../src/geo/marina');
    const whole = MA.HARBORS.map(h => A._calmGrid(h));
    vi.resetModules(); const B = await import('../src/environment/current'), MB = await import('../src/geo/marina');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    MB.HARBORS.forEach((h, i) => {
      if (i % 3 === 0) { B._advanceBasin(h, 1 + Math.floor(rnd() * 40)); return; } // (part-built: the query below finishes it)
      while (!B._advanceBasin(h, 1 + Math.floor(rnd() * 25))) { /* slices */ }
    });
    MB.HARBORS.forEach((h, i) => {
      const a = whole[i], b = B._calmGrid(h);
      expect([b.nx, b.ny, b.x0, b.y0]).toEqual([a.nx, a.ny, a.x0, a.y0]);
      expect(b.d).toBeInstanceOf(Float32Array); expect(b.floor).toBeInstanceOf(Float32Array);
      let diff = 0; for (let k = 0; k < a.d.length; k++) if (!Object.is(a.d[k], b.d[k]) || !Object.is(a.floor[k], b.floor[k])) diff++;
      expect(diff, h.id).toBe(0);
    });
  }, 120_000);
  it('after prepareBasins, asking near the harbor builds nothing', async () => {
    vi.resetModules(); const C = await import('../src/environment/current');
    C.prepareBasins([{ x: 5100, y: -3300 }], 4000);
    const t0 = performance.now(); for (const p of pts) C.basinCalm(p);
    expect(performance.now() - t0).toBeLessThan(20); // (200 lookups; building the grid takes 50–300 ms)
  });
});
