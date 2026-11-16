// The waves' length and speed follow the water's depth (environment/waveField.ts setDepth): linear dispersion,
// ω² = g·k·tanh(k·d) (Dean & Dalrymple, Water Wave Mechanics, ch. 3). Inside the Gate the swell is a shallow-water wave;
// the chop is deep but on the flats.
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { N_WAVES, N_WIND, WaveField, waveNumber } from '../src/environment/waveField';
import { chartDepth } from '../src/environment/sea';
import { tideHeightAt } from '../src/environment/tide';
import { FLAT_SEA } from '../src/environment/sea';

const G = 9.81;

describe('waves for the depth', () => {
  it('the wavenumber solves the dispersion relation, deep and shallow', () => {
    for (const T of [2, 3, 4, 8, 14, 18]) for (const d of [0.5, 1, 2, 4, 7, 14, 30, 100]) {
      const w = 2 * Math.PI / T, k = waveNumber(w, d);
      expect(Math.abs(G * k * Math.tanh(k * d) - w * w) / (w * w)).toBeLessThan(1e-6);
    }
    expect(waveNumber(1, Infinity)).toBeCloseTo(1 / G, 12);
    // (shallow: the wave runs at √(g·d), its length T·√(g·d))
    const w = 2 * Math.PI / 18, k = waveNumber(w, 0.5);
    expect(w / k / Math.sqrt(G * 0.5)).toBeCloseTo(1, 2);
    // (the researcher's figures, by the same relation: 3 s in 3.8 m about 5% shorter than in deep water; 4 s in 7 m)
    for (const [T, d] of [[2, 1.7], [3, 3.8], [4, 7]]) { const w2 = 2 * Math.PI / T; expect(waveNumber(w2, Infinity) / waveNumber(w2, d)).toBeCloseTo(0.95, 1); }
  });

  it("off the Cityfront the swell is a shallow-water wave: its length and speed for the chart's depth and the tide", () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [] } as Settings, 1);
    for (let k = 0; k < 120; k++) w.step(DT);
    const c = w.C.center, d = chartDepth(c)! + tideHeightAt(c, w.clockUtc * 60000);
    expect(d).toBeGreaterThan(5); expect(d).toBeLessThan(40);
    expect(w.waves.depth).toBeCloseTo(d, 1);
    for (let i = N_WIND; i < N_WAVES; i++) {
      const T = 2 * Math.PI / w.waves.w[i], L = 2 * Math.PI / w.waves.k[i], L0 = G * T * T / (2 * Math.PI);
      expect(Math.abs(G * w.waves.k[i] * Math.tanh(w.waves.k[i] * d) - w.waves.w[i] ** 2)).toBeLessThan(1e-3 * w.waves.w[i] ** 2);
      if (T > 10) expect(L / L0, `${T.toFixed(1)} s: ${L.toFixed(0)} m against ${L0.toFixed(0)} m offshore`).toBeLessThan(0.75);
    }
    // (the chop, 1.6–24 m: deep in this water, within a part in a thousand of its deep-water length)
    for (let i = 0; i < N_WIND; i++) expect(w.waves.k[i] / (w.waves.w[i] ** 2 / G)).toBeLessThan(1.02);
  }, 60_000);

  it('as the depth changes the surface where she is stays put, and the waves shorten smoothly', () => {
    const f = new WaveField(14), about = { x: 1234, y: -567 }, s = { ...FLAT_SEA, hsW: 0.6, tpW: 3, hsS: 0.4, tpS: 14 };
    f.update(s, 270, 0, about);
    const t = 50, h0 = f.height(about, t, 1, 1);
    f.setDepth(3); let last = f.k[N_WIND + 1], jumps = 0;
    for (let n = 0; n < 600; n++) { f.update(s, 270, DT, about); const k = f.k[N_WIND + 1]; if (k / last > 1.01) jumps++; last = k; }
    expect(jumps).toBe(0);
    expect(f.height(about, t, 1, 1)).toBeCloseTo(h0, 3);
    expect(f.depth).toBeLessThan(100);
  });
});

import { EnvelopeFrame } from '../src/render/waterFrame';
describe("the drawn wave groups as the depth changes", () => {
  it('they move past a still boat no faster than their own group speed, the depth easing from deep to 3 m', () => {
    const f = new WaveField(14), about = { x: 800, y: 300 }, s = { ...FLAT_SEA, hsW: 0.6, tpW: 3, hsS: 0.4, tpS: 14 };
    f.update(s, 270, 0, about);
    const env = new EnvelopeFrame(), e = new Float32Array(N_WAVES * 2), o = { x: 0, y: 0 };
    let t = 2000; env.pack(f, e, t, o, about); let prev = Array.from({ length: N_WAVES }, (_, i) => env.at(e, i, about, o).x);
    f.setDepth(3); let worst = 0;
    for (let n = 0; n < 900; n++) {
      f.update(s, 270, DT, about); t += DT; env.pack(f, e, t, o, about);
      for (let i = 0; i < N_WAVES; i++) {
        const x = env.at(e, i, about, o).x, kd = f.k[i] * f.depth, cg = 0.5 * (1 + (kd < 20 ? 2 * kd / Math.sinh(2 * kd) : 0)) * f.w[i] / f.k[i];
        worst = Math.max(worst, Math.abs(x - prev[i]) / DT / Math.max(cg, 1e-6)); prev[i] = x;
      }
    }
    expect(worst).toBeLessThan(1.6); // (its own group speed, the old one and the new within that)
  });
});
