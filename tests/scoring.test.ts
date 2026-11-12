import { describe, expect, it } from 'vitest';
import { ptsText, raceScores, scoreOrder, tenth } from '../src/rules/scoring';
import { rivalOf } from '../src/replay/versus';

const fleet = (n: number, o: Record<number, 'ZFP' | 'UFD' | 'BFD'> = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: i, finishT: 600 + i * 10, code: o[i] ?? null }));
const by = (s: ReturnType<typeof raceScores>) => new Map(s.map(x => [x.id, x]));

describe('scoring (RRS 2025–2028 Appendix A, 30.2 and 44.3(c))', () => {
  it('Low Point (A4): 1 for first, 2 for second…', () => {
    const s = by(raceScores(fleet(5)));
    expect([0, 1, 2, 3, 4].map(i => s.get(i)!.points)).toEqual([1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4].map(i => s.get(i)!.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('Z flag: 20% of the DNF score (entries + 1), to the nearest tenth, added to her own; nobody else moves', () => {
    // 10 boats: DNF 11, 20% = 2.2. First across with ZFP scores 3.2; the boat second across, on 2, wins
    const s = by(raceScores(fleet(10, { 0: 'ZFP' })));
    expect(s.get(0)!.points).toBe(3.2); expect(s.get(0)!.penalty).toBe(2.2); expect(s.get(0)!.across).toBe(1);
    expect(s.get(1)!.points).toBe(2); expect(s.get(1)!.rank).toBe(1);
    expect(s.get(2)!.points).toBe(3); expect(s.get(2)!.rank).toBe(2); // 3 beats 3.2
    expect(s.get(0)!.rank).toBe(3);
    // 5 boats: DNF 6, 20% = 1.2: ZFP third across scores 4.2, after the boat fourth across (4)
    const t = by(raceScores(fleet(5, { 2: 'ZFP' })));
    expect(t.get(2)!.points).toBe(4.2); expect(t.get(3)!.points).toBe(4); expect(t.get(3)!.rank).toBe(3); expect(t.get(2)!.rank).toBe(4);
  });

  it('equal points share a rank ("two boats may receive the same score")', () => {
    // 4 boats: DNF 5, 20% = 1.0: ZFP first across scores 2, the same as the boat second across
    const s = by(raceScores(fleet(4, { 0: 'ZFP' })));
    expect(s.get(0)!.points).toBe(2); expect(s.get(1)!.points).toBe(2);
    expect(s.get(0)!.rank).toBe(1); expect(s.get(1)!.rank).toBe(1); expect(s.get(2)!.rank).toBe(3);
  });

  it('the penalty never makes her score worse than DNF; disqualified boats score DNF', () => {
    const s = by(raceScores(fleet(3, { 2: 'ZFP', 1: 'BFD' })));
    expect(s.get(1)!.points).toBe(4); expect(s.get(1)!.rank).toBe(3);
    // the ZFP boat was second of the boats scored by finishing (the BFD boat isn't one): 2 + 0.8 = 2.8, under the DNF 4
    expect(s.get(2)!.points).toBe(2.8);
    const one = by(raceScores([{ id: 0, finishT: 500, code: 'ZFP' }], 1)); // a fleet of one: DNF 2, 1 + 0.4
    expect(one.get(0)!.points).toBe(1.4);
    // last across in 10 boats: 10 + 2.2 would be worse than DNF (11), so she scores 11
    const capped = by(raceScores(fleet(10, { 9: 'ZFP' })));
    expect(capped.get(9)!.points).toBe(11); expect(capped.get(9)!.penalty).toBe(1);
  });

  it('rounding to the nearest tenth, 0.05 up; boats tied at the line share the places (A7); still racing has no score', () => {
    expect(tenth(2.25)).toBe(2.3); expect(tenth(2.24)).toBe(2.2); expect(tenth(1.2000000001)).toBe(1.2);
    expect(ptsText(3)).toBe('3'); expect(ptsText(3.2)).toBe('3.2');
    const s = by(raceScores([{ id: 0, finishT: 600, code: null }, { id: 1, finishT: 600, code: null }, { id: 2, finishT: 610, code: null }, { id: 3, finishT: null, code: null }]));
    expect(s.get(0)!.points).toBe(1.5); expect(s.get(1)!.points).toBe(1.5); expect(s.get(2)!.points).toBe(3);
    expect(s.get(3)!.points).toBeNull(); expect(s.get(3)!.rank).toBeNull();
    const order = scoreOrder([...s.values()], id => [600, 600, 610, null][id]).map(x => x.id);
    expect(order.at(-1)).toBe(3);
  });

  it('the replay measures you against the winner by points: not a Z-flag boat first across', () => {
    const sc = by(raceScores(fleet(10, { 0: 'ZFP' })));
    const I = { frames: [], you: 5, startTimes: [], marks: [], from: { x: 0, y: 0 }, legs: [],
      boats: fleet(10, { 0: 'ZFP' }).map(b => ({ id: b.id, name: `B${b.id}`, finishT: b.finishT, dsq: false, points: sc.get(b.id)!.points })) };
    expect(rivalOf(I)).toBe(1);
  });

  it('a Z-flag place waits on the boats still racing: projected in the order they\'re in now, and not final until settled', () => {
    // 10 boats; you (0) cross first with the Z flag (3.2 points), nobody else in yet; the others in order 1, 2, 3 …
    const boats = Array.from({ length: 10 }, (_, i) => ({ id: i, finishT: i === 0 ? 600 : null, code: (i === 0 ? 'ZFP' : null) as 'ZFP' | null, ahead: i }));
    let s = by(raceScores(boats));
    expect(s.get(0)!.points).toBe(3.2); expect(s.get(0)!.final).toBe(false);
    expect(s.get(0)!.rank).toBe(3); // the next two boats home will score 2 and 3
    // two more in: 2 and 3; she's settled at third (anyone else scores 4 or more)
    boats[1].finishT = 610; boats[2].finishT = 620;
    s = by(raceScores(boats));
    expect(s.get(0)!.final).toBe(true); expect(s.get(0)!.rank).toBe(3);
    expect(s.get(1)!.rank).toBe(1); expect(s.get(1)!.final).toBe(true);
    // without a penalty, the first boat home is settled at once
    const clean = by(raceScores(boats.map((b, i) => ({ ...b, code: null, finishT: i === 0 ? 600 : null }))));
    expect(clean.get(0)!.rank).toBe(1); expect(clean.get(0)!.final).toBe(true);
    // a retired boat scores DNF and takes no place
    const ret = by(raceScores([{ id: 0, finishT: null, code: 'RET' }, { id: 1, finishT: 600, code: null }]));
    expect(ret.get(0)!.points).toBe(3); expect(ret.get(1)!.points).toBe(1);
  });
});
