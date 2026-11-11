import { describe, expect, it } from 'vitest';
import { arcIntensity, overThreshold } from '../src/render/navLights';

const STBD = { from: 0, to: 112.5, aftFrom: false, aftTo: true }, PORT = { from: -112.5, to: 0, aftFrom: true, aftTo: false };
const STERN = { from: 112.5, to: -112.5, aftFrom: true, aftTo: true };

/** Rule 21's arcs and Annex I §9(a)'s edges; Rule 22(c)'s ranges through Annex I §8. */
describe('navigation lights', () => {
  it('lights the whole horizon once: green to starboard, red to port, white astern', () => {
    for (let b = -180; b < 180; b += 7.3) {
      const g = arcIntensity(STBD, b), r = arcIntensity(PORT, b), w = arcIntensity(STERN, b);
      const edge = Math.min(Math.abs(b), Math.abs(Math.abs(b) - 112.5)) < 5.5; // within an edge's spill
      if (!edge) expect([g, r, w].filter(v => v > 0.99).length).toBe(1);
      if (!edge) expect([g, r, w].filter(v => v > 0).length).toBe(1);
    }
    expect(arcIntensity(STBD, 60)).toBe(1); expect(arcIntensity(PORT, -60)).toBe(1); expect(arcIntensity(STERN, 180)).toBe(1);
  });
  it('cuts a sidelight off 1–3° across the bow, and to half at 22.5° abaft the beam, gone 5° past', () => {
    expect(arcIntensity(STBD, -0.9)).toBe(1); expect(arcIntensity(STBD, -2)).toBeCloseTo(0.5, 5); expect(arcIntensity(STBD, -3)).toBe(0);
    expect(arcIntensity(STBD, 112.5)).toBeCloseTo(0.5, 5); expect(arcIntensity(STBD, 117.5)).toBe(0); expect(arcIntensity(STBD, 107.5)).toBe(1);
    expect(arcIntensity(STERN, 112.5)).toBeCloseTo(0.5, 5); expect(arcIntensity(STERN, -112.5)).toBeCloseTo(0.5, 5); expect(arcIntensity(STERN, 100)).toBe(0);
    expect(arcIntensity(PORT, 1)).toBe(1); expect(arcIntensity(PORT, -115)).toBeCloseTo(0.25, 5);
  });
  it('is just at the eye\'s threshold at its rated range: 1 nm for a sidelight, 2 nm astern', () => {
    expect(overThreshold(1, 1852)).toBeCloseTo(1, 5);
    expect(overThreshold(2, 2 * 1852)).toBeCloseTo(1, 5);
    expect(overThreshold(1, 3 * 1852)).toBeLessThan(0.1);
    expect(overThreshold(2, 500)).toBeGreaterThan(50);
  });
});
