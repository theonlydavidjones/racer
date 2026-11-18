import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { World } from '../src/sim/world';
import { LEE_WARM_CELL, LEE_WARM_MARGIN, leeWarmPoints, raceWaters } from '../src/app/leeWarm';

/** The harbors' lee filed in the setup's idle time over the race's waters (src/app/leeWarm.ts): so the race's inset finds it ready. */
describe("warming the harbors' lee before the race", () => {
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS }, 1);
  const pts = leeWarmPoints(raceWaters(w), w.user);

  it('one point in every 50 m cell over the course and her start, with the margin round them', () => {
    const W = raceWaters(w), x0 = Math.min(...W.map(p => p.x)) - LEE_WARM_MARGIN, y0 = Math.min(...W.map(p => p.y)) - LEE_WARM_MARGIN;
    const x1 = Math.max(...W.map(p => p.x)) + LEE_WARM_MARGIN, y1 = Math.max(...W.map(p => p.y)) + LEE_WARM_MARGIN;
    const cells = new Set(pts.map(p => `${Math.floor((p.x - 7) / LEE_WARM_CELL)},${Math.floor((p.y + 13) / LEE_WARM_CELL)}`)); // (any grid of 50 m, however offset)
    expect(cells.size).toBe(pts.length);
    expect(pts.length).toBeGreaterThanOrEqual(Math.floor((x1 - x0) / LEE_WARM_CELL) * Math.floor((y1 - y0) / LEE_WARM_CELL));
    for (const m of w.C.marks) expect(pts.some(p => Math.abs(p.x - m.p.x) <= LEE_WARM_CELL / 2 && Math.abs(p.y - m.p.y) <= LEE_WARM_CELL / 2)).toBe(true);
  });

  it('nearest her first: the start, where the inset looks first', () => {
    const d = pts.map(p => Math.hypot(p.x - w.user.x, p.y - w.user.y));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
  });
});
