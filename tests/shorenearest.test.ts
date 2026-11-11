import { describe, expect, it } from 'vitest';
import { segPt } from '../src/core/math';
import { SHORE, shoreNearest } from '../src/geo/shore';
import { makeRng as mulberry32 } from '../src/core/rng';

// The nearest shore segment, by brute force over every segment (the lowest k on a tie): what shoreNearest's cell lists must match exactly.
const brute = (p: { x: number; y: number }) => {
  let m = Infinity, mk = -1;
  for (let k = 1; k < SHORE.length; k++) { const d = segPt(p, SHORE[k - 1], SHORE[k]); if (d < m) { m = d; mk = k; } }
  return { d: m, k: mk };
};

describe('shoreNearest (the cell lists) is exact', () => {
  it('matches every segment searched, near the shore, out on the Bay and far off', () => {
    const r = mulberry32(5), xs = SHORE.map(q => q.x), ys = SHORE.map(q => q.y);
    const x0 = Math.min(...xs) - 3000, x1 = Math.max(...xs) + 3000, y0 = Math.min(...ys) - 1500, y1 = Math.max(...ys) + 6000;
    for (let i = 0; i < 6000; i++) {
      // half of them within 60 m of a shore point (where ties and the nearest segment change fast)
      const s = SHORE[Math.floor(r() * SHORE.length)];
      const p = i % 2 ? { x: x0 + r() * (x1 - x0), y: y0 + r() * (y1 - y0) } : { x: s.x + (r() - 0.5) * 120, y: s.y + (r() - 0.5) * 120 };
      const b = brute(p);
      for (let k = 0; k < 10; k++) expect(shoreNearest(p)).toEqual(b); // (a cell's first few times by the ring search, then from its list)
    }
    for (const s of SHORE.slice(0, 200)) for (let k = 0; k < 10; k++) expect(shoreNearest(s)).toEqual(brute(s)); // on a vertex: two segments tie at 0
  });
});
