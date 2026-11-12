import { describe, expect, it } from 'vitest';
import { BAYS, CurrentField, bayTide, sanQuentinTide, stationsFor, sfLocalToUtcMin, wetBand } from '../src/environment/tide';
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
  const t0n = sfLocalToUtcMin('2026-11-01', '00:00');
  it('the bays\' tides match NOAA\'s own predictions (within 3 minutes and 2 cm): Point San Quentin and San Leandro Channel', () => {
    // NOAA CO-OPS high and low water, 14–15 November 2026, m above MLLW, GMT (fetched 2026-11-12)
    const noaa: Record<string, [string, 'H' | 'L', number][]> = {
      '9414873': [['2026-11-14T04:50Z', 'L', -0.027], ['2026-11-14T12:38Z', 'H', 1.325], ['2026-11-14T16:51Z', 'L', 1.033], ['2026-11-14T22:16Z', 'H', 1.569],
        ['2026-11-15T05:38Z', 'L', 0.031], ['2026-11-15T13:29Z', 'H', 1.326], ['2026-11-15T18:04Z', 'L', 1.018], ['2026-11-15T23:09Z', 'H', 1.47]],
      '9414724': [['2026-11-14T04:52Z', 'L', -0.029], ['2026-11-14T12:38Z', 'H', 1.552], ['2026-11-14T16:53Z', 'L', 1.088], ['2026-11-14T22:16Z', 'H', 1.839],
        ['2026-11-15T05:40Z', 'L', 0.032], ['2026-11-15T13:29Z', 'H', 1.554], ['2026-11-15T18:06Z', 'L', 1.073], ['2026-11-15T23:09Z', 'H', 1.722]]
    };
    for (const [st, ev] of Object.entries(noaa)) for (const [t, k, v] of ev) {
      const ms = Date.parse(t);
      let best = 0, h = bayTide(st, ms).h;
      for (let d = -60; d <= 60; d++) { const x = bayTide(st, ms + d * 60e3).h; if (k === 'H' ? x > h : x < h) { h = x; best = d; } }
      expect(Math.abs(best), `${st} ${t}`).toBeLessThanOrEqual(3);
      expect(Math.abs(h - v), `${st} ${t}`).toBeLessThan(0.02);
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
  }, 60_000); // (a day's peaks at forty points: slow when the whole suite runs at once)
  it('over the flats, never faster than a long wave runs in that depth (a creek mouth in the flats, the first of the flood)', () => {
    const f = new CurrentField(stationsFor(t0n, t0n + 3 * 1440));
    let worst = 0;
    for (let k = 0; k < 3 * 1440; k += 20) { f.setTime(t0n + k); const c = f.at(LL(37.969, -122.491)); worst = Math.max(worst, Math.hypot(c.x, c.y) / 0.5144); }
    expect(worst).toBeLessThan(3);
  }, 60_000);
  it('floods into the bay as the tide rises', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '00:00'), f = new CurrentField(stationsFor(t0, t0 + 1440)), p = LL(37.966, -122.485);
    for (let h = 0; h < 24; h += 1) {
      const ms = (t0 + h * 60) * 60e3, { rise } = sanQuentinTide(ms); f.setTime(t0 + h * 60);
      const c = f.at(p); if (Math.abs(rise) > 0.05 / 3600) expect(Math.sign(c.x)).toBe(-Math.sign(rise)); // (in = west-north-west)
    }
  });
});

describe('San Leandro Bay', () => {
  const t0 = sfLocalToUtcMin('2026-11-14', '00:00');
  const peak = (f: CurrentField, lat: number, lon: number) => { let m = 0; for (let h = 0; h < 25; h += 0.25) { f.setTime(t0 + h * 60); const c = f.at(LL(lat, lon)); m = Math.max(m, Math.hypot(c.x, c.y) / 0.5144); } return m; };
  it('in the world now, and filled by the tide: a weak stream over its flats, more in the San Leandro Channel, the Tidal Canal\'s measured stream at its station', () => {
    const f = new CurrentField(stationsFor(t0, t0 + 1440));
    for (const [a, b] of [[37.754, -122.222], [37.7495, -122.238]]) expect(onGround(LL(a, b))).toBe(false);
    expect(peak(f, 37.754, -122.222)).toBeLessThan(0.3); // (mid-bay)
    const ch = peak(f, 37.7495, -122.238); expect(ch).toBeGreaterThan(0.15); expect(ch).toBeLessThan(1.2); // (the channel by Bay Farm Island)
    expect(peak(f, 37.76146, -122.22391)).toBeGreaterThan(0.8); // (the canal, NOAA's SFB1216: about a knot)
  });
  it('hands over from the open water\'s stream to the bay\'s own across its mouth without a step', () => {
    const f = new CurrentField(stationsFor(t0, t0 + 1440)), B = BAYS.find(b => b.name === 'San Leandro Bay')!;
    expect(B.inflows.length).toBe(1);
    f.setTime(t0 + 60);
    // (no step at the mouth from the open water's stream to the bay's own)
    let prev = Math.hypot(f.at(LL(37.7495, -122.2465)).x, f.at(LL(37.7495, -122.2465)).y), worst = 0;
    // (to the flats past the channel's mouth, which dry: none runs over them then)
    for (let lon = -122.2460; lon < -122.2392; lon += 0.0005) { const c = f.at(LL(37.7495, lon)), v = Math.hypot(c.x, c.y); worst = Math.max(worst, Math.abs(v - prev)); prev = v; }
    expect(worst / 0.5144).toBeLessThan(0.1);
  });
  it('at its mouth, the San Leandro Channel runs in on the rising tide and out on the falling (the bay\'s tide lags the water outside both its ways in)', () => {
    const f = new CurrentField(stationsFor(t0, t0 + 3 * 1440));
    let rising = 0, inOnRise = 0, falling = 0, outOnFall = 0;
    for (let m = 0; m < 3 * 1440; m += 20) {
      const r = bayTide('9414724', (t0 + m) * 60e3).rise * 3600; f.setTime(t0 + m);
      const c = f.at(LL(37.7495, -122.2405));
      if (r > 0.1) { rising++; if (c.x > 0) inOnRise++; } if (r < -0.1) { falling++; if (c.x < 0) outOnFall++; }
    }
    expect(inOnRise / rising).toBeGreaterThan(0.95); expect(outOnFall / falling).toBeGreaterThan(0.95);
  }, 60_000);
  it('a drying flat is wetted bit by bit as the tide comes up over it (the chart\'s band, from its height to the datum)', () => {
    // a flat drying from 1.7 m to the datum
    expect(wetBand(-1.7, 0, 0).wet).toBe(0);
    expect(wetBand(-1.7, 0, 0.85).wet).toBeGreaterThan(0.4); expect(wetBand(-1.7, 0, 0.85).wet).toBeLessThan(0.6);
    expect(wetBand(-1.7, 0, 1.8).wet).toBe(1);
    expect(wetBand(2, 4, 1).depth).toBeCloseTo(4, 6); // (always wet: its mean depth, with the tide)
  });
});

