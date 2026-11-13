import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, PROTEST_HAIL, World } from '../src/sim/world';

// Protests (RRS Part 5): the hail and the red flag (60.2(a)(1)), under "On-the-water judging: Protests"
const SS2 = ss2 as unknown as CourseFile, TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 1, current: 'slack', ...o });
const racing = (w: World) => { w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; } };
const incident = (w: World, fouler: 'them' | 'you') => {
  const o = w.boats[1];
  w.userIncident = { vs: o.id, t: w.t, rule: '10', fouler: fouler === 'them' ? o.id : w.user.id, kind: 'contact' };
  return o;
};

describe('Protests: the hail and the red flag (RRS 60.2(a)(1))', () => {
  it('just after an incident you were in, the Hail offers "Protest!"; pressing it records the protest and flies your red flag', () => {
    const w = new World(SS2, settings({ judging: 'protests' }), 3); racing(w);
    const o = incident(w, 'them');
    expect(w.hailOption()).toMatchObject({ kind: 'protest', to: o, words: 'Protest!' });
    w.userHail();
    expect(w.protests).toEqual([expect.objectContaining({ by: w.user.id, vs: o.id, rule: '10', fouler: o.id, hailT: w.t, flagT: w.t })]);
    expect(w.user.protestFlag).toBe(true);
    expect(w.hailOption()?.kind).not.toBe('protest'); // (once is enough)
  });

  it('you may protest whatever the engine called: a protest against a boat it found no foul by records no rule', () => {
    const w = new World(SS2, settings({ judging: 'protests' }), 3); racing(w);
    const o = incident(w, 'you');
    expect(w.hailOption()?.kind).toBe('protest');
    w.userHail();
    expect(w.protests[0]).toMatchObject({ vs: o.id, rule: null, fouler: w.user.id });
  });

  it('only at the first reasonable opportunity: the offer lapses PROTEST_HAIL seconds after the incident', () => {
    const w = new World(SS2, settings({ judging: 'protests' }), 3); racing(w);
    incident(w, 'them');
    w.t += PROTEST_HAIL + 0.1;
    expect(w.hailOption()?.kind).not.toBe('protest');
  });

  it('umpired (the default for now), and in the practice area, there is no protest hail', () => {
    const um = new World(SS2, settings(), 3); racing(um); incident(um, 'them');
    expect(um.hailOption()?.kind).not.toBe('protest');
    const pr = new World(TRAIN, settings({ judging: 'protests' }), 3); racing(pr); incident(pr, 'them');
    expect(pr.protestsOn).toBe(false);
    expect(pr.hailOption()?.kind).not.toBe('protest');
  });

  it('the flag flies until she is no longer racing', () => {
    const w = new World(SS2, settings({ judging: 'protests' }), 3); racing(w);
    incident(w, 'them'); w.userHail();
    w.step(DT);
    expect(w.user.protestFlag).toBe(true);
    w.user.retired = true; w.step(DT);
    expect(w.user.protestFlag).toBe(false);
  });
});
