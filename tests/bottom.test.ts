import { describe, expect, it } from 'vitest';
import { SHOAL_MARGIN, bottomDepth, shoal, waterOver } from '../src/environment/bottom';
import { depthBand, sfTide } from '../src/environment/tide';
import { LL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';
import enc from '../src/geo/data/enc-chart.json';

/** The bottom where a keel could touch it (NOAA's chart: environment/bottom.ts), and the water over it with the tide. */
describe('the Bay\'s shoal bottom, from the chart', () => {
  it('the race water off the Cityfront is deep: nothing to touch', () => {
    for (const [la, lo] of [[37.812, -122.44], [37.83, -122.42], [37.815, -122.46], [37.82, -122.40]]) expect(bottomDepth(LL(la, lo)), `${la}, ${lo}`).toBeNull();
  });
  it('agrees with the chart\'s own soundings where they\'re shoal', () => {
    const S = (enc as unknown as { soundings: number[] }).soundings; let n = 0, err = 0;
    for (let k = 0; k < S.length; k += 3) {
      const d = S[k + 2] / 10, p = LL(S[k + 1] / 1e5, S[k] / 1e5); if (d > 2 || onLand(p)) continue;
      const z = bottomDepth(p); if (z === null) continue;
      n++; err += Math.abs(z - d);
    }
    expect(n).toBeGreaterThan(200);
    expect(err / n).toBeLessThan(0.35); // (the mean miss: neighbors' soundings blended in, a few hundred meters apart)
  });
  it('inside each bay\'s depth grid, within the chart\'s band there', () => {
    let n = 0, out = 0;
    for (let la = 37.94; la < 37.98; la += 0.002) for (let lo = -122.54; lo < -122.455; lo += 0.002) {
      const p = LL(la, lo), [d1, d2] = depthBand(p), z = bottomDepth(p); if (onLand(p) || z === null || (d1 === 0 && d2 === 0) || d1 >= 2.5) continue;
      n++; if (z < d1 - 0.5 || z > d2 + 0.5) out++; // (half a meter's slack: the bilinear read across a band's line)
    }
    expect(n).toBeGreaterThan(300); expect(out / n).toBeLessThan(0.05);
  });
  it('Richardson Bay\'s flats off Strawberry: too little water for her 1.14 m at a low tide, plenty at high water', () => {
    const p = LL(37.880, -122.505), z = bottomDepth(p)!;
    expect(z).toBeLessThan(1.2);
    // 14 Nov 2026: the day's lowest and highest water in San Francisco's tide (Richardson Bay is off the bays' grids)
    let lo = Infinity, hi = -Infinity, tLo = 0, tHi = 0; const day = Date.UTC(2026, 10, 14, 8);
    for (let m = 0; m < 1440; m += 5) { const t = day + m * 60e3, h = sfTide(t); if (h < lo) { lo = h; tLo = t; } if (h > hi) { hi = h; tHi = t; } }
    expect(waterOver(p, tLo)!).toBeLessThan(1.14); expect(waterOver(p, tHi)!).toBeGreaterThan(1.14);
  });
  it('no steps: a meter apart, the bottom within a few centimeters', () => {
    let worst = 0, where = '';
    for (let la = 37.86; la < 37.90; la += 0.0007) for (let lo = -122.52; lo < -122.48; lo += 0.0007) {
      const p = LL(la, lo), a = bottomDepth(p), b = bottomDepth({ x: p.x + 1, y: p.y });
      if (a === null || b === null) continue;
      const d = Math.abs(a - b); if (d > worst) { worst = d; where = `${la}, ${lo}`; }
    }
    expect(worst, where).toBeLessThan(0.08);
  });
});

describe('shoal: too shallow for her, for the planner', () => {
  it('Richardson Bay\'s flat at the day\'s low water and not at its high; the race water never', () => {
    const p = LL(37.880, -122.505), day = Date.UTC(2026, 10, 14, 8);
    let lo = Infinity, hi = -Infinity, tLo = 0, tHi = 0;
    for (let m = 0; m < 1440; m += 5) { const t = day + m * 60e3, h = sfTide(t); if (h < lo) { lo = h; tLo = t; } if (h > hi) { hi = h; tHi = t; } }
    expect(shoal(p, tLo, 1.141)).toBe(true); expect(shoal(p, tHi, 1.141)).toBe(false);
    expect(shoal(LL(37.812, -122.44), tLo, 1.141)).toBe(false);
    // (just deep enough for her keel, but not for her keel and the margin: shoal)
    const w = waterOver(p, tHi)!; expect(shoal(p, tHi, w - SHOAL_MARGIN / 2)).toBe(true);
  });
});
