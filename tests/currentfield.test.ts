import { describe, expect, it } from 'vitest';
import { CurrentField, stationsFor, sfLocalToUtcMin } from '../src/environment/tide';

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
  it('its shoals carry a weaker stream than San Pablo Strait outside, and it eases in without a step at the mouth', async () => {
    const { LL } = await import('../src/geo/geo');
    const t0 = sfLocalToUtcMin('2026-11-14', '00:00'), f = new CurrentField(stationsFor(t0, t0 + 1440));
    const peak = (lat: number, lon: number) => { let m = 0; for (let h = 0; h < 25; h += 0.25) { f.setTime(t0 + h * 60); const c = f.at(LL(lat, lon)); m = Math.max(m, Math.hypot(c.x, c.y) / 0.5144); } return m; };
    const strait = peak(37.962, -122.465), bay = peak(37.962, -122.505);
    expect(bay).toBeLessThan(0.6 * strait); // (USGS WRI 84-4339: a metre of water runs at about half a 7 m channel's speed)
    // across the mouth (here at 122.4744 W), 50 m steps from 300 m outside it: no jump bigger than a tenth of a knot
    let prev = peak(37.962, -122.4715), worst = 0;
    for (let lon = -122.472; lon > -122.49; lon -= 0.0005) { const v = peak(37.962, lon); worst = Math.max(worst, Math.abs(v - prev)); prev = v; }
    expect(worst).toBeLessThan(0.1);
  });
});
