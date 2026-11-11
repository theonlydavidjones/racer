import { describe, expect, it } from 'vitest';
import { LL } from '../src/geo/geo';
import { HARBORS } from '../src/geo/marina';
import { WHARF, landAlong, onLand, terrainNearest } from '../src/geo/shore';
import { makeRng } from '../src/core/rng';

/** The first land along a → b by brute force: onLand every 5 cm. */
function sampled(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(L / 0.05);
  for (let k = 0; k <= n; k++) { const t = k / n; if (onLand({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return t * L; }
  return Infinity;
}

describe('land along a line (landAlong): exact, so nothing slips between samples', () => {
  it('agrees with onLand sampled every 5 cm, round the Wharf, the marinas, the Cityfront, Alcatraz, Angel Island and Marin', () => {
    const r = makeRng(42);
    const places = [LL(37.8095, -122.4170), LL(37.8085, -122.4110), LL(37.8090, -122.4430), LL(37.8075, -122.4380), LL(37.8270, -122.4230),
      LL(37.8600, -122.4300), LL(37.8320, -122.4790), LL(37.8090, -122.4600), LL(37.8730, -122.4560), LL(37.8240, -122.3720)];
    let n = 0, same = 0;
    for (const c of places) for (let k = 0; k < 40; k++) {
      const a = { x: c.x + (r() - 0.5) * 600, y: c.y + (r() - 0.5) * 600 };
      if (onLand(a)) continue;
      const h = r() * Math.PI * 2, l = 20 + r() * 300, b = { x: a.x + Math.sin(h) * l, y: a.y + Math.cos(h) * l };
      const got = landAlong(a, b), want = sampled(a, b);
      n++;
      if (want === Infinity) expect(got, `${JSON.stringify(a)} → ${JSON.stringify(b)}`).toBe(Infinity);
      else {
        expect(got, `${JSON.stringify(a)} → ${JSON.stringify(b)}`).toBeLessThanOrEqual(want + 0.06);
        expect(got).toBeGreaterThan(want - 0.06);
      }
      if (Math.abs(got - want) < 0.06 || got === want) same++;
    }
    expect(n).toBeGreaterThan(150);
    expect(same).toBe(n);
  });

  it('finds every Wharf pier and breakwater crossed between two water points 15 m apart (the old step), square across it', () => {
    let tried = 0;
    for (const W of WHARF.lines) for (let i = 1; i < W.pts.length; i++) {
      const p = W.pts[i - 1], q = W.pts[i], L = Math.hypot(q.x - p.x, q.y - p.y); if (L < 4) continue;
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, n = { x: -(q.y - p.y) / L, y: (q.x - p.x) / L };
      const a = { x: m.x - n.x * 7.5, y: m.y - n.y * 7.5 }, b = { x: m.x + n.x * 7.5, y: m.y + n.y * 7.5 };
      if (onLand(a) || onLand(b)) continue; // (alongside something else)
      tried++;
      expect(landAlong(a, b), `${W.name ?? W.kind}`).toBeLessThan(7.5);
    }
    expect(tried).toBeGreaterThan(5);
  });

  it('finds a 1 m dock finger in West Harbor that a 2 m step could miss', () => {
    const H = HARBORS[0];
    let tried = 0;
    for (const f of H.fingers.slice(0, 40)) {
      const p = f[0], q = f[f.length - 1], L = Math.hypot(q.x - p.x, q.y - p.y); if (L < 4) continue;
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, n = { x: -(q.y - p.y) / L, y: (q.x - p.x) / L };
      const a = { x: m.x - n.x * 1.0, y: m.y - n.y * 1.0 }, b = { x: m.x + n.x * 1.0, y: m.y + n.y * 1.0 };
      if (onLand(a) || onLand(b)) continue;
      tried++;
      expect(landAlong(a, b)).toBeCloseTo(0.5, 1);
    }
    expect(tried).toBeGreaterThan(10);
  });

  it('open water is clear, and a line onto Alcatraz stops at its shore', () => {
    expect(landAlong(LL(37.8150, -122.4500), LL(37.8150, -122.4300))).toBe(Infinity);
    const a = LL(37.8267, -122.4320), b = LL(37.8267, -122.4200), d = landAlong(a, b);
    expect(d).toBeLessThan(Infinity);
    expect(Math.abs(d - sampled(a, b))).toBeLessThan(0.06);
  });

  it('the nearest island shore: its distance and the way out from it', () => {
    const p = LL(37.8267, -122.4320), d = landAlong(p, LL(37.8267, -122.4200)), t = terrainNearest(p, 1200)!;
    expect(t.d).toBeLessThanOrEqual(d + 0.01);
    expect(t.n.x).toBeLessThan(0); // west of the island: out is to the west
    expect(terrainNearest(LL(37.8150, -122.4500), 30)).toBeNull();
  });
});
