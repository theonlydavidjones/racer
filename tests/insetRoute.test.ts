import { describe, expect, it, vi } from 'vitest';
import { LL } from '../src/geo/geo';
import { landAlong } from '../src/geo/shore';
import { routeAround } from '../src/sim/routing';
import { navRoute } from '../src/ui/hud';
import type { CourseMark } from '../src/courses/course';

// the owner: "On the inset map, if I have a destination selected in cruise mode, I want it to show the navigator's
// plotted route, not a straight line."
const mark = (lat: number, lon: number): CourseMark => ({ id: 'pick', name: 'test', p: LL(lat, lon) } as unknown as CourseMark);

describe("the inset's route to the destination", () => {
  it("is the navigator's way round the land (the passage plan's route), not the straight line", () => {
    const from = LL(37.8110, -122.4400), dest = mark(37.8790, -122.4300); // the Cityfront to north of Angel Island
    expect(landAlong(from, dest.p)).toBeLessThan(Infinity); // (the straight line runs over the island)
    const r = navRoute(from, dest);
    expect(r).toEqual(routeAround(from, dest.p));
    expect(r.length).toBeGreaterThan(2);
    for (let i = 1; i < r.length; i++) expect(landAlong(r[i - 1], r[i]), `leg ${i}`).toBe(Infinity);
  });

  it('re-plans as she sails on (and not every frame), and at once for a new destination', () => {
    const t = { now: 0 }; vi.spyOn(performance, 'now').mockImplementation(() => t.now);
    const dest = mark(37.8790, -122.4300), a = LL(37.8110, -122.4400);
    const r0 = navRoute(a, dest);
    t.now += 500; expect(navRoute({ x: a.x + 300, y: a.y }, dest)).toBe(r0); // (moved, but planned only just now)
    t.now += 3000; const r1 = navRoute({ x: a.x + 300, y: a.y }, dest);
    expect(r1).not.toBe(r0); expect(r1[0].x).toBeCloseTo(a.x + 300, 6);
    t.now += 3000; expect(navRoute({ x: a.x + 320, y: a.y }, dest)).toBe(r1); // (20 m on: the plan stands)
    const d2 = mark(37.8530, -122.4720); expect(navRoute({ x: a.x + 320, y: a.y }, d2).at(-1)).toEqual(d2.p);
    vi.restoreAllMocks();
  });
});
