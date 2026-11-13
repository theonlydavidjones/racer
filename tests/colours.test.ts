import { describe, expect, it } from 'vitest';
import { colourHours, ensignDue } from '../src/boat/colours';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { slipsIn } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

/** Her ensign keeps its hours: 0800 to sunset, and entering or leaving harbour after dark (USPS; Seattle YC). */
describe('the ensign\'s hours', () => {
  const at = (d: string, t: string) => sfLocalToUtcMin(d, t);
  it('morning colours at 0800 local, evening colours at the day\'s sunset', () => {
    const h = colourHours(at('2026-11-14', '12:00'));
    expect(h.up).toBe(at('2026-11-14', '08:00'));
    // (sunset in San Francisco on 14 Nov is about 16:58 PST)
    expect(Math.abs(h.down - at('2026-11-14', '16:58'))).toBeLessThan(4);
    const s = colourHours(at('2026-06-21', '09:00')); // midsummer, daylight time: about 20:35 PDT
    expect(Math.abs(s.down - at('2026-06-21', '20:35'))).toBeLessThan(4);
  });
  it('flies between colours; down before 0800 (even after sunrise) and after sunset; up for entering or leaving harbour', () => {
    expect(ensignDue(at('2026-11-14', '07:30'), false, true)).toBe(false); // (sunrise is about 06:50: not yet 0800)
    expect(ensignDue(at('2026-11-14', '08:00'), false, false)).toBe(true);
    expect(ensignDue(at('2026-11-14', '16:30'), false, false)).toBe(true);
    expect(ensignDue(at('2026-11-14', '17:30'), false, false)).toBe(false); // at her slip, or out on the Bay after dark
    expect(ensignDue(at('2026-11-14', '17:30'), true, false)).toBe(false); // in harbour, tied up
    expect(ensignDue(at('2026-11-14', '17:30'), true, true)).toBe(true); // in harbour, under way: entering or leaving port
  });
  it('in the World: at her slip after sunset it\'s down, at noon it\'s up; racing she has none', () => {
    const slip = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!, boat = { ...DEFAULT_BOAT, marina: slip.marina, slip: slip.id };
    const w = (time: string, mode: 'sail' | 'race') => new World(COURSES[0], { ...DEFAULT_SETTINGS, mode, sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', tideTime: time, current: 'slack', fleet: 1, opponents: DEFAULT_SETTINGS.opponents.slice(0, 1) } as Settings, 1, { freeSail: mode === 'sail' });
    const night = w('18:30', 'sail'); expect(night.user.ensign).toBeTruthy(); expect(night.user.ensignNight).toBe(true);
    for (let i = 0; i < 40; i++) night.step(DT); expect(night.user.ensignNight).toBe(true);
    const noon = w('12:00', 'sail'); expect(noon.user.ensignNight).toBe(false);
    expect(w('12:00', 'race').user.ensign).toBeUndefined();
  });
});
