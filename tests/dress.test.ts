import { describe, expect, it } from 'vitest';
import { dressWarm, kitFor } from '../src/render/crewBody';

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
});
