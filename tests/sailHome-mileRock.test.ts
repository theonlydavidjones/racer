// The owner (ROADMAP 8b): sailing outside the Gate near Mile Rock, "Sail Home" from the nav view, and "ten minutes in the
// course is still plotting in the nav map". The page's plans are worked out a slice at a time between frames. The live
// passage plan (sim/navigator.ts passageLive) was started again each 150 m she sailed (or two minutes of the clock),
// and from Mile Rock to her slip in Gashouse Cove its first plan is some 40 s of work: under way it never finished but by
// restarts. Sailed here as the page does: a frame every 16 ms, she at 6 kt toward the Gate, both asked for each frame.
// - The way round the land (ui/hud.ts navRoute), which the passage panel draws until the timed plan's in: within 5 s.
// - The timed plan: one plan, not one each 150 m, and in within PLAN_S. PLAN_S is today's measured time with a margin
//   (154–192 s alone, 16–17 Nov 2026: the first plan's cold fill of the router's outlook), not a goal: the cold fill is
//   its own work (the corridor-only lee, next). What tells this from main is the one plan: main started one each 150 m,
//   and the way round the land wasn't on the map at all.
// - This file is its correctness, and its bars are work, not the wall clock (the Coordinator, 18 Nov 2026: on a loaded
//   host the wall clock failed it on main too, a slice of 22.7 ms and then no panel plan in 120 s). The plan's and the
//   panel's bars are the work that fits in PLAN_S and PANEL_S at the page's share of its thread (SHARE: a 6 ms slice
//   each 16 ms tick, navigator.ts SLICE_NEW_MS, TICK_MS), the same bars as before, counted on the process's CPU time
//   (perf.test's clock: it doesn't run while the process waits for a core). The wall clock only stops a hung run
//   (HUNG: three times the bar). The bars aren't widened for the load.
// - (Timing, in perf.test, with its rerun-alone rule: the slice is a wall-clock bar, and the process's CPU time can't
//   judge one slice: it counts the compiler's and the collector's threads too, 27.7 ms at the 99.9th alone where the
//   wall read 13-18.) The page's thread held no longer than SLICE_MAX at the 99.9th percentile: its budget (6 ms, a new destination's) and
//   one step of the work past it (a step can't be stopped part way; the longest left, a cold wind reading, ~12 ms):
//   13–16 ms alone. Main's worst frame on this
//   passage was 38 ms over its 16, and a cold chop cell's swell (no part of the chop) held one 100 ms.
// - Then the passage panel's plan (navView: passagePlanLater, leaving now and later): it briefs from the live plan, not a
//   second one of its own (that was ~45 s more of the page's thread), and is in within PANEL_S, measured likewise.
import { describe, expect, it } from 'vitest';
import { HUNG, PANEL_S, PLAN_S, SHARE, pct, sailHomeFromMileRock } from './helpers/mileRock';
/** The process's own CPU time, ms (perf.test's clock): Node's process, typed here (the project doesn't take Node's types). */
const proc = (globalThis as unknown as { process: { cpuUsage(): { user: number; system: number } } }).process;
const cpu = () => { const c = proc.cpuUsage(); return (c.user + c.system) / 1000; };
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / 1000;

describe('Sail Home from Mile Rock: the way drawn at once, the plan in while she sails', () => {
  it('the route within 5 s, the timed plan once and within PLAN_S\'s work, the panel\'s within PANEL_S\'s', async () => {
    const r = await sailHomeFromMileRock({ clock: cpu, panel: true, hungPlanS: HUNG * PLAN_S, hungPanelS: HUNG * PANEL_S });
    const work = sum(r.slices), pw = r.panel ? sum(r.panel.slices) : NaN;
    console.log(`Mile Rock to Gashouse Cove: the route in ${r.routeS.toFixed(1)} s, the plan in ${r.planS.toFixed(0)} s on the wall, ${work.toFixed(1)} s of CPU (${r.before} plan${r.before === 1 ? '' : 's'} started before it was in); the panel's in ${r.panel?.s.toFixed(0)} s, ${pw.toFixed(1)} s of CPU (live plans started meanwhile: ${r.panel?.starts}); the slices (CPU, for the record): 99.9th percentile ${pct(r.slices, 99.9).toFixed(1)} ms`);
    expect(r.routeS, 'the way round the land on the map (s)').toBeLessThan(5);
    expect(r.plan, `no plan after ${r.planS.toFixed(0)} s`).not.toBeNull();
    expect(r.before, 'plans started before the first was in').toBe(1); // (then the next, from where she is)
    expect(work, 'the plan\'s work (CPU s): what fits in PLAN_S at the page\'s share').toBeLessThan(PLAN_S * SHARE);
    expect(r.panel?.plan, `no panel plan after ${r.panel?.s.toFixed(0)} s`).toBeTruthy();
    expect(pw, 'the panel\'s work (CPU s): what fits in PANEL_S at the page\'s share').toBeLessThan(PANEL_S * SHARE);
  }, 1_000_000);
});
