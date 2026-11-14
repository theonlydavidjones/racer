// Touching by the hulls' own outlines (docs/HULL-CONTACT.md): the gap between two boats is between their plan-view
// outlines at the sheer, from the class's construction plan (boat/hullPlan.ts), not between their centerlines.
import { describe, expect, it } from 'vitest';
import { HALF, V } from '../src/core/math';
import { OUTLINE, hullContact, hullGap } from '../src/rules/geometry';
import { halfBeam } from '../src/boat/hullPlan';

const at = (x: number, y: number, h: number) => ({ x, y, h });
/** B placed `d` along A's heading (+ forward) and `s` to her starboard, A at the origin heading `h`. */
const off = (h: number, d: number, s: number, hb: number) => { const f = V(h), st = V(h + 90); return at(f.x * d + st.x * s, f.y * d + st.y * s, hb); };

describe('the hulls\' outlines', () => {
  it('her outline is convex, stem to transom, 2.2 m wide at the widest and 1.31 m across the transom', () => {
    const n = OUTLINE.length; let sign = 0;
    for (let i = 0; i < n; i++) {
      const a = OUTLINE[i], b = OUTLINE[(i + 1) % n], c = OUTLINE[(i + 2) % n];
      const cr = (b.s - a.s) * (c.f - b.f) - (b.f - a.f) * (c.s - b.s);
      if (Math.abs(cr) > 1e-9) { if (!sign) sign = Math.sign(cr); expect(Math.sign(cr)).toBe(sign); }
    }
    expect(Math.max(...OUTLINE.map(p => p.s)) * 2).toBeCloseTo(2.2, 1);
    expect(OUTLINE[0]).toEqual({ f: HALF, s: 0 });
    expect(Math.max(...OUTLINE.filter(p => p.f === -HALF).map(p => p.s)) * 2).toBeCloseTo(1.31, 2);
  });

  for (const h of [0, 37, 200]) {
    it(`side by side (heading ${h}°): the gap is the water between them, beam to beam`, () => {
      const A = at(0, 0, h);
      for (const d of [0.05, 0.5, 2]) expect(hullGap(A, off(h, 0, 2 * 1.1 + d, h))).toBeCloseTo(d, 1);
    });
    it(`bow into stern, in line (heading ${h}°): they touch when they touch, not with a meter and a half between`, () => {
      const A = at(0, 0, h);
      for (const d of [0.05, 0.5, 2]) expect(hullGap(A, off(h, -(2 * HALF + d), 0, h))).toBeCloseTo(d, 2);
      expect(hullGap(A, off(h, -(2 * HALF - 0.3), 0, h))).toBe(0);
    });
    it(`bow into her side, square on (heading ${h}°)`, () => {
      const A = at(0, 0, h);
      for (const d of [0.05, 0.5, 2]) expect(hullGap(A, off(h, 0, halfBeam(0.5) + HALF + d, h - 90))).toBeCloseTo(d, 1);
    });
  }
  it('overlapping: 0, and the normal points from A toward B', () => {
    const A = at(0, 0, 0), B = off(0, 0, 1.5, 0), c = hullContact(A, B);
    expect(c.gap).toBe(0); expect(c.n.x).toBeCloseTo(1, 5);
  });
  it('the nearest points and the normal, apart', () => {
    const A = at(0, 0, 0), B = off(0, 0, 2.7, 0), c = hullContact(A, B);
    expect(c.gap).toBeCloseTo(0.5, 1); expect(c.n.x).toBeCloseTo(1, 2);
    expect(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)).toBeCloseTo(c.gap, 6);
  });
  // (the reference: every corner to every edge, and an overlap by any edge crossing; slow, and plainly right)
  const world = (b: { x: number; y: number; h: number }) => { const f = V(b.h), st = V(b.h + 90); return OUTLINE.map(o => ({ x: b.x + f.x * o.f + st.x * o.s, y: b.y + f.y * o.f + st.y * o.s })); };
  const segD = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => { const ex = b.x - a.x, ey = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey))); return Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t); };
  const inside = (p: { x: number; y: number }, P: { x: number; y: number }[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], c = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)); if (c) { if (s && c !== s) return false; s = c; } } return true; };
  const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => { const o = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  const brute = (A: { x: number; y: number; h: number }, B: { x: number; y: number; h: number }) => {
    const P = world(A), Q = world(B), n = P.length;
    if (inside(P[0], Q) || inside(Q[0], P)) return 0;
    let d = Infinity;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (cross(P[i], P[(i + 1) % n], Q[j], Q[(j + 1) % n])) return 0;
      d = Math.min(d, segD(P[i], Q[j], Q[(j + 1) % n]), segD(Q[j], P[i], P[(i + 1) % n]));
    }
    return d;
  };
  it('the measure agrees with every corner to every edge, to a tenth of a millimeter, overlapping or apart, at every angle', () => {
    let worst = 0, overlaps = 0;
    for (let k = 0; k < 3000; k++) {
      const a = k * 2.399, r = (k % 100) * 0.17, A = at(1.3, -2.1, (k * 13.7) % 360), B = at(1.3 + r * Math.sin(a), -2.1 + r * Math.cos(a), (k * 47.3) % 360);
      const want = brute(A, B); if (want === 0) overlaps++;
      worst = Math.max(worst, Math.abs(hullGap(A, B) - want));
    }
    expect(worst).toBeLessThan(1e-4); expect(overlaps).toBeGreaterThan(300);
  });
  it('beyond two lengths it isn\'t measured: the gap given is under the true one, and over two lengths', () => {
    for (let k = 0; k < 500; k++) {
      const a = k * 2.399, r = 2 * HALF * 2 + 3 + (k % 30) * 0.5, A = at(0, 0, (k * 13.7) % 360), B = at(r * Math.sin(a), r * Math.cos(a), (k * 47.3) % 360);
      const g = hullGap(A, B), want = brute(A, B);
      expect(g).toBeLessThanOrEqual(want + 1e-9);
      if (want > 4 * HALF + 2.2 + 1e-6) expect(g).toBeGreaterThan(4 * HALF);
    }
  });
});
