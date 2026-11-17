// The passage planner's plan with the lee's open-water skip (environment/shadows.ts mayRise) is the plan with every ray
// marched from its start: the same track, point for point. Each way from fresh modules (nothing remembered between).
// A short passage in the lee of the Marin shore and across the Gate's open water, so it's quick.
import { describe, expect, it, vi } from 'vitest';

async function plan(skip: boolean) {
  vi.resetModules();
  const { leeSkip } = await import('../src/environment/shadows'); leeSkip.on = skip;
  const { DEFAULT_SETTINGS } = await import('../src/settings');
  const { COURSES } = await import('../src/courses/registry');
  const { DT, World } = await import('../src/sim/world');
  const { LL } = await import('../src/geo/geo');
  const { passagePlan } = await import('../src/sim/navigator');
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as typeof DEFAULT_SETTINGS, 1, { freeSail: true });
  w.step(DT);
  const p = LL(37.818, -122.462); w.user.x = p.x; w.user.y = p.y; w.step(DT); // (inside the Gate, under the Marin shore)
  w.setDest(LL(37.835, -122.418), 'Off Angel Island');
  const t0 = performance.now(), pl = passagePlan(w);
  return { pl, s: (performance.now() - t0) / 1000 };
}

describe('the lee skip leaves the passage plan as it was', () => {
  it('the same track with the skip as without', async () => {
    const a = await plan(true), b = await plan(false).finally(async () => { (await import('../src/environment/shadows')).leeSkip.on = true; });
    expect(a.pl && b.pl, 'both planned').toBeTruthy();
    expect(a.pl!.track.map(x => [x.p.x, x.p.y, x.t])).toEqual(b.pl!.track.map(x => [x.p.x, x.p.y, x.t]));
    expect(a.pl!.route).toEqual(b.pl!.route);
    console.log(`with the skip ${a.s.toFixed(1)} s, without ${b.s.toFixed(1)} s, ${a.pl!.track.length} points`);
  }, 600_000);
});
