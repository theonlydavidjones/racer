import { describe, expect, it, vi } from 'vitest';
import { rainAt, rainLevel } from '../src/environment/rain';
import { setVisibility } from '../src/environment/weather';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { loadSettings } from '../src/settings';
import data from '../src/environment/data/sf-rain.json';

/**
 * Real rain (environment/rain.ts): the airports' reports (KSFO, KOAK: the ASOS archive from 2021, and the NWS API), the
 * NWS forecast, and the airports' climate by month. The owner, 13 Nov 2026: "I chose a cruise for this morning 11/13 at
 * 11:00 am. it was heavily raining IRL at that time. in game, no rain."
 */
const at = (d: string, t: string) => rainAt(sfLocalToUtcMin(d, t));
describe('Real rain from the record (environment/rain.ts)', () => {
  it('13 Nov 2026 at 11:00, heavy rain on the Bay: both airports reported heavy rain', () => {
    const r = at('2026-11-13', '11:00');
    expect(r.source).toBe('observed'); expect(r.level).toBe(2);
    expect(at('2026-11-13', '12:15').level).toBe(2);
  });
  it('the same day: light early, dry by mid-afternoon', () => {
    expect(at('2026-11-13', '08:15').level).toBe(1);
    expect(at('2026-11-13', '15:00').level).toBe(0);
  });
  it('a dry day in the record is dry, observed (the archive from 2021)', () => {
    const r = at('2024-07-13', '12:00');
    expect(r.source).toBe('observed'); expect(r.level).toBe(0);
  });
  it('a wet winter day in the archive: the atmospheric river of 4 February 2024 rained on the Bay', () => {
    const hours = Array.from({ length: 24 }, (_, h) => at('2024-02-04', `${String(h).padStart(2, '0')}:30`).level);
    expect(hours.filter(l => l > 0).length).toBeGreaterThan(8);
  });
  it('a day with no record: the airports\' climate for its month, the same draw for everyone', () => {
    const days = (month: string) => Array.from({ length: 300 }, (_, i) => `2019-${month}-${String(1 + i % 28).padStart(2, '0')}`).filter((d, i, a) => a.indexOf(d) === i);
    const wetShare = (month: string) => { const ds = days(month); return ds.filter(d => [9, 11, 13, 15].some(h => at(d, `${h}:00`).level > 0)).length / ds.length; };
    expect(at('2019-12-05', '12:00').source).toBe('climate');
    expect(wetShare('12')).toBeGreaterThan(wetShare('07') + 0.1); // (the wet season against the dry)
    expect(at('2019-12-05', '12:00')).toEqual(at('2019-12-05', '12:00'));
  });
  it('the forecast: rain only where the chance is 50% or more or the forecast calls it likely', () => {
    const D = data as unknown as { forecast: Record<string, { pop: (number | null)[]; code: (number | null)[]; likely?: (number | null)[] }> };
    for (const [date, f] of Object.entries(D.forecast)) for (let h = 0; h < 24; h++) {
      const t = `${String(h).padStart(2, '0')}:30`, r = at(date, t);
      if (r.source !== 'forecast') continue;
      if (r.level) expect((f.pop[h] ?? 0) >= 50 || !!f.likely?.[h]).toBe(true);
    }
  });
  it('the conditions panel: a set rain is that rain; real (or unset) is the record\'s', () => {
    const t = sfLocalToUtcMin('2026-11-13', '11:00');
    expect(rainLevel(0, t)).toBe(0); expect(rainLevel(1, t)).toBe(1); expect(rainLevel('real', t)).toBe(2); expect(rainLevel(undefined, t)).toBe(2);
    expect(setVisibility({ rain: 2 }).m).toBe(3100); expect(setVisibility({ rain: 0 }).m).toBe(Infinity);
  });
  it('an older save\'s rain 0 (then the only "nothing set") becomes real, once; a set rain stays', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    store.set('fbsim-settings-v2', JSON.stringify({ rain: 0 })); expect(loadSettings().rain).toBe('real');
    store.set('fbsim-settings-v2', JSON.stringify({ rain: 2 })); expect(loadSettings().rain).toBe(2);
    store.set('fbsim-settings-v2', JSON.stringify({ rain: 0, rainV: 1 })); expect(loadSettings().rain).toBe(0);
    vi.unstubAllGlobals();
  });
});
