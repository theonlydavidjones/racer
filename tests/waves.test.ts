import { describe, expect, it } from 'vitest';
import { WaveSet } from '../src/render/waves';
import type { SeaHere } from '../src/environment/sea';

const sea = (hsW: number, tpW: number, hsS = 0): SeaHere => ({ hsW, tpW, fromW: 225, hsS, tpS: 14, fromS: 260, steep: 0.05, white: 0, fetch: 5000 });

/** Settle the wave set on a sea (the heights ease toward it). */
function settle(s: SeaHere): WaveSet {
  const ws = new WaveSet(); ws.setSwellPeriod(s.tpS);
  for (let i = 0; i < 400; i++) ws.update(s, 225, 0.1);
  return ws;
}

describe('the waves you see', () => {
  it('have the significant height of the sea they are drawn for (4 × the standard deviation of the surface)', () => {
    for (const [hs, tp] of [[0.3, 2.2], [0.6, 3], [1.0, 3.8]]) {
      const ws = settle(sea(hs, tp));
      let s2 = 0, n = 0;
      for (let t = 0; t < 600; t += 0.37) for (let x = 0; x < 200; x += 23) { const h = ws.height({ x, y: x * 0.7 }, t, 1, 1); s2 += h * h; n++; }
      expect(4 * Math.sqrt(s2 / n)).toBeGreaterThan(hs * 0.85);
      expect(4 * Math.sqrt(s2 / n)).toBeLessThan(hs * 1.15);
    }
  });

  it('spread round the wind, as a young wind sea does: the energy-weighted mean on the wind, about ±25° either side', () => {
    const ws = settle(sea(0.6, 3)), wind = ws.comps.filter(c => !c.swell), travel = 225 + 180;
    const e = wind.map(c => c.amp ** 2), tot = e.reduce((a, b) => a + b, 0);
    const off = wind.map(c => ((c.dir - travel + 540) % 360) - 180);
    const mean = off.reduce((a, d, i) => a + d * e[i], 0) / tot, sd = Math.sqrt(off.reduce((a, d, i) => a + d * d * e[i], 0) / tot);
    expect(Math.abs(mean)).toBeLessThan(8);
    expect(sd).toBeGreaterThan(12); expect(sd).toBeLessThan(35);
  });

  it('peak where the spectrum does: most of the chop in the components near the peak wavelength', () => {
    const ws = settle(sea(0.6, 3)), Lp = 9.81 * 9 / (2 * Math.PI); // 14 m
    const wind = ws.comps.filter(c => !c.swell), big = wind.reduce((a, c) => (c.amp > a.amp ? c : a));
    const L = 2 * Math.PI / big.k;
    expect(L).toBeGreaterThan(Lp * 0.6); expect(L).toBeLessThan(Lp * 1.3);
  });
});
