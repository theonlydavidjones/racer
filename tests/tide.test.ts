import { describe, expect, it } from 'vitest';
import data from '../src/environment/data/sf-currents.json';
import fitted from '../src/environment/data/fitted-currents.json';
import fx from './fixtures/noaa-currents.json';
import { predict, type Constituents } from '../src/environment/harmonics';
import { sfClock, sfLocalToUtcMin, stationSpeed, stationsFor } from '../src/environment/tide';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { World } from '../src/sim/world';
import { KT, V } from '../src/core/math';

const series = fx.series as unknown as Record<string, [string, number, string?][]>;
const minutes = (s: string) => Date.parse(s.replace(' ', 'T') + ':00Z') / 60000; // fixtures are GMT

describe('tidal current predictions match NOAA', () => {
  for (const st of data.stations.filter(s => s.kind === 'harmonic')) {
    it(`${st.id} ${st.name}: within ~0.1 kt of NOAA's 6-minute predictions`, () => {
      const ser = series[st.id], v = predict(st.z0!, st.hc as Constituents, ser.map(p => minutes(p[0]) * 60000));
      const err = ser.map((p, i) => v[i] - p[1]);
      const rms = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length);
      expect(rms).toBeLessThan(0.1);
      expect(Math.max(...err.map(Math.abs))).toBeLessThan(0.2);
    });
  }

  it('PCT0286 (off Crissy Field, a subordinate station): slacks and peaks match NOAA', () => {
    const ser = series.PCT0286;
    const st = stationsFor(minutes(ser[0][0]) - 60, minutes(ser[ser.length - 1][0]) + 60).find(s => s.id === 'PCT0286')!;
    for (const [t, v] of ser) expect(Math.abs(stationSpeed(st, minutes(t)) - v)).toBeLessThan(0.1);
  });
});

describe('San Francisco local time', () => {
  it('noon in November is 20:00 UTC (PST), noon in July is 19:00 UTC (PDT)', () => {
    expect(new Date(sfLocalToUtcMin('2026-11-14', '12:00') * 60000).toISOString()).toBe('2026-11-14T20:00:00.000Z');
    expect(new Date(sfLocalToUtcMin('2027-07-10', '12:00') * 60000).toISOString()).toBe('2027-07-10T19:00:00.000Z');
    expect(sfClock(sfLocalToUtcMin('2027-03-14', '13:30'))).toBe('13:30'); // the day the clocks change
  });
});

describe('real tide in the sim', () => {
  const world = (date: string, time: string) => new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', current: 'real', tideDate: date, tideTime: time, fleet: 0 }, 1);
  const along = (c: { x: number; y: number }, dir: number) => (c.x * V(dir).x + c.y * V(dir).y) / KT;

  it('Sat 14 Nov 2026: flood around 12:45, big ebb around 18:00 local (as NOAA predicts)', () => {
    // NOAA SFB1202 (GMT): max flood +1.45 kt 20:48, max ebb −1.67 kt 02:06 next day
    const flood = world('2026-11-14', '12:45'), ebb = world('2026-11-14', '18:00');
    const mid = flood.C.marks[0].p;
    expect(along(flood.currentAt(mid), 88)).toBeGreaterThan(0.4); // flooding (east)
    expect(along(ebb.currentAt(mid), 88)).toBeLessThan(-0.6); // ebbing (west)
  });

  it('the current changes during the race', () => {
    const w = world('2026-11-14', '14:30'), p = w.C.marks[0].p; // turning from flood to ebb
    const a = w.currentAt(p);
    for (let i = 0; i < 60 * 60 * 30; i++) w.step(); // half an hour
    const b = w.currentAt(p);
    expect(Math.hypot(b.x - a.x, b.y - a.y) / KT).toBeGreaterThan(0.05);
    expect(w.clock).toMatch(/^14:5\d$/); // 3-minute sequence then ~27 minutes of racing
  }, 180_000);

  it('weaker near the Cityfront shore than out in the middle', () => {
    const w = world('2026-11-14', '18:00');
    const line = w.C.center, out = w.C.marks[0].p;
    expect(Math.hypot(w.currentAt(line).x, w.currentAt(line).y)).toBeLessThan(Math.hypot(w.currentAt(out).x, w.currentAt(out).y));
  });

  it('the summary reads like a sailor would say it', () => {
    expect(world('2026-11-14', '18:00').cur.label).toMatch(/^(Ebb|Flood|Slack)/);
  });
});

describe('every current station has its axis', () => {
  it('a flood and an ebb direction at every station in the field (NOAA leaves some out: the major axis stands in)', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '06:00');
    for (const s of stationsFor(t0, t0 + 60)) { expect(Number.isFinite(s.flood), s.id).toBe(true); expect(Number.isFinite(s.ebb), s.id).toBe(true); }
  });
  it('Richardson Bay (fitted by the sim to NOAA\'s 2012 record): weak, as measured, and with a flood and an ebb a day', () => {
    const t0 = Date.UTC(2012, 7, 1), times = Array.from({ length: 24 * 14 * 10 }, (_, i) => t0 + i * 6 * 60000);
    const st = (fitted as unknown as { stations: { id: string; z0: number; hc: Constituents }[] }).stations.find(s => s.id === 'SFB1219')!;
    const v = predict(st.z0, st.hc, times), max = Math.max(...v), min = Math.min(...v);
    // the record (55 days, near-surface bin): peaks to +0.88 and −0.94 kt, median daily peaks about 0.7–0.8 kt
    expect(max).toBeGreaterThan(0.3); expect(max).toBeLessThan(1.0); expect(min).toBeLessThan(-0.3); expect(min).toBeGreaterThan(-1.0);
  });
});
