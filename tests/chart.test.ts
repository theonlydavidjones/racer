import { describe, expect, it } from 'vitest';
import { ENC, aidId, aidText, band, lightText, type Aid } from '../src/ui/encChart';
import { PLACES } from '../src/sim/places';
import { LL, toLL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';
import { inPoly, type Vec } from '../src/core/math';

const at = (q: [number, number]) => LL(q[1] / 1e5, q[0] / 1e5);
function ring(a: number[]): Vec[] { const o: Vec[] = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; o.push(LL(y / 1e5, x / 1e5)); } return o; }

describe('NOAA chart data', () => {
  it('says where it came from: NOAA ENC cells with their editions', () => {
    expect(ENC.source).toMatch(/NOAA/);
    expect(ENC.cells.length).toBeGreaterThanOrEqual(9);
    for (const c of ENC.cells) { expect(c.name).toMatch(/^US[45]/); expect(c.edition).toBeGreaterThanOrEqual(1); expect(c.issued).toMatch(/^\d{4}-\d\d-\d\d$/); }
  });

  it('has the chart\'s layers', () => {
    expect(ENC.soundings.length / 3).toBeGreaterThan(1000);
    expect(ENC.depth.map(d => d.d)).toEqual(expect.arrayContaining([0, 1.8, 9.1, 18.2]));
    for (const k of ['lane', 'sepzone', 'precaution', 'anchorage', 'restricted', 'fairway']) expect(ENC.areas.some(a => a.k === k), k).toBe(true);
    expect(ENC.aids.filter(a => a.k === 'buoy').length).toBeGreaterThan(40);
    expect(ENC.aids.some(a => a.k === 'light' && /Alcatraz/.test(a.name ?? ''))).toBe(true);
  });

  it('charts the soundings in the deep channel under the Golden Gate deeper than 30 m', () => {
    const g = LL(37.8175, -122.4783); let best = 1e9, d = 0;
    for (let i = 0; i < ENC.soundings.length; i += 3) { const p = LL(ENC.soundings[i + 1] / 1e5, ENC.soundings[i] / 1e5), r = Math.hypot(p.x - g.x, p.y - g.y); if (r < best) { best = r; d = ENC.soundings[i + 2] / 10; } }
    expect(best).toBeLessThan(400); expect(d).toBeGreaterThan(30);
  });
});

describe('the chart\'s print', () => {
  it('writes light characteristics as US charts do', () => {
    expect(lightText({ chr: 2, col: [4], per: 4 })).toBe('Fl G 4s');
    expect(lightText({ chr: 2, col: [3], grp: '(2+1)', per: 6 })).toBe('Fl(2+1) R 6s');
    expect(lightText({ chr: 7, col: [1], grp: '(1)', per: 6, h: 25.9, r: 9 })).toBe('Iso 6s 85ft 9M');
    expect(lightText({ chr: 4, col: [3] })).toBe('Q R');
  });
  it('labels buoys with colour, number, light and sound', () => {
    const a: Aid = { k: 'buoy', p: [0, 0], name: 'San Francisco Main Ship Channel Lighted Bell Buoy 7', col: [4], lit: [{ chr: 2, col: [4], per: 4 }], fog: 7 };
    expect(aidId(a)).toBe('7'); expect(aidText(a)).toBe('G "7" Fl G 4s BELL');
    expect(aidText({ k: 'buoy', p: [0, 0], name: 'Harding Rock Light Buoy HR', col: [3, 4, 3] })).toBe('RG "HR"');
  });
  it('tints depth in the chart\'s bands', () => {
    expect(band(-1.6)).toBe('dry'); expect(band(0)).toBe('vshoal'); expect(band(1.8)).toBe('shoal'); expect(band(9.1)).toBe('mid'); expect(band(18.2)).toBe('deep');
  });
});

describe('the chart against the sim', () => {
  // the charted buoys the sim's places also use: they must be where NOAA charts them
  it('puts the navigation buoys the sim uses where NOAA charts them', () => {
    const pairs: [string, RegExp][] = [['m-17', /Harding Rock/], ['m-18', /Blossom Rock/], ['m-21', /North Channel Lighted Buoy 1$/], ['m-7', /North Channel Lighted Buoy 2$/], ['m-8', /North Channel Lighted Buoy 4$/]];
    for (const [id, re] of pairs) {
      const pl = PLACES.find(p => p.id === id)!, aid = ENC.aids.find(a => re.test(a.name ?? ''))!;
      const q = at(aid.p);
      expect(Math.hypot(q.x - pl.p.x, q.y - pl.p.y), id).toBeLessThan(35);
    }
  });

  /*
   * Where the sim's land (what you run aground on) and NOAA's land disagree, sampled every 20 m over the race area.
   * This reports, it doesn't fix: the owner decides which to move. (0.8% since the coast from Fort Point to Crissy
   * Field came from OpenStreetMap; the rest is mostly the terrain's 50 m cells round Marin and Angel Island.)
   */
  it('agrees with the sim\'s coastline over the race area (reports where it doesn\'t)', () => {
    const land = ENC.land.map(p => p.map(ring)), strc = ENC.structures.map(p => p.map(ring));
    const bb = (rs: Vec[][]) => { const r = rs[0]; return { x0: Math.min(...r.map(p => p.x)), x1: Math.max(...r.map(p => p.x)), y0: Math.min(...r.map(p => p.y)), y1: Math.max(...r.map(p => p.y)) }; };
    const polys = [...land, ...strc].map(rs => ({ rs, b: bb(rs) }));
    const encLand = (p: Vec) => polys.some(({ rs, b }) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && rs.reduce((n, r) => n + (inPoly(p, r) ? 1 : 0), 0) % 2 === 1);
    const A = LL(37.800, -122.490), Bp = LL(37.875, -122.400), step = 20;
    let n = 0, simOnly = 0, encOnly = 0; const where = new Map<string, { s: number; e: number }>();
    for (let x = A.x; x < Bp.x; x += step) for (let y = A.y; y < Bp.y; y += step) {
      const p = { x, y }, s = onLand(p), e = encLand(p); n++;
      if (s === e) continue;
      if (s) simOnly++; else encOnly++;
      const ll = toLL(p), k = `${ll.lat.toFixed(2)} ${ll.lon.toFixed(2)}`, c = where.get(k) ?? { s: 0, e: 0 };
      if (s) c.s++; else c.e++; where.set(k, c);
    }
    const worst = [...where].sort((a, b) => (b[1].s + b[1].e) - (a[1].s + a[1].e)).slice(0, 8)
      .map(([k, c]) => `${k}: ${Math.round(c.s * step * step / 1e3)}k m² sim-only land, ${Math.round(c.e * step * step / 1e3)}k m² chart-only land`);
    console.log(`coastline: ${(100 * (simOnly + encOnly) / n).toFixed(2)}% of ${n} samples disagree (sim-only land ${simOnly}, chart-only land ${encOnly})\n  ` + worst.join('\n  '));
    expect((simOnly + encOnly) / n).toBeLessThan(0.015);
  });
});
