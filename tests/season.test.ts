import { beforeEach, describe, expect, it } from 'vitest';
import { keepSeasonRace, seasonResults, seasons, standings, throwouts, type SeasonResult, type Series } from '../src/club/season';
import results from '../src/boat/data/sf-folkboat-results.json';

/** The season: the Seaweed Soup 2025–26, scored as a series (club/season.ts). */
const mem = new Map<string, string>();
beforeEach(() => { mem.clear(); (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }; });

// the real 2025–26 fleet's published points, as a series result each race
type B = { boat: string; key: string; points: number | null; code: string | null };
const ev = (results as any).events.find((e: any) => e.id === 'GGYC_T008047221');
const real = (no: number): SeasonResult => ({ at: `r${no}`, scores: (ev.races.find((r: any) => r.raceNo === no).boats as B[]).map(b => ({ sail: b.key, name: b.boat, hull: '#fff', you: false, points: b.points!, code: b.code })) });

describe('the season', () => {
  const S = seasons()[0];
  it('is the real 2025–26 Seaweed Soup: five race days, race 3 abandoned, race 2 on the committee\'s course', () => {
    expect(S.races.map(r => r.date)).toEqual(['2025-11-01', '2025-12-06', '2026-01-03', '2026-02-07', '2026-03-07']);
    expect(S.races.map(r => r.start)).toEqual(['12:03', '12:06', '12:00', '12:03', '12:03']);
    expect(S.races.find(r => r.no === 3)!.abandoned).toBe(true);
    expect(S.races.find(r => r.no === 2)!.courseId).toBe('rc'); expect(S.races.find(r => r.no === 5)!.realId).toBeTruthy();
    expect(S.fleet.length + 1).toBe(8); // (8 entries, as the real fleet)
  });
  it('the real fleet\'s points scored as a series: no throwout with race 3 abandoned (four of five sailed)', () => {
    const res = Object.fromEntries([1, 2, 4, 5].map(n => [n, real(n)]));
    const { rows, discards } = standings(S, res);
    expect(discards).toBe(0);
    expect(rows.map(r => [r.name, r.nett])).toEqual([['POLPERRO', 8], ['JOSEPHINE', 14], ['CIRCLE SEA', 15], ['FAITH', 16], ['THEA', 21], ['SHANTY', 25], ['CICCIOLINA', 26], ['RøDHæTTE', 36]]);
  });
  it('with all five sailed, one throwout: the worst, and of equal worst the earliest', () => {
    const five: Series = { ...S, races: S.races.map(r => ({ ...r, abandoned: false })) };
    const res = Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, n === 3 ? real(5) : real(n)]));
    const { rows, discards } = standings(five, res);
    expect(discards).toBe(1); expect(throwouts(4, 5)).toBe(0); expect(throwouts(5, 5)).toBe(1);
    const shanty = rows.find(r => r.name === 'SHANTY')!; // 9, 9, 6, 1, 6: the race-1 9 goes
    expect(shanty.races[1].out).toBe(true); expect(shanty.races[2].out).toBe(false); expect(shanty.nett).toBe(22);
  });
  it('ties: most firsts first (A8.1), then the last race (A8.2)', () => {
    const mk = (pts: Record<string, number[]>): Record<number, SeasonResult> => Object.fromEntries([1, 2, 4, 5].map((n, i) => [n, { at: '', scores: Object.entries(pts).map(([k, p]) => ({ sail: k, name: k, hull: '', you: false, points: p[i], code: null })) }]));
    // A and B both on 10: A has a first, B none → A
    let r = standings(S, mk({ A: [1, 3, 3, 3], B: [2, 2, 3, 3], C: [4, 4, 4, 4] })).rows;
    expect(r.map(x => x.sail)).toEqual(['A', 'B', 'C']); expect(r[0].rank).toBe(1); expect(r[1].rank).toBe(2);
    // the same scores in another order: the last race decides
    r = standings(S, mk({ A: [1, 2, 3, 4], B: [4, 3, 2, 1] })).rows;
    expect(r.map(x => x.sail)).toEqual(['B', 'A']);
  });
  it('a boat missing from a race scores DNC, entries + 1', () => {
    const res = { 1: real(1), 2: { at: '', scores: real(2).scores.filter(s => s.name !== 'POLPERRO') } };
    const p = standings(S, res).rows.find(r => r.name === 'POLPERRO')!;
    expect(p.races[2]).toEqual({ points: 9, code: 'DNC', out: false });
  });
  it('keeps your races (sailing one again replaces it)', () => {
    keepSeasonRace(S.id, 1, real(1)); keepSeasonRace(S.id, 1, real(5));
    expect(Object.keys(seasonResults(S.id))).toEqual(['1']); expect(seasonResults(S.id)[1].at).toBe('r5');
  });
});
