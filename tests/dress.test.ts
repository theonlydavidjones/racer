import { describe, expect, it } from 'vitest';
import { dress, dressWarm, kitFor } from '../src/render/crewBody';
import { rainLevel } from '../src/environment/rain';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { LL } from '../src/geo/geo';

/**
 * What the crew wear for the day (render/crewBody.ts): shorts and sneakers for about half of them on a warm, dry day
 * when they won't be soaked (the owner, 13 Nov 2026: 68 °F, 20 °C, or more); salopettes and sea boots otherwise.
 */
describe("The crew dress for the day's weather (render/crewBody.ts dressWarm, kitFor)", () => {
  const calm = { white: 0, steep: 0.03 };
  it('a hot day at Fort Point (6 Sep 2022, 34 °C), dry and not rough: dressed for it', () => {
    expect(dressWarm('2022-09-06', 0, calm)).toBe(true);
  });
  it('a summer day in the fog (11 Jul 2026, 13 °C at 11:00): salopettes', () => {
    expect(dressWarm('2026-07-11', 0, calm)).toBe(false);
  });
  it('rain set, or the sea throwing spray aboard (a fresh breeze\'s whitecaps, or short steep chop): salopettes', () => {
    expect(dressWarm('2022-09-06', 1, calm)).toBe(false);
    expect(dressWarm('2022-09-06', 0, { white: 0.008, steep: 0.03 })).toBe(false);
    expect(dressWarm('2022-09-06', 0, { white: 0.001, steep: 0.08 })).toBe(false);
    expect(dressWarm('2022-09-06', 0, { white: 0.004, steep: 0.05 })).toBe(true); // (a moderate breeze's few whitecaps: still dry)
  });
  it('on a warm day about half of a fleet\'s people are in shorts, each the same race to race', () => {
    const n = 300, shorts = Array.from({ length: n }, (_, i) => kitFor(i * 3 + 1, 0xc8372d, true).shorts).filter(Boolean).length;
    expect(shorts / n).toBeGreaterThan(0.35); expect(shorts / n).toBeLessThan(0.65);
    expect(kitFor(7, 0xc8372d, true).shorts).toBe(kitFor(7, 0xc8372d, true).shorts);
    expect(Array.from({ length: n }, (_, i) => kitFor(i, 0xc8372d, false).shorts).some(Boolean)).toBe(false);
  });
  it('where she is: on a day warm in the east Bay but cool at the Gate, shorts off Alameda, salopettes off Crissy Field', () => {
    // (find such a day on record: the warmest racing hour over 20 °C at Alameda and under it at Fort Point)
    const gate = LL(37.808, -122.465), alameda = LL(37.772, -122.30);
    let found = '';
    for (let d = 1; d <= 30 && !found; d++) { const date = `2024-09-${String(d).padStart(2, '0')}`; if (dressWarm(date, 0, calm, alameda) && !dressWarm(date, 0, calm, gate)) found = date; }
    console.log(`a day warm off Alameda and not at the Gate: ${found || 'none in Sep 2024'}`);
    expect(found).not.toBe('');
  });
  it('in the rain, hoods up: everyone in heavy rain, most in light; their usual heads on a dry day', () => {
    const heads = (wet: 0 | 1 | 2) => { dress.wet = wet; const h = Array.from({ length: 60 }, (_, i) => kitFor(1000 + i, 0x2b4f8a, false).head); dress.wet = 0; return h; };
    expect(heads(2).every(h => h === 'hood')).toBe(true);
    const light = heads(1).filter(h => h === 'hood').length / 60, dry = heads(0).filter(h => h === 'hood').length / 60;
    expect(light).toBeGreaterThan(0.6); expect(dry).toBeLessThan(0.35);
    dress.wet = 2; expect(Array.from({ length: 20 }, (_, i) => kitFor(2000 + i, 0, 'all').shorts).some(Boolean)).toBe(false); dress.wet = 0; // (no shorts in the rain, even everyone-in-shorts)
  });
  it('the owner\'s rainy morning (13 Nov 2026, 11:00): heavy rain at the gun, so no shorts and every hood up', () => {
    const rain = rainLevel('real', sfLocalToUtcMin('2026-11-13', '11:00'));
    expect(rain).toBe(2); expect(dressWarm('2026-11-13', rain, calm)).toBe(false);
  });
});
