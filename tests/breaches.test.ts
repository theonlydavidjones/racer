import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { breachLine, withHearings } from '../src/rules/tally';

// The results' rules line (FTUE audit item 18, 21 Nov 2026): "Fouls you committed: 0" sat above protests that found
// she broke rules 12 and 16.1 and took her turns. Under RRS 44.1 a boat that takes a penalty has still broken the rule;
// the penalty only spares her a further one. So every breach is counted, with the penalties taken beside it.
const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 1, current: 'slack', ...o });
const racing = (w: World) => { w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; } };
const touch = (w: World) => { const m = w.C.marks[0].p; w.user.x = m.x; w.user.y = m.y + 1; w.boats[1].x = m.x + 200; w.boats[1].y = m.y; w.step(DT); w.drainEvents(); };

describe('the rules you broke, in the results', () => {
  for (const judging of ['umpired', 'protests'] as const) {
    it(`${judging}: a mark touch is a breach of rule 31 whether or not the turn is done, and the turn counts once done`, () => {
      const w = new World(SS2, settings({ judging }), 3); racing(w);
      touch(w);
      expect(w.user.penalty).toBeGreaterThan(0);
      w.step(DT);
      expect(w.breaches).toEqual([expect.objectContaining({ rule: '31', owing: true, taken: false })]);
      w.user.penalty = 0; w.step(DT); // (her turn done)
      expect(w.breaches[0].taken).toBe(true);
      expect(breachLine(w.breaches, 0)).toBe('Rules you broke: 1 (rule 31). Penalties taken: 1. Broken against you: 0.');
    });
  }

  it('turns left undone at the finish: the breach stands with no penalty taken', () => {
    const w = new World(SS2, settings(), 3); racing(w);
    touch(w); w.step(DT);
    w.user.finished = true; w.user.penalty = 0; w.step(DT); // (finished first: turns after it don't count, 44.2)
    expect(w.breaches[0].taken).toBe(false);
  });

  it('the line: none; some taken; one left without a penalty', () => {
    expect(breachLine([], 2)).toBe('Rules you broke: none. Broken against you: 2.');
    expect(breachLine([{ rule: '12', taken: true }, { rule: '16.1', taken: true }], 0)).toBe('Rules you broke: 2 (rules 12 and 16.1). Penalties taken: 2. Broken against you: 0.');
    expect(breachLine([{ rule: '10', taken: true }, { rule: '18.2(b)', taken: false }, { rule: '31', taken: false }], 1))
      .toBe('Rules you broke: 3 (rules 10, 18.2(b) and 31). Penalties taken: 1. No penalty taken for rules 18.2(b) and 31. Broken against you: 1.');
  });

  it("the hearings' findings fold in: one incident is one breach, and a protest's recorded turns count", () => {
    const bs = [{ t: 100, rule: '16.1', owing: false, taken: false }];
    const out = withHearings(bs, [{ t: 100, rule: '16', taken: true }, { t: 40, rule: '12', taken: true }, { t: 200, rule: null, taken: false }]);
    expect(out).toEqual([{ t: 40, rule: '12', taken: true }, expect.objectContaining({ t: 100, rule: '16.1', taken: true })]);
    expect(breachLine(out, 0)).toBe('Rules you broke: 2 (rules 12 and 16.1). Penalties taken: 2. Broken against you: 0.');
  });
});
