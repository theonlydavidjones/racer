// The World's tide stations are predicted once at load, not twice (tide.ts CurrentField.covering): the field is the
// same to the bit as the old way (predict over the race's window, then cover() predicts every station afresh).
import { describe, expect, it } from 'vitest';
import { CurrentField, stationsFor } from '../src/environment/tide';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';

const old = (now: number, from: number, to: number) => { const f = new CurrentField(stationsFor(from, to)); f.cover(now); return f; };
const same = (a: CurrentField, b: CurrentField) => {
  expect(b.stations.map(s => s.id)).toEqual(a.stations.map(s => s.id));
  expect(Object.is(a.from, b.from) && Object.is(a.to, b.to)).toBe(true);
  a.stations.forEach((s, i) => { const t = b.stations[i]; expect(t.t.length).toBe(s.t.length); for (let k = 0; k < s.t.length; k++) if (!Object.is(s.t[k], t.t[k]) || !Object.is(s.v[k], t.v[k])) throw new Error(`${s.id} at ${k}`); });
};

describe('the tide predicted once at load', () => {
  it('the same stations, times and speeds to the bit as predicting twice, for every kind of window', () => {
    const gun = Date.UTC(2026, 10, 14, 19, 0) / 60000;
    for (const lead of [0, 3, 5, 10, 60, 600]) for (const dg of [0, 37, 1440 * 11 + 133]) {
      const g = gun + dg, now = g - lead, from = g - lead - 30, to = g + 360;
      same(old(now, from, to), CurrentField.covering(now, from, to));
    }
    // windows that cover() keeps (a long one), and the edges of "certainly": the old way's result either way
    const g = gun, now = g - 5;
    for (const to of [g + 495 - 12, g + 495 - 6, g + 495, g + 495 + 6, g + 900]) same(old(now, now - 30, to), CurrentField.covering(now, now - 30, to));
  }, 120_000);

  it('a World reads the same tide as before, race and cruise, real current', () => {
    for (const o of [{ mode: 'race' }, { mode: 'sail', sailFrom: 'cityfront', sailTo: '' }, { mode: 'drill' }] as Partial<Settings>[]) for (const tideDate of ['2026-11-14', '2026-11-25']) {
      const S = { ...DEFAULT_SETTINGS, ...o, current: 'real', tideDate } as Settings;
      const w = new World(COURSES[0], S, 3, { freeSail: S.mode === 'sail' });
      const wt = (w as unknown as { tide: CurrentField; gunUtc: number; startAt: number; clockUtc: number });
      same(old(wt.clockUtc, wt.gunUtc - wt.startAt / 60 - 30, wt.gunUtc + 360), wt.tide);
    }
  }, 120_000);
});
