import { describe, expect, it } from 'vitest';
import { LL } from '../src/geo/geo';
import { SHORE, onLand } from '../src/geo/shore';
import { shoreKind } from '../src/geo/shoreKind';
import { V, type Vec } from '../src/core/math';

/** What the water's edge is made of, from NOAA's chart (geo/shoreKind.ts; enc-chart.json shoreKinds). */
const firstLand = (la: number, lo: number, h: number): Vec => { const s = LL(la, lo), u = V(h); let d = 0; while (!onLand({ x: s.x + u.x * d, y: s.y + u.y * d }) && d < 2000) d += 0.25; return { x: s.x + u.x * d, y: s.y + u.y * d }; };

describe('the shore\'s kinds, from the chart', () => {
  it('reads the Cityfront as it is: the Marina Green a seawall, Aquatic Park\'s pier concrete, West Harbor\'s breakwater riprap, Crissy Field\'s shore natural coast of unknown kind (mud)', () => {
    expect(shoreKind(firstLand(37.8095, -122.4380, 180))).toEqual({ kind: 'concrete', name: 'the seawall' });
    expect(shoreKind(firstLand(37.8095, -122.4215, 180))).toEqual({ kind: 'concrete', name: 'the pier' });
    expect(shoreKind(firstLand(37.8098, -122.4410, 180))).toEqual({ kind: 'rock', name: 'the riprap' });
    expect(shoreKind(firstLand(37.8075, -122.4560, 180))).toBeNull(); // (the chart's natural coast there has no category: physics.ts reads it as mud)
  });
  it('gives most of the sim\'s own coastline (the Cityfront: OpenStreetMap\'s) a kind (81% of its points today, 557 of 686; the rest is natural coast the chart leaves uncategorized)', () => {
    const n = SHORE.filter(p => shoreKind(p)).length;
    expect(n / SHORE.length).toBeGreaterThan(0.8);
  });
  it('nothing far from the shore', () => {
    expect(shoreKind(LL(37.8200, -122.4400))).toBeNull(); // (the middle of the Bay off the Cityfront)
  });
});
