import { describe, expect, it } from 'vitest';
import { numPickHtml, seqMinutes } from '../src/ui/numPick';
import { drillSeq } from '../src/club/practice';

/** The count up/down picker for a start sequence's minutes (the owner, 21 Nov 2026), in Practice and the start drill. */
describe('the sequence picker', () => {
  it('counts 1 to 5 minutes, its − and + shut at the ends', () => {
    expect([0, 1, 3, 5, 9].map(n => seqMinutes(n))).toEqual([5, 1, 3, 5, 5]); // (nothing set: RRS 26's five)
    expect(numPickHtml('seq', 1, 1, 5, 'min', 'x')).toMatch(/data-d="-1" aria-label="One less" disabled/);
    expect(numPickHtml('seq', 5, 1, 5, 'min', 'x')).toMatch(/data-d="1" aria-label="One more" disabled/);
    expect(numPickHtml('seq', 3, 1, 5, 'min', 'x')).not.toMatch(/disabled/);
  });
  it('a start drill under a flag other than P counts from two minutes, so its flag is flown (r275)', () => {
    expect(seqMinutes(1, 2)).toBe(2);
    expect(drillSeq(1, 'I')).toBe(2); expect(drillSeq(1, 'P')).toBe(1); expect(drillSeq(5, 'black')).toBe(5);
  });
});
