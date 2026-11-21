import { describe, expect, it } from 'vitest';
import { rivals } from '../src/ui/rivals';
import { situationText } from '../src/rules/explain';

/** #19 of the first-hour audit: her rule notes are never about herself, nor a ghost; a ghost isn't a boat in the race. */
describe('the boats her rule notes are about', () => {
  it('never herself, however she is sailed (on the AI\'s skipper she isn\'t marked the user\'s)', () => {
    const her: { no: string; isUser?: boolean } = { no: 'USA 000', isUser: false }, a: { no: string; isUser?: boolean } = { no: 'USA 87' }, b: { no: string; isUser?: boolean } = { no: 'USA 104' };
    expect(rivals([her, a, b], her)).toEqual([a, b]);
    expect(rivals([{ ...her, isUser: true }, a], her)).toEqual([a]);
  });
  it('in a race sailed again with its ghost: no note names her own number, and the ghost is no boat of the race', async () => {
    const { COURSES } = await import('../src/courses/registry');
    const { DEFAULT_SETTINGS } = await import('../src/settings');
    const { DT, World } = await import('../src/sim/world');
    const S = { ...DEFAULT_SETTINGS, mode: 'race' as const, course: COURSES.find(c => c.group)!.id, windKind: 'west' as const, windKt: 12, tideDate: '2026-11-14', current: 'slack', traffic: 0 as const };
    const w = new World(COURSES.find(c => c.group)!, S, 7);
    // (the race the ghost is raced in is the same race: its boats are the fleet and her, nothing for the ghost)
    expect(w.boats.length).toBe(1 + S.opponents.length);
    const u = w.user; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; // (her on the AI's skipper, as ghost.cjs sails her)
    const named: string[] = [];
    for (let s = 0; s < 360; s++) {
      for (let i = 0; i < Math.round(1 / DT); i++) w.step(DT);
      for (const o of rivals(w.boats, u)) {
        if (Math.hypot(u.x - o.x, u.y - o.y) > 90) continue;
        const r = w.rights(u, o); if (!r.rule) continue;
        named.push(situationText(r.rule, r.kc === u, o.no));
      }
    }
    expect(named.length).toBeGreaterThan(0); // (she met boats: the notes were made)
    expect(named.filter(t => t.includes(u.no))).toEqual([]);
  }, 300000);
});
