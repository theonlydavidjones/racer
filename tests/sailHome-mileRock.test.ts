// The owner (ROADMAP 8b): sailing outside the Gate near Mile Rock, "Sail Home" from the nav view, and "ten minutes in the
// course is still plotting in the nav map". The page's plans are worked out a slice at a time between frames. The live
// passage plan (sim/navigator.ts passageLive) was started again each 150 m she sailed (or two minutes of the clock),
// and from Mile Rock to her slip in Gashouse Cove its first plan is some 40 s of work: under way it never finished but by
// restarts. Sailed here as the page does: a frame every 16 ms, she at 6 kt toward the Gate, both asked for each frame.
// - The way round the land (ui/hud.ts navRoute), which the passage panel draws until the timed plan's in: within 5 s.
// - The timed plan: one plan, not one each 150 m, and in within PLAN_S. PLAN_S is today's measured time with a margin
//   (154–184 s alone, over 240 in the full suite's load, 16–17 Nov 2026: the first plan's cold fill of the router's
//   outlook), not a goal: the cold fill is its own work (the corridor-only lee, next). What tells this from main is the
//   one plan: main started one each 150 m, and the way round the land wasn't on the map at all.
// - The page's thread held no longer than SLICE_MAX at the 99.9th percentile: its budget (6 ms, a new destination's) and
//   one step of the work past it (a step can't be stopped part way; the longest left, a cold wind reading, ~12 ms), and
//   the shared host's load (16 ms alone, 22.5 in the full suite). Main's worst frame on this
//   passage was 38 ms over its 16, and a cold chop cell's swell (no part of the chop) held one 100 ms.
// - Then the passage panel's plan (navView: passagePlanLater, leaving now and later): it briefs from the live plan, not a
//   second one of its own (that was ~45 s more of the page's thread), and is in within PANEL_S, measured likewise.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { SLIPS } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { liveLog, passageLive, passagePlanLater, type PassagePlan } from '../src/sim/navigator';
import { navRoute, navRoutePending } from '../src/ui/hud';

const PLAN_S = 600, SLICE_MAX = 30, PANEL_S = 300;

describe('Sail Home from Mile Rock: the way drawn at once, the plan in while she sails', () => {
  it('the route within 5 s, the timed plan once and within PLAN_S, every slice within its budget', async () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings, 1, { freeSail: true });
    w.step(DT);
    const p = LL(37.7955, -122.512); w.user.x = p.x; w.user.y = p.y; w.step(DT);
    w.setDest(SLIPS.find(s => s.marina === 'gashouse-cove')!.p, 'Her slip');
    const dest = w.dest!, t0 = performance.now(), V = 6 * 1852 / 3600, h = 75 * Math.PI / 180; // (6 kt, in toward the Gate)
    let plan = null as ReturnType<typeof passageLive>, last = t0, routeS = NaN, before = 0;
    liveLog.on = true; liveLog.slices.length = 0; liveLog.starts = 0;
    navRoute(w.user, dest);
    while (!plan && performance.now() - t0 < PLAN_S * 1000) {
      await new Promise(r => setTimeout(r, 16));
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      w.user.x += Math.sin(h) * V * dt; w.user.y += Math.cos(h) * V * dt; // (sailing, her clock with her)
      (w as unknown as { t: number }).t += dt;
      const r = navRoute(w.user, dest); if (isNaN(routeS) && !navRoutePending() && r.length > 2) routeS = (now - t0) / 1000;
      before = liveLog.starts; plan = passageLive(w);
    }
    const s = (performance.now() - t0) / 1000, sl = liveLog.slices.slice().sort((x, y) => x - y), pct = (q: number) => sl[Math.min(sl.length - 1, Math.floor(sl.length * q / 100))];
    console.log(`Mile Rock to Gashouse Cove: the route in ${routeS.toFixed(1)} s, the plan in ${s.toFixed(0)} s (${before} plan${before === 1 ? '' : 's'} started before it was in), the slices: 99.9th percentile ${pct(99.9).toFixed(1)} ms, the longest ${pct(100).toFixed(1)}`); liveLog.on = false;
    expect(routeS, 'the way round the land on the map (s)').toBeLessThan(5);
    expect(plan, `no plan after ${s.toFixed(0)} s, ${(s * V).toFixed(0)} m sailed`).not.toBeNull();
    expect(before, 'plans started before the first was in').toBe(1); // (then the next, from where she is)
    // (a percentile, not the longest: on a shared host a collection or the machine's other work can land in one slice)
    expect(pct(99.9), 'the slices, 99.9th percentile (ms)').toBeLessThan(SLICE_MAX);
    // the panel opened now: the HUD still asking for the live plan each frame, as she sails on
    liveLog.on = true; liveLog.starts = 0;
    let panel: PassagePlan | null | undefined; const p0 = performance.now(); last = p0;
    passagePlanLater(w, pl => { panel = pl; });
    while (panel === undefined && performance.now() - p0 < PANEL_S * 1000) {
      await new Promise(r => setTimeout(r, 16));
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      w.user.x += Math.sin(h) * V * dt; w.user.y += Math.cos(h) * V * dt; (w as unknown as { t: number }).t += dt;
      passageLive(w);
    }
    const ps = (performance.now() - p0) / 1000; liveLog.on = false;
    console.log(`the panel's plan in ${ps.toFixed(0)} s (live plans started meanwhile: ${liveLog.starts})`);
    expect(panel, `no panel plan after ${ps.toFixed(0)} s`).toBeTruthy();
  }, 1_000_000);
});
