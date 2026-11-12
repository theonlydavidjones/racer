import { describe, expect, it } from 'vitest';
import { GUSTS, GustField, seaTI } from '../src/environment/gusts';
import { makeRng } from '../src/core/rng';
import { KT } from '../src/core/math';
import { World } from '../src/sim/world';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { CourseFile } from '../src/courses/course';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';

/**
 * The wind as a station measures it (NOAA CO-OPS/NDBC: the highest 5-second running mean in 6 minutes, over the
 * 2-minute mean), at a fixed point on open water in a race at a set mean wind of `kt`: the puffs (wind.ts) and the
 * gusts (gusts.ts) together, as a boat there feels them.
 */
function gustFactors(kt: number) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, tideDate: '2026-11-14', fleet: 0 } as never, 4);
  const p = { x: w.C.center.x + 400, y: w.C.center.y - 300 }, xs: number[] = [];
  for (let i = 0; i < 60 * 60 * 36; i++) { w.step(); if (i % 60 === 0) xs.push(w.windHere(p).kt); }
  const out: { gf: number; over: number; ti: number }[] = [];
  for (let s = 0; s + 360 <= xs.length; s += 360) {
    const win = xs.slice(s, s + 360), mean2 = win.slice(240).reduce((a, b) => a + b, 0) / 120;
    let peak = 0; for (let i = 0; i + 5 <= 360; i++) peak = Math.max(peak, win.slice(i, i + 5).reduce((a, b) => a + b, 0) / 5);
    // (and the turbulence intensity within each 2-minute stretch: the shifts' slow changes aren't turbulence)
    const sd = Math.sqrt(win.slice(240).reduce((a, b) => a + (b - mean2) ** 2, 0) / 120);
    out.push({ gf: peak / mean2, over: peak - mean2, ti: sd / mean2 });
  }
  const med = (k: 'gf' | 'over' | 'ti') => { const v = out.map(o => o[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  return { gf: med('gf'), over: med('over'), ti: med('ti') };
}

describe('gusts over open water', () => {
  it("the turbulence intensity is the log law's with Charnock's sea roughness: about 0.08–0.10 at 10 m", () => {
    for (const kt of [8, 12, 18, 25]) { expect(seaTI(kt * KT)).toBeGreaterThan(0.075); expect(seaTI(kt * KT)).toBeLessThan(0.1); }
    expect(seaTI(25 * KT)).toBeGreaterThan(seaTI(8 * KT)); // (a rougher sea in a fresher breeze)
  });
  it('the field has the variance it should, and its eddies are the size they should be', () => {
    // (the integral scale of the whole spectrum, before the puffs' share is cut out: a wind so fast nothing is)
    const f = new GustField(makeRng(3), 270, 1e6), u: number[] = [];
    for (let i = 0; i < 20000; i++) { u.push(f.at({ x: 0, y: 0 }).u); f.step(0.5, 6, 270); }
    const m = u.reduce((a, b) => a + b, 0) / u.length, v = u.reduce((a, b) => a + (b - m) ** 2, 0) / u.length;
    // (its share of σu², the spectrum above the puffs' wavelengths: the puffs carry the rest)
    expect(v / f.share).toBeGreaterThan(0.7); expect(v / f.share).toBeLessThan(1.3);
    const g = new GustField(makeRng(3), 270, 6); expect(g.share).toBeGreaterThan(0.3); expect(g.share).toBeLessThan(0.8);
    // (the integral length scale: the area under the autocorrelation along the wind, in metres: 3 m apart per sample)
    let L = 0; for (let lag = 0; lag < 200; lag++) { let c = 0; for (let i = 0; i + lag < u.length; i++) c += (u[i] - m) * (u[i + lag] - m); const r = c / (u.length - lag) / v; if (r < 0) break; L += r * 3; }
    expect(L).toBeGreaterThan(0.5 * GUSTS.L); expect(L).toBeLessThan(1.6 * GUSTS.L);
  });
  it('in a race, in 12–18 kt, the 5-second gust over the 2-minute mean is about 1.15–1.3 (open water: WMO TD-1555, at sea), far below the station\'s 1.5', () => {
    for (const kt of [12, 18]) { const g = gustFactors(kt); expect(g.gf).toBeGreaterThan(1.1); expect(g.gf).toBeLessThan(1.3); expect(g.ti).toBeLessThan(0.13); }
  }, 120000);
  it("in light air the gusts keep their size in knots, as Fort Point's record shows, rather than dying with the mean", () => {
    const light = gustFactors(5);
    expect(light.over).toBeGreaterThan(0.6); // (kt over the mean: the station reads 3.75–4.75 at its rougher site)
    expect(light.gf).toBeGreaterThan(1.15);
  }, 120000);
});
