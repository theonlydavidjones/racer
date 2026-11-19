// Sail Home from Mile Rock, sailed as the page does (a frame every 16 ms, she at 6 kt toward the Gate, the way round the
// land and the live plan asked for each frame), for tests/sailHome-mileRock.test.ts (its correctness: one plan, the
// panel's plan, the work) and tests/perf.test.ts (its timing: the slices on the wall clock). See the former's notes.
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import { COURSES } from '../../src/courses/registry';
import { DT, World } from '../../src/sim/world';
import { SLIPS } from '../../src/geo/marina';
import { LL } from '../../src/geo/geo';
import { liveLog, passageLive, passagePlanLater, type PassagePlan, type PassageNow } from '../../src/sim/navigator';
import { navRoute, navRoutePending } from '../../src/ui/hud';

/** The bars (sailHome-mileRock.test.ts's notes): the plan's and the panel's (s, at the page's SHARE of its thread), a
 * slice's (ms, perf.test), and HUNG: the wall's stop, as a multiple of a bar. */
export const PLAN_S = 240, SLICE_MAX = 20, PANEL_S = 120, SHARE = 6 / (6 + 16), HUNG = 3;

export interface MileRockRun {
  routeS: number; planS: number; plan: PassageNow | null; before: number;
  /** the live plan's slices (ms, on the clock given), to the plan */
  slices: number[];
  /** the panel's: in, its wall seconds, and its slices and the live plan's meanwhile (ms, on the clock given) */
  panel?: { plan: PassagePlan | null | undefined; s: number; slices: number[]; starts: number };
}
/** `clock`: what the slices are measured on (the wall clock if not given); `hung`: the wall seconds after which a stage stops. */
export async function sailHomeFromMileRock(o: { clock?: () => number; panel: boolean; hungPlanS: number; hungPanelS: number }): Promise<MileRockRun> {
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings, 1, { freeSail: true });
  w.step(DT);
  const p = LL(37.7955, -122.512); w.user.x = p.x; w.user.y = p.y; w.step(DT);
  w.setDest(SLIPS.find(s => s.marina === 'gashouse-cove')!.p, 'Her slip');
  const dest = w.dest!, t0 = performance.now(), V = 6 * 1852 / 3600, h = 75 * Math.PI / 180; // (6 kt, in toward the Gate)
  const sail = (dt: number) => { w.user.x += Math.sin(h) * V * dt; w.user.y += Math.cos(h) * V * dt; (w as unknown as { t: number }).t += dt; }; // (her clock with her)
  let plan = null as PassageNow | null, last = t0, routeS = NaN, before = 0;
  liveLog.on = true; liveLog.clock = o.clock ?? (() => performance.now()); liveLog.slices.length = 0; liveLog.panel.length = 0; liveLog.starts = 0;
  navRoute(w.user, dest);
  while (!plan && performance.now() - t0 < o.hungPlanS * 1000) {
    await new Promise(r => setTimeout(r, 16));
    const now = performance.now(); sail((now - last) / 1000); last = now;
    const r = navRoute(w.user, dest); if (isNaN(routeS) && !navRoutePending() && r.length > 2) routeS = (now - t0) / 1000;
    before = liveLog.starts; plan = passageLive(w);
  }
  const run: MileRockRun = { routeS, planS: (performance.now() - t0) / 1000, plan, before, slices: liveLog.slices.slice() };
  if (o.panel && plan) { // the panel opened now: the HUD still asking for the live plan each frame, as she sails on
    liveLog.starts = 0; liveLog.slices.length = 0;
    let panel: PassagePlan | null | undefined; const p0 = performance.now(); last = p0;
    passagePlanLater(w, pl => { panel = pl; });
    while (panel === undefined && performance.now() - p0 < o.hungPanelS * 1000) {
      await new Promise(r => setTimeout(r, 16));
      const now = performance.now(); sail((now - last) / 1000); last = now;
      passageLive(w);
    }
    run.panel = { plan: panel, s: (performance.now() - p0) / 1000, slices: [...liveLog.slices, ...liveLog.panel], starts: liveLog.starts };
  }
  liveLog.on = false; liveLog.clock = () => performance.now();
  return run;
}
/** The q-th percentile of xs. */
export const pct = (xs: number[], q: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q / 100))]; };
