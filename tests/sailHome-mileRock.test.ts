// The owner (ROADMAP 8b): sailing outside the Gate near Mile Rock, "Sail Home" from the nav view, and "ten minutes in the
// course is still plotting in the nav map". The page's plans are worked out a slice at a time between frames. The live
// passage plan (sim/navigator.ts passageLive) was started again each 150 m she sailed (or two minutes of the clock),
// and from Mile Rock to her slip in Gashouse Cove its first plan is some 40 s of work: under way it never finished but by
// restarts. Sailed here as the page does: a frame every 16 ms, she at 6 kt toward the Gate, both asked for each frame.
// - The way round the land (ui/hud.ts navRoute), which the passage panel draws until the timed plan's in: within 5 s.
// - The timed plan: one plan, not one each 150 m, and in within PLAN_S. PLAN_S is today's measured time with a margin
//   (154–180 s, 16–17 Nov 2026: the first plan's cold fill of the router's outlook), not a goal: the cold fill is its own
//   work (the corridor-only lee, next).
// - No slice of the page's thread over SLICE_MAX: its budget (6 ms, a new destination's) and one step of the work past
//   it (a step can't be stopped part way; the longest left, a cold wind reading, ~12 ms). Main's worst frame on this
//   passage was 38 ms over its 16, and a cold chop cell's swell (no part of the chop) held one 100 ms.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { SLIPS } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { liveSlices, liveStarts, passageLive } from '../src/sim/navigator';
import { navRoute, navRoutePending } from '../src/ui/hud';

const PLAN_S = 240, SLICE_MAX = 20;

describe('Sail Home from Mile Rock: the way drawn at once, the plan in while she sails', () => {
  it('the route within 5 s, the timed plan once and within PLAN_S, every slice within its budget', async () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings, 1, { freeSail: true });
    w.step(DT);
    const p = LL(37.7955, -122.512); w.user.x = p.x; w.user.y = p.y; w.step(DT);
    w.setDest(SLIPS.find(s => s.marina === 'gashouse-cove')!.p, 'Her slip');
    const dest = w.dest!, t0 = performance.now(), V = 6 * 1852 / 3600, h = 75 * Math.PI / 180; // (6 kt, in toward the Gate)
    let plan = null as ReturnType<typeof passageLive>, last = t0, routeS = NaN, before = 0;
    liveSlices.length = 0; liveStarts.n = 0;
    navRoute(w.user, dest);
    while (!plan && performance.now() - t0 < PLAN_S * 1000) {
      await new Promise(r => setTimeout(r, 16));
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      w.user.x += Math.sin(h) * V * dt; w.user.y += Math.cos(h) * V * dt; // (sailing, her clock with her)
      (w as unknown as { t: number }).t += dt;
      const r = navRoute(w.user, dest); if (isNaN(routeS) && !navRoutePending() && r.length > 2) routeS = (now - t0) / 1000;
      before = liveStarts.n; plan = passageLive(w);
    }
    const s = (performance.now() - t0) / 1000;
    console.log(`Mile Rock to Gashouse Cove: the route in ${routeS.toFixed(1)} s, the plan in ${s.toFixed(0)} s (${before} plan${before === 1 ? '' : 's'} started before it was in), the longest slice ${Math.max(...liveSlices).toFixed(1)} ms`);
    expect(routeS, 'the way round the land on the map (s)').toBeLessThan(5);
    expect(plan, `no plan after ${s.toFixed(0)} s, ${(s * V).toFixed(0)} m sailed`).not.toBeNull();
    expect(before, 'plans started before the first was in').toBe(1); // (then the next, from where she is)
    expect(Math.max(...liveSlices), 'the longest slice (ms)').toBeLessThan(SLICE_MAX);
  }, 400_000);
});
