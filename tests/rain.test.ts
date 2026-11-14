import { describe, expect, it } from 'vitest';
import { rainAt, rainLevel } from '../src/environment/rain';
import { setVisibility } from '../src/environment/weather';
import { sfLocalToUtcMin } from '../src/environment/tide';

/**
 * Real rain (environment/rain.ts): from the airports' reports (KSFO, KOAK: api.weather.gov) and the NWS forecast. The
 * owner, 13 Nov 2026: "I chose a cruise for this morning 11/13 at 11:00 am. it was heavily raining IRL at that time. in
 * game, no rain."
 */
describe('Real rain from the record (environment/rain.ts)', () => {
  it('13 Nov 2026 at 11:00, heavy rain on the Bay: KSFO and KOAK both reported heavy rain', () => {
    const r = rainAt(sfLocalToUtcMin('2026-11-13', '11:00'));
    console.log(r.says);
    expect(r.source).toBe('observed'); expect(r.level).toBe(2);
  });
  it('the same day at 15:00, after it had passed: none', () => {
    expect(rainAt(sfLocalToUtcMin('2026-11-13', '15:00')).level).toBe(0);
  });
  it('a day with no record: none (the sim makes no rain up)', () => {
    const r = rainAt(sfLocalToUtcMin('2024-07-13', '12:00'));
    expect(r.source).toBe('none'); expect(r.level).toBe(0);
  });
  it('the conditions panel: a set rain is that rain; real (or unset) is the record\'s; the set visibility only for a set rain', () => {
    const t = sfLocalToUtcMin('2026-11-13', '11:00');
    expect(rainLevel(0, t)).toBe(0); expect(rainLevel(1, t)).toBe(1); expect(rainLevel('real', t)).toBe(2); expect(rainLevel(undefined, t)).toBe(2);
    expect(setVisibility({ rain: 'real' }).m).toBe(Infinity); expect(setVisibility({ rain: 2 }).m).toBe(3100);
  });
});
