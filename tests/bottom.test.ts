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

describe('the dredged channels', () => {
  it('a channel dredged through the flats reads at its dredged depth, not as the flats round it (DRGARE)', () => {
    type A = { k: string; name?: string; d?: number; f?: number[][][] };
    const dec = (a: number[]) => { const o: { x: number; y: number }[] = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; o.push(LL(y / 1e5, x / 1e5)); } return o; };
    const inPoly = (p: { x: number; y: number }, P: { x: number; y: number }[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    const bad: string[] = []; let n = 0;
    for (const A of (enc as unknown as { areas: A[] }).areas) if (A.k === 'dredged' && A.f && A.d != null && A.d < 3) for (const poly of A.f) {
      const P = dec(poly[0]), xs = P.map(q => q.x), ys = P.map(q => q.y); let m = 0, shoaler = 0;
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 10) for (let y = Math.min(...ys); y < Math.max(...ys); y += 10) {
        const q = { x, y }; if (!inPoly(q, P) || onLand(q)) continue;
        // (25 m in from its edge: the 50 m cells along it read half the flats beside it)
        if (P.some((a, i) => { const b = P[(i + 1) % P.length], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy) < 25; })) continue;
        m++; const z = bottomDepth(q); if (z !== null && z < A.d - 0.5) shoaler++;
      }
      n += m; if (m > 5 && shoaler / m > 0.1) bad.push(`${A.name} (${A.d} m): ${shoaler}/${m}`);
    }
    expect(n).toBeGreaterThan(200);
    expect(bad, bad.join('; ')).toEqual([]);
  }, 120_000);
});

describe('toward the shore', () => {
  it('the flats run on into the shore, shoaling or level, not deepening at the beach (land beside them isn\'t read as deep)', () => {
    let n = 0, deeper = 0;
    for (let la = 37.74; la < 37.98; la += 0.004) for (let lo = -122.55; lo < -122.19; lo += 0.004) {
      const p = LL(la, lo); if (onLand(p)) continue; const z0 = bottomDepth(p); if (z0 === null || z0 > 1) continue;
      // (the nearest shore, of 24 bearings, within 400 m; 3 m off it)
      let best: { d: number; u: { x: number; y: number } } | null = null;
      for (let a = 0; a < 360; a += 15) { const u = { x: Math.cos(a * Math.PI / 180), y: Math.sin(a * Math.PI / 180) }; for (let d = 2; d < 400; d += 2) if (onLand({ x: p.x + u.x * d, y: p.y + u.y * d })) { if (!best || d < best.d) best = { d, u }; break; } }
      if (!best || best.d < 20) continue;
      const z1 = bottomDepth({ x: p.x + best.u.x * (best.d - 3), y: p.y + best.u.y * (best.d - 3) });
      n++; if (z1 === null || z1 > z0 + 0.3) deeper++;
    }
    expect(n).toBeGreaterThan(100);
    expect(deeper / n).toBeLessThan(0.1); // (a few really do: a dredged channel or a marina's basin along the shore; it was half of them)
  }, 120_000);
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

describe('shoal: the charted rocks too', () => {
  it('the rocks off Lime Point by the bridge\'s north tower, which cover and uncover, are shoal for her at any tide; looked for 30 m round', async () => {
    const { HAZARDS } = await import('../src/environment/hazards');
    const R = HAZARDS.find(H => H.kind === 'rock' && H.p && H.top < 0 && Math.hypot(H.p.x + 3000, H.p.y - 1640) < 400)!; // (near the north tower, the Marin side)
    expect(R).toBeDefined();
    const day = Date.UTC(2026, 10, 14, 8), off = { x: R.p!.x + 25, y: R.p!.y };
    for (let m = 0; m < 1440; m += 60) { expect(shoal(R.p!, day + m * 60e3, 1.141)).toBe(true); expect(shoal(off, day + m * 60e3, 1.141, 30)).toBe(true); }
  });
});

describe('the charted hazards\' tops', () => {
  it('the dry ones stand out of the tide, those that cover and uncover dry at low water, those of unknown depth at their area\'s shoal edge; an area is near from its edges', async () => {
    const { HAZARDS, hazardNear } = await import('../src/environment/hazards');
    const raw = (enc as unknown as { hazards: { wl: number; d?: number }[] }).hazards;
    expect(HAZARDS.length).toBeGreaterThan(700); // (was 367: the dry ones, the covering wrecks and obstructions, the unknown depths)
    for (const H of HAZARDS) expect(Number.isFinite(H.top)).toBe(true);
    const dry = raw.filter(h => (h.wl === 1 || h.wl === 2) && h.d == null).length;
    expect(HAZARDS.filter(H => H.top <= -1.7).length).toBeGreaterThanOrEqual(dry);
    // an area hazard: a point just outside the middle of its longest edge is within 30 m of it
    const A = HAZARDS.find(H => H.area && H.area.length > 2)!;
    let best = 0, mid = { x: 0, y: 0 }, nrm = { x: 0, y: 0 };
    for (let i = 0; i < A.area!.length; i++) { const a = A.area![i], b = A.area![(i + 1) % A.area!.length], L = Math.hypot(b.x - a.x, b.y - a.y); if (L > best) { best = L; mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; nrm = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }; } }
    const out = [1, -1].map(s => ({ x: mid.x + nrm.x * 10 * s, y: mid.y + nrm.y * 10 * s }));
    for (const q of out) expect(hazardNear(q, 30)).not.toBeNull();
  });
});
