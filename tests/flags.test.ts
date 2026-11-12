import { describe, expect, it } from 'vitest';
import { ensignStep, flagAngle, flagDrawn, flagExtension, flagHz, flagRow } from '../src/render/flagWave';

const KT = 0.5144;
describe('a flag in the wind (Chen et al. 2014)', () => {
  it('flaps at f·L/U = 0.55: a 0.6 m ensign about 5 times a second in 10 kt, a shorter burgee faster', () => {
    expect(flagHz(10 * KT, 0.6)).toBeCloseTo(4.72, 1);
    expect(flagHz(10 * KT, 0.3)).toBeCloseTo(2 * flagHz(10 * KT, 0.6), 5);
    expect(flagHz(8 * KT, 0.6) / flagHz(4 * KT, 0.6)).toBeCloseTo(2, 5); // (in proportion to the wind)
  });
  it('drawn no faster than five frames to a flap; past that the breeze still shows, in the snap', () => {
    const at60 = flagDrawn(30 * KT, 0.45, 1 / 60), at30 = flagDrawn(30 * KT, 0.45, 1 / 30);
    expect(at60.hz).toBeCloseTo(12, 5); expect(at30.hz).toBeCloseTo(6, 5);
    expect(at30.snap).toBeGreaterThan(at60.snap);
    expect(flagDrawn(5 * KT, 0.6, 1 / 60)).toEqual({ hz: flagHz(5 * KT, 0.6), snap: 0 });
  });
  const row = (ph: number, ext = 1, snap = 0) => { const xs = new Float64Array(31), zs = new Float64Array(31); flagRow(30, ph, 0.6, ext, snap, xs, zs); return { xs, zs }; };
  it('a wave that grows from nothing at the hoist to about 0.19 L to each side at the fly', () => {
    let tip = 0, mid = 0;
    for (let ph = 0; ph < 40; ph += 0.05) { const { zs } = row(ph); tip = Math.max(tip, Math.abs(zs[30])); mid = Math.max(mid, Math.abs(zs[15])); }
    expect(flagAngle(0, 1.3, 1)).toBeCloseTo(0, 12);
    expect(tip / 0.6).toBeGreaterThan(0.17); expect(tip / 0.6).toBeLessThan(0.21);
    expect(mid).toBeLessThan(0.75 * tip); // (growing all the way out)
  });
  it('the wave runs from the hoist out to the fly', () => {
    // a wave travelling toward the fly has ∂z/∂t = −c·∂z/∂u: the two are opposite in sign on the whole
    let sum = 0;
    for (let ph = 0; ph < 20; ph += 0.1) {
      const a = row(ph).zs, b = row(ph + 1e-3).zs;
      for (let i = 3; i < 30; i++) sum += Math.sign((b[i] - a[i]) * (a[i + 1] - a[i]));
    }
    expect(sum).toBeLessThan(0);
  });
  it('the cloth doesn\'t stretch: its length along the row stays the flag\'s, and its fly end comes in as it swings', () => {
    let minX = 1;
    for (let ph = 0; ph < 20; ph += 0.3) for (const snap of [0, 1]) {
      const { xs, zs } = row(ph, 1, snap);
      let len = 0; for (let i = 1; i <= 30; i++) len += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      expect(len).toBeCloseTo(0.6, 9); minX = Math.min(minX, xs[30]);
    }
    expect(minX).toBeLessThan(0.55);
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
