// landAlongNear (geo/shore.ts) skips the walk along a short look only where the shore's well off and nothing built is
// near: it must give exactly landAlong's answer everywhere, by the shore, the piers, the harbours and out on the water.
import { describe, expect, it } from 'vitest';
import { landAlong, landAlongNear, onLand, anyShoreDist } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { makeRng } from '../src/core/rng';

describe('landAlongNear', () => {
  it("gives landAlong's answer: 20 000 looks across the Central Bay, half of them within 150 m of a shore", () => {
    const r = makeRng(12345), sw = LL(37.77, -122.52), ne = LL(37.90, -122.33);
    let n = 0, near = 0, skipped = 0, bad: string[] = [];
    while (n < 20000) {
      const p = { x: sw.x + r() * (ne.x - sw.x), y: sw.y + r() * (ne.y - sw.y) };
      if (onLand(p)) continue;
      const ds = anyShoreDist(p);
      if (ds > 150 && near < n / 2) continue; // (half by the shore)
      if (ds <= 150) near++;
      const h = r() * 2 * Math.PI, L = [12, 45, 60, 100, 300][n % 5], q = { x: p.x + Math.sin(h) * L, y: p.y + Math.cos(h) * L };
      const a = landAlong(p, q), b = landAlongNear(p, q);
      if (a !== b && bad.length < 5) bad.push(`${p.x.toFixed(1)},${p.y.toFixed(1)} L ${L}: ${a} vs ${b}`);
      if (a !== b) bad.push('');
      if (b === Infinity && a === Infinity) skipped++;
      n++;
    }
    expect(bad.filter(Boolean), `${bad.length} differ`).toEqual([]);
    expect(near).toBeGreaterThan(9000);
  }, 300_000);
});
