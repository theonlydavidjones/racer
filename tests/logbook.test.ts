import { beforeEach, describe, expect, it } from 'vitest';
import { addLog, dropLog, loadLog, logFor, record, type LogEntry } from '../src/boat/logbook';

// (w038, docs/SMALL-TASKS.md: the logbook had no tests. Kept in this browser, so a Map stands in for localStorage.)
const store = new Map<string, string>();
let full = false;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
  removeItem: k => { store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0
};
const KEY = 'fbsim-logbook-v1';

let n = 0;
/** A race (or with `kind`, a cruise) in her log, each later than the last. */
const entry = (o: Partial<LogEntry> = {}): LogEntry => ({
  boatId: 'kestrel', at: new Date(Date.UTC(2026, 10, 1) + 60_000 * n++).toISOString(), day: '2026-11-01', time: '13:35',
  kind: 'race', title: 'ss2', skipper: 'you', crew: 'generic AI', wind: 'W 12 kt', ...o
});
const races = (...places: (number | string)[]) => places.map(p => typeof p === 'number' ? entry({ place: p, of: 8 }) : entry({ code: p }));

beforeEach(() => { store.clear(); full = false; n = 0; });

describe('her race record (logbook.ts record)', () => {
  it('counts races, wins, podiums (first to third) and the average place', () => {
    expect(record(races(1, 3, 2, 5, 4, 1))).toEqual({ races: 6, wins: 2, podiums: 4, avg: 16 / 6 });
  });
  it('a race cancelled (CXL) is no race at all: not counted, not averaged', () => {
    expect(record(races(2, 'CXL', 4))).toEqual({ races: 2, wins: 0, podiums: 1, avg: 3 });
  });
  it('a race scored DSQ, RET or ZFP, or not finished, counts as raced but has no place to average', () => {
    const r = record([...races(1, 'DSQ', 'RET'), entry({ code: 'unfinished' }), entry({ place: 3, of: 8 })]);
    expect(r).toEqual({ races: 5, wins: 1, podiums: 2, avg: 2 });
  });
  it('her cruises are no part of it', () => {
    expect(record([...races(2), entry({ kind: 'cruise', title: 'to Sausalito', nm: 4.2, arrived: true })])).toEqual({ races: 1, wins: 0, podiums: 1, avg: 2 });
  });
  it('no races: nothing, and no average', () => {
    expect(record([])).toEqual({ races: 0, wins: 0, podiums: 0, avg: null });
    expect(record(races('CXL', 'CXL')).avg).toBeNull();
    expect(record(races('DSQ')).avg).toBeNull();
  });
  it('a tie for a place is that place: two boats tied first both have a win', () => {
    expect(record([entry({ place: 1, of: 6, tied: true }), entry({ place: 4, of: 6 })])).toEqual({ races: 2, wins: 1, podiums: 1, avg: 2.5 });
  });
});

describe('the log kept (addLog, loadLog, logFor, dropLog)', () => {
  it('adds entries to what\'s kept, in order', () => {
    addLog(races(1, 2)); addLog(races(3));
    expect(loadLog().map(e => e.place)).toEqual([1, 2, 3]);
  });
  it('keeps the newest 600, dropping the oldest', () => {
    addLog(Array.from({ length: 590 }, (_, i) => entry({ place: 1, title: `r${i}` })));
    addLog(Array.from({ length: 15 }, (_, i) => entry({ place: 2, title: `n${i}` })));
    const all = loadLog();
    expect(all.length).toBe(600);
    expect(all[0].title, 'the five oldest gone').toBe('r5');
    expect(all[599].title).toBe('n14');
  });
  it('a batch bigger than the cap keeps only its own last 600', () => {
    addLog(races(9));
    addLog(Array.from({ length: 650 }, (_, i) => entry({ title: `b${i}` })));
    const all = loadLog();
    expect(all.length).toBe(600);
    expect(all[0].title).toBe('b50');
  });
  it('adding nothing writes nothing', () => {
    addLog([]);
    expect(store.has(KEY)).toBe(false);
  });
  it('storage full or unavailable: the race is lost, not the page (no throw), and what was kept stays', () => {
    addLog(races(1));
    full = true;
    expect(() => addLog(races(2))).not.toThrow();
    expect(() => dropLog('kestrel')).not.toThrow();
    expect(loadLog().map(e => e.place)).toEqual([1]);
  });
  it('a broken or foreign value reads as an empty log', () => {
    store.set(KEY, '{not json'); expect(loadLog()).toEqual([]);
    store.set(KEY, '{"a":1}'); expect(loadLog()).toEqual([]);
  });
  it('dropLog forgets one boat\'s log and keeps the others\'', () => {
    addLog([...races(1, 2), entry({ boatId: 'tern', place: 5 }), ...races(3)]);
    dropLog('kestrel');
    expect(loadLog().map(e => [e.boatId, e.place])).toEqual([['tern', 5]]);
    dropLog('nobody');
    expect(loadLog().length).toBe(1);
  });
  it('logFor: one boat\'s entries, newest first', () => {
    addLog([entry({ place: 1 }), entry({ boatId: 'tern', place: 7 }), entry({ place: 2 }), entry({ place: 3 })]);
    expect(logFor('kestrel').map(e => e.place)).toEqual([3, 2, 1]);
  });
});
