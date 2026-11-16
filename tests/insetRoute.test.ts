import { describe, expect, it, vi } from 'vitest';
import { LL } from '../src/geo/geo';
import { landAlong } from '../src/geo/shore';
import { routeAround } from '../src/sim/routing';
import { navRoute, navRouteFinish } from '../src/ui/hud';
import type { CourseMark } from '../src/courses/course';

// the owner: "On the inset map, if I have a destination selected in cruise mode, I want it to show the navigator's
// plotted route, not a straight line." The route is worked out in the background a few milliseconds a frame (Capacity:
// the search held a frame up for 60–200 ms every 2 s on a long leg); navRouteFinish works out the one in hand at once,
// so these see the route the page sees once it's in.
const mark = (lat: number, lon: number): CourseMark => ({ id: 'pick', name: 'test', p: LL(lat, lon) } as unknown as CourseMark);

describe("the inset's route to the destination", () => {
  it("is the navigator's way round the land (the passage plan's route), not the straight line", () => {
    const from = LL(37.8110, -122.4400), dest = mark(37.8790, -122.4300); // the Cityfront to north of Angel Island
    expect(landAlong(from, dest.p)).toBeLessThan(Infinity); // (the straight line runs over the island)
    expect(navRoute(from, dest)).toEqual([from, dest.p]); // (the straight line until the route is in)
    navRouteFinish();
    const r = navRoute(from, dest);
    expect(r).toEqual(routeAround(from, dest.p));
    expect(r.length).toBeGreaterThan(2);
    for (let i = 1; i < r.length; i++) expect(landAlong(r[i - 1], r[i]), `leg ${i}`).toBe(Infinity);
  });

  it('re-plans as she sails on (and not every frame), and at once for a new destination', () => {
    const t = { now: 0 }; vi.spyOn(performance, 'now').mockImplementation(() => t.now);
    const dest = mark(37.8790, -122.4300), a = LL(37.8110, -122.4400);
    navRoute(a, dest); navRouteFinish(); const r0 = navRoute(a, dest);
    t.now += 500; expect(navRoute({ x: a.x + 300, y: a.y }, dest)).toBe(r0); navRouteFinish(); // (moved, but planned only just now)
    expect(navRoute({ x: a.x + 300, y: a.y }, dest)).toBe(r0);
    t.now += 3000; expect(navRoute({ x: a.x + 300, y: a.y }, dest)).toBe(r0); // (re-planning: the last route stays drawn meanwhile)
    navRouteFinish(); const r1 = navRoute({ x: a.x + 300, y: a.y }, dest);
    expect(r1).not.toBe(r0); expect(r1[0].x).toBeCloseTo(a.x + 300, 6);
    t.now += 3000; expect(navRoute({ x: a.x + 320, y: a.y }, dest)).toBe(r1); navRouteFinish(); // (20 m on: the plan stands)
    expect(navRoute({ x: a.x + 320, y: a.y }, dest)).toBe(r1);
    const d2 = mark(37.8530, -122.4720); expect(navRoute({ x: a.x + 320, y: a.y }, d2).at(-1)).toEqual(d2.p); // (a new destination: at once)
    navRouteFinish(); expect(navRoute({ x: a.x + 320, y: a.y }, d2)).toEqual(routeAround({ x: a.x + 320, y: a.y }, d2.p));
    vi.restoreAllMocks();
  });
});
