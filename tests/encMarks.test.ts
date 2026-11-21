import { describe, expect, it } from 'vitest';
import { ENC } from '../src/ui/encChart';
import { PLACES } from '../src/sim/places';
import { LL } from '../src/geo/geo';

// ENC check (21 Nov 2026): the government buoys and beacons the sim races round stand where NOAA's chart has them.
// (The yacht clubs' and YRA's own marks aren't charted, or not where the organizer now lays them: not checked here.)
const aidsM = ENC.aids.map(a => ({ name: a.name ?? '', p: LL(a.p[1] / 1e5, a.p[0] / 1e5) }));
const nearest = (p: { x: number; y: number }) => aidsM.reduce((b, a) => { const d = Math.hypot(a.p.x - p.x, a.p.y - p.y); return d < b.d ? { d, name: a.name } : b; }, { d: Infinity, name: '' });

describe('the government marks against the ENC', () => {
  it('Harding Rock (17) is the ENC\'s "HR", within 3 m (it was 28 m north: ENC check #3)', () => {
    const h = nearest(PLACES.find(p => p.id === 'm-17')!.p);
    expect(h.name).toMatch(/Harding Rock/); expect(h.d).toBeLessThan(3);
  });
  it('every lighted buoy and beacon among the marks is within 10 m of an ENC aid', () => {
    // (4 · Knox is drawn as a red lighted buoy but has no ENC aid within a kilometer: YRA's own, flagged in docs/charts/enc-check.md)
    for (const p of PLACES.filter(q => q.buoy && (q.buoy.shape === 'lighted' || q.buoy.shape === 'beacon') && q.id !== 'm-4')) expect(nearest(p.p).d, p.name).toBeLessThan(10);
  });
});
