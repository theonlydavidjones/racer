import { describe, expect, it } from 'vitest';
import { FLAG, ensignStep, flagExtension, flagHz, flagOffset } from '../src/render/flagWave';

const KT = 0.5144;
describe('a flag in the wind (Chen et al. 2014)', () => {
  it('flaps at f·L/U = 0.8: a 0.6 m ensign about 7 times a second in 10 kt, faster for a shorter burgee; no faster than the screen can show', () => {
    expect(flagHz(10 * KT, 0.6)).toBeCloseTo(6.86, 1);
    expect(flagHz(6 * KT, 0.3)).toBeCloseTo(2 * flagHz(6 * KT, 0.6), 5);
    expect(flagHz(8 * KT, 0.6) / flagHz(4 * KT, 0.6)).toBeCloseTo(2, 5); // (in proportion to the wind)
    expect(flagHz(30 * KT, 0.3)).toBe(FLAG.maxHz);
  });
  it('a wave that grows from nothing at the hoist to about 0.22 L either side at the fly', () => {
    let tip = 0, mid = 0;
    for (let ph = 0; ph < 40; ph += 0.05) { tip = Math.max(tip, Math.abs(flagOffset(1, ph, 0.6, 1))); mid = Math.max(mid, Math.abs(flagOffset(0.5, ph, 0.6, 1))); }
    expect(flagOffset(0, 1.3, 0.6, 1)).toBeCloseTo(0, 12);
    expect(tip).toBeLessThanOrEqual(FLAG.tip * 0.6 + 1e-9); expect(tip).toBeGreaterThan(0.8 * FLAG.tip * 0.6);
    expect(mid).toBeLessThan(0.5 * tip);
  });
  it('the wave runs from the hoist out to the fly', () => {
    // a crest at u moves to larger u as the phase advances
    const crest = (ph: number) => { let best = 0, bu = 0; for (let u = 0; u <= 0.6; u += 0.001) { const v = Math.sin(FLAG.halfWaves * Math.PI * u - ph); if (v > best) { best = v; bu = u; } } return bu; };
    expect(crest(0.3)).toBeGreaterThan(crest(0));
  });
  it('hangs in a calm, lifts from 3 kt, streams from 8 kt (Beaufort force 3 extends light flags)', () => {
    expect(flagExtension(2 * KT)).toBe(0); expect(flagExtension(8 * KT)).toBe(1); expect(flagExtension(5.5 * KT)).toBeCloseTo(0.5, 5);
  });
});

describe('striking the ensign', () => {
  it('comes down the staff in 3 s, the staff out in the 4th; a second press hoists it the other way round', () => {
    let s = { down: 0, slide: 0, out: 0 };
    for (let i = 0; i < 30; i++) s = ensignStep(s.down, true, 0.1);
    expect(s.slide).toBeCloseTo(1, 5); expect(s.out).toBeCloseTo(0, 5);
    for (let i = 0; i < 10; i++) s = ensignStep(s.down, true, 0.1);
    expect(s.out).toBeCloseTo(1, 5);
    for (let i = 0; i < 10; i++) s = ensignStep(s.down, false, 0.1);
    expect(s.out).toBeCloseTo(0, 5); expect(s.slide).toBeCloseTo(1, 5);
    for (let i = 0; i < 30; i++) s = ensignStep(s.down, false, 0.1);
    expect(s.slide).toBeCloseTo(0, 5);
  });
});
