// The passage planner reads the tidal stream on a 100 m grid, afresh each half minute of its clock (sim/outlook.ts),
// through CurrentField.atShoreKept: the shore's share kept for each point, since the tide doesn't change it. It must be
// the stream atShore gives, to the bit, at every point and time: in the open Bay, along the shores, by the piers and
// in the bays filled by continuity, through a whole day's tides, each point asked about many times over.
import { describe, expect, it } from 'vitest';
import { CurrentField, sfLocalToUtcMin, stationsFor } from '../src/environment/tide';
import { LL } from '../src/geo/geo';

describe("the planner's kept shore share", () => {
  it('atShoreKept is atShore, every point and time', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '00:00'), st = stationsFor(t0, t0 + 1440), kept = new CurrentField(st), fresh = new CurrentField(st);
    const o = LL(37.70, -122.56), pts: { x: number; y: number }[] = [];
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    // (on the planner's 100 m grid, over the Bay from the Gate to Richmond and Alameda)
    for (let k = 0; k < 400; k++) pts.push({ x: Math.round((o.x + 30000 * rnd()) / 100) * 100, y: Math.round((o.y + 30000 * rnd()) / 100) * 100 });
    let n = 0;
    for (let m = 0; m < 1440; m += 37.5) {
      kept.setTime(t0 + m); fresh.setTime(t0 + m);
      for (const p of pts) {
        const a = kept.atShoreKept(p, (p.x / 100 + 100000) * 200000 + (p.y / 100 + 100000)), b = fresh.atShore(p);
        expect(Object.is(a.x, b.x) && Object.is(a.y, b.y), `at (${p.x}, ${p.y}), minute ${m}: ${a.x}, ${a.y} kept; ${b.x}, ${b.y} afresh`).toBe(true);
        n++;
      }
    }
    expect(n).toBe(400 * 39);
  });
});
