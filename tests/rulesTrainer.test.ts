import { describe, expect, it } from 'vitest';
import { CASES } from '../src/rules/cases';
import { caseChoices } from '../src/ui/rulesTrainer';

describe('the Rules trainer\'s Cases', () => {
  it('each Case for teaching can be answered from its own choices, and pauses while its boats are on the water', () => {
    const T = CASES.filter(c => c.teach);
    expect(T.length).toBeGreaterThanOrEqual(12);
    for (const c of T) {
      expect(caseChoices(c), `Case ${c.case}`).toContain(c.answer.who);
      for (const b of c.boats) expect(b.frames[0].t, `Case ${c.case} ${b.letter}`).toBeLessThanOrEqual(c.momentT);
      expect(c.answer.line.split(' ').length, `Case ${c.case}: one line`).toBeLessThanOrEqual(30);
    }
  });
});
