import { describe, expect, it } from 'vitest';
import real from '../src/environment/data/sf-real-days.json';
import { dayWeather } from '../src/environment/weather';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { wrap } from '../src/core/math';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { World } from '../src/sim/world';

const R = real as unknown as { wind: Record<string, string>; swell: Record<string, number[]>; forecast: Record<string, unknown> };
const at = (date: string, time: string) => sfLocalToUtcMin(date, time);

describe('the real day: what was observed', () => {
  it('6 December 2025 (a Seaweed Soup race day) was a northerly, about 10–14 kt at Fort Point all afternoon', () => {
    const wx = dayWeather('2025-12-06');
    expect(wx.source).toBe('observed'); expect(wx.kind).toBe('north');
    const b = wx.at(at('2025-12-06', '13:00'));
    expect(Math.abs(wrap(b.from - 350))).toBeLessThan(25);
    expect(b.kt / 1.25).toBeGreaterThan(9); expect(b.kt / 1.25).toBeLessThan(15); // the station reading (open water is 25% more)
  });
  it('the real shifts: the direction moves through the afternoon, sample to sample', () => {
    const wx = dayWeather('2026-11-07'), dirs: number[] = [];
    for (let m = 0; m < 240; m += 6) dirs.push(wx.at(at('2026-11-07', '11:00') + m).from);
    expect(Math.max(...dirs.map(d => Math.abs(wrap(d - dirs[0]))))).toBeGreaterThan(20); // that day the morning northerly gave way to the westerly
  });
  it('the observed swell at the Bar buoy', () => {
    const wx = dayWeather('2025-12-06');
    expect(wx.realSwell).toBe(true); expect(wx.swell(1).hs).toBeCloseTo(R.swell['2025-12-06'][0], 5);
  });
  it('the observed days agree with the climatology: in December, more northerly days than westerly', () => {
    const dec = Object.keys(R.wind).filter(d => d.slice(5, 7) === '12').map(d => dayWeather(d).kind);
    expect(dec.filter(k => k === 'north').length).toBeGreaterThan(dec.filter(k => k === 'west').length);
  });
});

describe('the real day: the forecast, and the records', () => {
  it('a day in the coming week with no observations yet uses the National Weather Service forecast', () => {
    const date = Object.keys(R.forecast).find(d => !R.wind[d]);
    if (!date) return; // (the data is refreshed daily; there's always one)
    const wx = dayWeather(date);
    expect(wx.source).toBe('forecast'); expect(wx.issued).toBeTruthy();
    expect(wx.at(at(date, '13:00')).kt).toBeGreaterThan(0);
  });
  it('a day with neither is drawn from the records; a chosen kind is practice', () => {
    expect(dayWeather('2031-12-06').source).toBe('records');
    const p = dayWeather('2025-12-06', 'west');
    expect(p.source).toBe('chosen'); expect(p.kind).toBe('west'); expect(p.realSwell).toBe(false);
  });
  it('the race takes the real day\'s wind', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKt: 0, windKind: 'auto', tideDate: '2025-12-06', tideTime: '13:00', fleet: 1, opponents: ['stock:1'] }, 1);
    expect(w.realWind).toBe(true); expect(w.windKind).toBe('north');
    expect(Math.abs(wrap(w.wind.from - 350))).toBeLessThan(35);
  });
});
