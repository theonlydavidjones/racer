import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

/**
 * The showroom (World.idle with a held true wind angle): she's shown with her crew's trim already settled, not with her
 * sheets eased from a cold start while the crew haul them in (about 10 s with the boom near square: Rigging's visual
 * check, 14 November). Sailing, which never holds an angle, is untouched.
 */
const fresh = () => new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [] } as Settings, 1);
describe('The showroom shows her trimmed at once (sim/world.ts idle)', () => {
  it('the first frame at 45° true: the boom in close-hauled trim, not eased square', () => {
    const w = fresh(); w.idle(DT, 45);
    expect(Math.abs(w.user.boom)).toBeLessThan(25);
    const t0 = performance.now(); fresh().idle(DT, 45); expect(performance.now() - t0).toBeLessThan(1000); // (once per boat shown)
  });
  it('and it holds: the next seconds move the boom only as the crew fine-trim', () => {
    const w = fresh(); w.idle(DT, 45); const b0 = w.user.boom;
    for (let i = 0; i < 3 / DT; i++) w.idle(DT, 45);
    expect(Math.abs(w.user.boom - b0)).toBeLessThan(8);
  });
  it('with no angle held (not the showroom), a cold start is as before: the crew still haul in from eased sheets', () => {
    const w = fresh(); w.idle(DT);
    expect(Math.abs(w.user.boom)).toBeGreaterThan(40);
  });
});
