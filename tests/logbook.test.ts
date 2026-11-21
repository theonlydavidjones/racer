import { describe, it, expect, beforeEach } from 'vitest';
import { loadLog, addLog, logFor, dropLog, record, type LogEntry } from '../src/boat/logbook';

// w038: the logbook's record (wins, podiums, average place, CXL filter), addLog's cap of 600 and dropLog.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); }
};
const e = (o: Partial<LogEntry> = {}): LogEntry => ({
  boatId: 'a', at: '2026-11-01T10:00:00Z', day: '2026-11-01', time: '12:00', kind: 'race', title: 'Course 1',
  skipper: 'you', crew: 'generic AI', wind: 'W 14 kt', ...o
});

beforeEach(() => store.clear());

describe('record: a boat\'s race record in a line', () => {
  it('counts races, wins, podiums and the average place', () => {
    const r = record([e({ place: 1 }), e({ place: 3 }), e({ place: 5 }), e({ place: 3 })]);
    expect(r).toEqual({ races: 4, wins: 1, podiums: 3, avg: 3 });
  });
  it('ignores cruises and cancelled races (CXL)', () => {
    const r = record([e({ place: 2 }), e({ kind: 'cruise' }), e({ code: 'CXL' })]);
    expect(r.races).toBe(1); expect(r.avg).toBe(2);
  });
  it('counts a race with a code and no place as a race, not in the average', () => {
    const r = record([e({ place: 4 }), e({ code: 'DSQ' }), e({ code: 'RET' })]);
    expect(r).toEqual({ races: 3, wins: 0, podiums: 0, avg: 4 });
  });
  it('has no average with nothing placed', () => {
    expect(record([])).toEqual({ races: 0, wins: 0, podiums: 0, avg: null });
    expect(record([e({ code: 'DSQ' })]).avg).toBeNull();
  });
});

describe('loadLog and addLog', () => {
  it('is empty with nothing stored, and when the stored text is not a list', () => {
    expect(loadLog()).toEqual([]);
    store.set('fbsim-logbook-v1', '{"x":1}'); expect(loadLog()).toEqual([]);
    store.set('fbsim-logbook-v1', 'not json'); expect(loadLog()).toEqual([]);
  });
  it('appends, and adding none changes nothing', () => {
    addLog([e({ title: 'one' })]); addLog([]); addLog([e({ title: 'two' })]);
    expect(loadLog().map(x => x.title)).toEqual(['one', 'two']);
  });
  it('keeps only the newest 600', () => {
    addLog(Array.from({ length: 599 }, (_, i) => e({ title: `n${i}` })));
    addLog([e({ title: 'n599' }), e({ title: 'n600' }), e({ title: 'n601' })]);
    const all = loadLog();
    expect(all).toHaveLength(600);
    expect(all[0].title).toBe('n2'); expect(all[599].title).toBe('n601');
  });
});

describe('logFor and dropLog', () => {
  it('lists a boat\'s entries newest first', () => {
    addLog([e({ at: '2026-11-01T10:00:00Z', title: 'old' }), e({ boatId: 'b', title: 'other' }), e({ at: '2026-11-03T10:00:00Z', title: 'new' })]);
    expect(logFor('a').map(x => x.title)).toEqual(['new', 'old']);
    expect(logFor('nobody')).toEqual([]);
  });
  it('forgets one boat\'s log and keeps the others\'', () => {
    addLog([e({ title: 'mine' }), e({ boatId: 'b', title: 'hers' })]);
    dropLog('a');
    expect(loadLog().map(x => x.title)).toEqual(['hers']);
  });
});
