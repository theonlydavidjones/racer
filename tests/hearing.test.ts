import { describe, expect, it } from 'vitest';
import { decide, hearings, raceScores, type ProtestRec } from '../src/rules';

// Protest hearings (RRS Part 5), decided on the facts the sim knows (the owner's choice: exact fact-finding)
const P = (o: Partial<ProtestRec> = {}): ProtestRec => ({ by: 1, vs: 2, t: 100, rule: '10', fouler: 2, kind: 'contact', hailT: 102, flagT: 102, owed: false, turnsT: null, ...o });
const racingNo = { id: 2, racing: false, retired: false };

describe('a protest hearing', () => {
  it('she broke rule 10 and didn\'t take her penalty: disqualified (60.5(c))', () => {
    expect(decide(P(), racingNo).outcome).toBe('DSQ');
  });
  it('she took her turns: no further penalty (60.5(c)(2))', () => {
    expect(decide(P({ owed: true, turnsT: 130 }), racingNo).outcome).toBe('penaltyTaken');
  });
  it('she took them on but finished without doing them: disqualified; still racing with them to do: not decided yet', () => {
    expect(decide(P({ owed: true }), racingNo).outcome).toBe('DSQ');
    expect(decide(P({ owed: true }), { ...racingNo, racing: true }).outcome).toBe('pending');
  });
  it('no rule broken by her (the facts found show none): dismissed', () => {
    expect(decide(P({ rule: null, fouler: 1 }), racingNo).outcome).toBe('dismissed');
  });
  it('exonerated (43.1): no penalty', () => {
    expect(decide(P({ exonerated: true }), racingNo).outcome).toBe('exonerated');
  });
  it('hailed or flagged too late (not at the first reasonable opportunity, 60.2(a)(1)): invalid', () => {
    expect(decide(P({ hailT: 160 }), racingNo).outcome).toBe('invalid');
    expect(decide(P({ flagT: null }), racingNo).outcome).toBe('invalid');
  });
  it('she retired: nothing to decide', () => {
    expect(decide(P(), { ...racingNo, retired: true }).outcome).toBe('retired');
  });
  it('two protests about the same incident against one boat are one hearing (63.2(b)); a valid one stands', () => {
    const h = hearings([P({ by: 1, hailT: 160 }), P({ by: 3 })], () => racingNo);
    expect(h.decisions).toHaveLength(1);
    expect(h.decisions[0].outcome).toBe('DSQ');
    expect(h.dsq.get(2)).toBe('10');
  });
  it('a disqualified boat scores entries + 1 and the boats behind her move up (A5.2, A6.1)', () => {
    const s = raceScores([{ id: 1, finishT: 10, code: null }, { id: 2, finishT: 20, code: 'DSQ' }, { id: 3, finishT: 30, code: null }]);
    expect(s.map(x => x.points)).toEqual([1, 4, 2]);
  });
});
