import { describe, expect, it } from 'vitest';
import { GUSTS, GustField, seaTI, sigmaU } from '../src/environment/gusts';
import { makeRng } from '../src/core/rng';
import { KT } from '../src/core/math';

/**
 * The gusts as a station measures them (NOAA CO-OPS/NDBC: the highest 5-second running mean in 6 minutes, over the
 * 2-minute mean), at a fixed point over open water in a steady mean wind of `kt`.
 */
function gustFactors(kt: number, n = 200) {
  const U = kt * KT, sg = sigmaU(U), out: { gf: number; over: number; sd: number }[] = [];
  for (let s = 0; s < n; s++) {
    const f = new GustField(makeRng(500 + s), 270), xs: number[] = [];
    for (let i = 0; i < 360; i++) { xs.push(U + Math.max(-0.9 * U, f.at({ x: 0, y: 0 }).u * sg)); f.step(1, U, 270); }
    const mean2 = xs.slice(240).reduce((a, b) => a + b, 0) / 120;
    let peak = 0; for (let i = 0; i + 5 <= 360; i++) peak = Math.max(peak, xs.slice(i, i + 5).reduce((a, b) => a + b, 0) / 5);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    out.push({ gf: peak / mean2, over: (peak - mean2) / KT, sd });
  }
  const med = (k: 'gf' | 'over' | 'sd') => { const v = out.map(o => o[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  return { gf: med('gf'), over: med('over'), sd: med('sd') };
}

describe('gusts over open water', () => {
  it("the turbulence intensity is the log law's with Charnock's sea roughness: about 0.08–0.10 at 10 m", () => {
    for (const kt of [8, 12, 18, 25]) { expect(seaTI(kt * KT)).toBeGreaterThan(0.075); expect(seaTI(kt * KT)).toBeLessThan(0.1); }
    expect(seaTI(25 * KT)).toBeGreaterThan(seaTI(8 * KT)); // (a rougher sea in a fresher breeze)
  });
  it('the field has the variance it should, and its eddies are the size they should be', () => {
    const f = new GustField(makeRng(3), 270), u: number[] = [];
    for (let i = 0; i < 20000; i++) { u.push(f.at({ x: 0, y: 0 }).u); f.step(0.5, 6, 270); }
    const m = u.reduce((a, b) => a + b, 0) / u.length, v = u.reduce((a, b) => a + (b - m) ** 2, 0) / u.length;
    expect(v).toBeGreaterThan(0.7); expect(v).toBeLessThan(1.3);
    // (the integral length scale: the area under the autocorrelation along the wind, in metres: 3 m apart per sample)
    let L = 0; for (let lag = 0; lag < 200; lag++) { let c = 0; for (let i = 0; i + lag < u.length; i++) c += (u[i] - m) * (u[i + lag] - m); const r = c / (u.length - lag) / v; if (r < 0) break; L += r * 3; }
    expect(L).toBeGreaterThan(0.5 * GUSTS.L); expect(L).toBeLessThan(1.6 * GUSTS.L);
  });
  it('in 10–15 kt the 5-second gust over the 2-minute mean is about 1.15–1.3 (open water: WMO TD-1555, at sea), far below the station\'s 1.5', () => {
    for (const kt of [10, 15]) { const g = gustFactors(kt); expect(g.gf).toBeGreaterThan(1.12); expect(g.gf).toBeLessThan(1.3); }
  });
  it("in light air the gusts keep their size in knots, as Fort Point's record shows, rather than dying with the mean", () => {
    const light = gustFactors(4);
    expect(light.over).toBeGreaterThan(0.8); // (kt over the mean: the station reads 3.75 at its rougher site)
    expect(light.gf).toBeGreaterThan(gustFactors(15).gf);
  });
});
