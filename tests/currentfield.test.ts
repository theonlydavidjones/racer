import { describe, expect, it } from 'vitest';
import { CurrentField, sanQuentinTide, stationsFor, sfLocalToUtcMin } from '../src/environment/tide';
import { LL } from '../src/geo/geo';
import { onGround } from '../src/geo/shore';

describe('the current field across the race area', () => {
  it('at every NOAA station it is that station\'s own prediction (within 0.05 kt, through a whole tidal day)', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '06:00'), st = stationsFor(t0, t0 + 24 * 60), f = new CurrentField(st), own = new CurrentField(st);
    expect(st.length).toBeGreaterThan(30);
    let worst = 0;
    for (let h = 0; h < 24; h += 0.5) {
      f.setTime(t0 + h * 60); own.setTime(t0 + h * 60);
      st.forEach((s, i) => { const c = f.atShore(s.p), v = own.stationVec(i); worst = Math.max(worst, Math.hypot(c.x - v.x, c.y - v.y) / 0.5144); });
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe('San Rafael Bay', () => {
  it('Point San Quentin\'s tide matches NOAA\'s own predictions (within 10 minutes and 0.08 m)', () => {
    // NOAA CO-OPS, 9414873, high and low water, 14–15 November 2026, m above MLLW, GMT (fetched 2026-11-12)
    const noaa: [string, 'H' | 'L', number][] = [['2026-11-14T04:50Z', 'L', -0.027], ['2026-11-14T12:38Z', 'H', 1.325], ['2026-11-14T16:51Z', 'L', 1.033], ['2026-11-14T22:16Z', 'H', 1.569],
      ['2026-11-15T05:38Z', 'L', 0.031], ['2026-11-15T13:29Z', 'H', 1.326], ['2026-11-15T18:04Z', 'L', 1.018], ['2026-11-15T23:09Z', 'H', 1.47]];
    for (const [t, k, v] of noaa) {
      const ms = Date.parse(t);
      let best = 0, h = sanQuentinTide(ms).h;
      for (let d = -60; d <= 60; d++) { const x = sanQuentinTide(ms + d * 60e3).h; if (k === 'H' ? x > h : x < h) { h = x; best = d; } }
      expect(Math.abs(best)).toBeLessThanOrEqual(10);
      expect(Math.abs(h - v)).toBeLessThan(0.08);
    }
  });
  it('a dead end: inside, only the tide\'s filling and emptying (a tenth or two of a knot), handed over from the strait without a step', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '00:00'), f = new CurrentField(stationsFor(t0, t0 + 1440));
    const peak = (lat: number, lon: number) => { let m = 0; for (let h = 0; h < 25; h += 0.1) { f.setTime(t0 + h * 60); const c = f.at(LL(lat, lon)); m = Math.max(m, Math.hypot(c.x, c.y) / 0.5144); } return m; };
    for (const [a, b] of [[37.962, -122.4875], [37.972, -122.48]]) expect(onGround(LL(a, b))).toBe(false);
    expect(peak(37.962, -122.4875)).toBeLessThan(0.3);
    expect(peak(37.972, -122.48)).toBeLessThan(0.3);
    expect(peak(37.962, -122.465)).toBeGreaterThan(1.2); // (San Pablo Strait, outside the mouth)
    // across the mouth (here at 122.4744 W), 50 m steps from 300 m outside it: no jump bigger than a tenth of a knot
    let prev = peak(37.962, -122.4715), worst = 0;
    for (let lon = -122.472; lon > -122.489; lon -= 0.0005) { const v = peak(37.962, lon); worst = Math.max(worst, Math.abs(v - prev)); prev = v; }
    expect(worst).toBeLessThan(0.1);
  });
  it('floods into the bay as the tide rises', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '00:00'), f = new CurrentField(stationsFor(t0, t0 + 1440)), p = LL(37.966, -122.485);
    for (let h = 0; h < 24; h += 1) {
      const ms = (t0 + h * 60) * 60e3, { rise } = sanQuentinTide(ms); f.setTime(t0 + h * 60);
      const c = f.at(p); if (Math.abs(rise) > 0.05 / 3600) expect(Math.sign(c.x)).toBe(-Math.sign(rise)); // (in = west-north-west)
    }
  });
});
