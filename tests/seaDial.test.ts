import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World, describeTide } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { V, dot, dist, type Vec } from '../src/core/math';
import { CurrentField, stationSpeed, stationsFor, type TideStation } from '../src/environment/tide';

// the owner's spot: sailing on auto just west of the Golden Gate Bridge, the dial said "FLOOD 0.4" and the chart an ebb
const SPOT = LL(37 + 48.48 / 60, -(122 + 30.23 / 60));
const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'real', sea: 'flat' };
/** The dial's call: flood or ebb by the nearest NOAA station's flood direction (ui/hud.ts). */
const dialCall = (stations: TideStation[], p: Vec, c: Vec) => { const st = stations.reduce((a, s) => (dist(s.p, p) < dist(a.p, p) ? s : a)); return dot(c, V(st.flood)) >= 0 ? 'flood' : 'ebb'; };

describe('the tide on a long sail', () => {
  it('keeps turning past the race\'s window: no station holds its last value', () => {
    const w = new World(COURSES[0], S, 7, { freeSail: true }), ws = w as unknown as { t: number; tide: CurrentField; updateTide(): void };
    const seen = new Set<string>();
    // hour by hour, from the start out to 14 hours on (the race's window is six)
    for (let h = 0; h <= 14; h++) {
      ws.t = h * 3600; ws.updateTide();
      const now = w.clockUtc, c = w.currentAt(SPOT);
      // every station is on its own prediction for now (from the same harmonic constants), not stuck at its window's end
      const fresh = new Map(stationsFor(now - 30, now + 30).map(s => [s.id, s]));
      for (const st of ws.tide.stations) expect(stationSpeed(st, now), `${st.id} at ${h} h`).toBeCloseTo(stationSpeed(fresh.get(st.id)!, now), 3);
      // and the dial's call there is the nearest station's own: flood when it's flooding, ebb when it's ebbing
      const near = ws.tide.stations.reduce((a, s) => (dist(s.p, SPOT) < dist(a.p, SPOT) ? s : a)), kt = stationSpeed(near, now);
      if (Math.abs(kt) > 0.2) { expect(dialCall(ws.tide.stations, SPOT, c), `${h} h`).toBe(kt > 0 ? 'flood' : 'ebb'); seen.add(kt > 0 ? 'flood' : 'ebb'); }
    }
    expect([...seen].sort()).toEqual(['ebb', 'flood']);
  });

  it('tells the turn of the tide right all through a long sail (the description looks 8 hours ahead)', () => {
    const w = new World(COURSES[0], S, 7, { freeSail: true }), ws = w as unknown as { t: number; tide: CurrentField; updateTide(): void };
    const g0 = w.gunUtc, ref = new CurrentField(stationsFor(g0 - 60, g0 + 30 * 60));
    const bad: string[] = [];
    for (let m = 0; m <= 20 * 60; m += 20) {
      ws.t = m * 60; ws.updateTide(); const now = w.clockUtc; ref.setTime(now);
      const a = describeTide(ws.tide, w.C.center, now).label, b = describeTide(ref, w.C.center, now).label;
      if (a !== b) bad.push(`${m} min: ${a} | ${b}`);
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it('runs on smoothly across a fresh prediction, and keeps four hours behind', () => {
    const t0 = Date.parse('2026-07-11T18:00:00Z') / 60000, f = new CurrentField(stationsFor(t0, t0 + 360));
    const at = t0 + 600; f.cover(at - 1); f.setTime(at); const before = f.at(SPOT);
    f.cover(at); f.setTime(at); const same = f.at(SPOT); // (no change at an unchanged time)
    expect(same.x).toBeCloseTo(before.x, 6); expect(same.y).toBeCloseTo(before.y, 6);
    expect(f.from).toBeLessThanOrEqual(at - 1 - 4 * 60 + 1); expect(f.to).toBeGreaterThanOrEqual(at + 8 * 60);
  });

  it('a field past its window predicts on (CurrentField.cover)', () => {
    const t0 = Date.parse('2026-07-11T18:00:00Z') / 60000, f = new CurrentField(stationsFor(t0, t0 + 360));
    const later = t0 + 600; f.cover(later); f.setTime(later);
    const ref = new CurrentField(stationsFor(later - 60, later + 60)); ref.setTime(later);
    const a = f.at(SPOT), b = ref.at(SPOT);
    expect(a.x).toBeCloseTo(b.x, 3); expect(a.y).toBeCloseTo(b.y, 3);
  });
});
