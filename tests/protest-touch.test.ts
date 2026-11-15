import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { PROTEST_REACT } from '../src/ai/conduct';
import { decide } from '../src/rules';

// Rule 31 under "On-the-water judging: Protests": a mark touch is any boat's to protest (60.2(a)), and the hearing
// decides it as a foul: her turn taken, no further penalty (60.5(c)(2)); not, disqualified.
const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 1, current: 'slack', judging: 'protests', ...o });
const racing = (w: World) => { w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; } };
/** `who` onto the first mark, `by` ten meters off her: one step, and she's touched it. */
function touch(w: World, who: 'you' | 'them') {
  const m = w.C.marks[0].p, t = who === 'you' ? w.user : w.boats[1], o = who === 'you' ? w.boats[1] : w.user;
  t.x = m.x; t.y = m.y + 1; o.x = m.x + 12; o.y = m.y + 6;
  w.step(DT); w.drainEvents();
  return { t, o };
}

describe('Rule 31 under protests', () => {
  it('a boat close by touches a mark: you may hail "Protest!" at her, and it goes to the hearing as rule 31', () => {
    const w = new World(SS2, settings(), 3); racing(w);
    const { t } = touch(w, 'them');
    expect(t.markTouch).toBeTruthy();
    expect(w.hailOption()).toMatchObject({ kind: 'protest', to: t, words: 'Protest!' });
    w.userHail();
    expect(w.protests).toEqual([expect.objectContaining({ by: w.user.id, vs: t.id, rule: '31', fouler: t.id, kind: 'mark' })]);
  });

  it('you touch a mark with an AI boat close by: she protests at once; skip your turn and the hearing disqualifies you, take it and there\'s no further penalty', () => {
    const w = new World(SS2, settings(), 3); racing(w);
    const { o } = touch(w, 'you');
    expect(w.user.penalty).toBeGreaterThan(0); // (a One-Turn Penalty, yours to take)
    for (let i = 0; i < (PROTEST_REACT + 0.5) / DT; i++) { w.step(DT); w.drainEvents(); }
    const p = w.protests.find(x => x.by === o.id)!;
    expect(p).toMatchObject({ vs: w.user.id, rule: '31', fouler: w.user.id, kind: 'mark', owed: true });
    expect(o.protestFlag).toBe(true);
    const you = { id: w.user.id, racing: false, retired: false };
    expect(decide(p, you).outcome).toBe('DSQ');
    expect(decide({ ...p, turnsT: w.t + 30 }, you).outcome).toBe('penaltyTaken');
  });

  it('nobody within four lengths: no protest', () => {
    const w = new World(SS2, settings(), 3); racing(w);
    const m = w.C.marks[0].p; w.user.x = m.x; w.user.y = m.y + 1; w.boats[1].x = m.x + 200; w.boats[1].y = m.y;
    for (let i = 0; i < (PROTEST_REACT + 0.5) / DT; i++) { w.step(DT); w.drainEvents(); }
    expect(w.user.penalty).toBeGreaterThan(0); expect(w.protests).toEqual([]);
  });

  it('an AI boat that touches and declines her turn (her skipper\'s conduct, 44.1): no penalty on her, and your protest disqualifies her', () => {
    const w = new World(SS2, settings(), 3); racing(w);
    (w as unknown as { conductRng: () => number }).conductRng = () => 0.9999; // (the rare skipper who doesn't take it)
    const { t } = touch(w, 'them');
    expect(t.penalty).toBe(0);
    w.userHail();
    const p = w.protests[0];
    expect(p).toMatchObject({ vs: t.id, rule: '31', owed: false });
    expect(decide(p, { id: t.id, racing: true, retired: false }).outcome).toBe('DSQ');
  });

  it('umpired: the turn is owed, and there\'s nobody\'s protest to make', () => {
    const w = new World(SS2, settings({ judging: 'umpired' }), 3); racing(w);
    touch(w, 'you');
    for (let i = 0; i < (PROTEST_REACT + 0.5) / DT; i++) { w.step(DT); w.drainEvents(); }
    expect(w.user.penalty).toBeGreaterThan(0); expect(w.protests).toEqual([]); expect(w.hailOption()?.kind).not.toBe('protest');
  });
});
