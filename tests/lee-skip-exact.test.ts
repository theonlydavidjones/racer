// The land's lee (environment/shadows.ts terrainLeeRaw) starts each ray at the last sample before ground that might be
// over 8 m, and skips a ray with none: that must give the same lee, to the bit, as marching every ray from its start.
// Checked over the whole chart (open sea, the Gate, the Bay, the East Bay shore), in every direction and off the
// 5° steps the planner uses, and with the Gate's hills left out (the jet's own reading, skipGate).
import { describe, expect, it } from 'vitest';
import { leeSkip, terrainLee } from '../src/environment/shadows';
import { landLee } from '../src/environment/wind';
import { LL } from '../src/geo/geo';

describe('the lee ray skips open water exactly', () => {
  it('the same lee with the skip as without, everywhere and from every way', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    let n = 0, skipped = 0, sheltered = 0;
    for (let k = 0; k < 2500; k++) {
      const p = LL(37.70 + 0.27 * rnd(), -122.62 + 0.38 * rnd()), from = k % 3 === 0 ? 5 * Math.floor(72 * rnd()) : 360 * rnd();
      for (const gate of [false, true]) {
        leeSkip.on = true; const a = terrainLee(p, from, gate);
        leeSkip.on = false; const b = terrainLee(p, from, gate);
        expect(Object.is(a, b), `terrainLee at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) from ${from.toFixed(1)}° gate ${gate}: ${a} with the skip, ${b} without`).toBe(true);
        n++; if (b === 1) skipped++; else sheltered++;
      }
      leeSkip.on = true; const a = landLee(p, from); leeSkip.on = false; const b = landLee(p, from);
      expect(Object.is(a, b)).toBe(true);
    }
    leeSkip.on = true;
    // (the check covers both kinds of water: in the open, and in a lee)
    expect(skipped).toBeGreaterThan(500); expect(sheltered).toBeGreaterThan(500);
    expect(n).toBe(5000);
  });
});
