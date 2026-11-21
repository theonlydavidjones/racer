import { describe, expect, it } from 'vitest';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import lw from '../src/geo/data/long-wharf-enc.json';

/**
 * Chevron's Long Wharf at Richmond: the water beside it is water, and what the chart has there stays solid (w044's
 * follow-up, the Coordinator, 21 Nov 2026). The terrain's 50 m cells read a band of land along the wharf, 12–30 m
 * either side of OpenStreetMap's outline (east-piers.json, way 28844087), where NOAA's chart has water (ENC US5OAKGG
 * ed. 1 upd. 1, issued 2026-04-22: no LNDARE, no SLCONS there). The chart also has the berth heads' platforms (LNDARE),
 * the wharf's pier lines (SLCONS) and a mooring dolphin (MORFAC) that OSM's outline lacks (long-wharf-enc.json): those
 * stay solid.
 */
describe('the water beside the Long Wharf is water, and its charted structures solid', () => {
  // (along the wharf, in the cells that read as land: water on the chart, 12 m or more off OSM's outline and the
  // chart's own pier lines)
  const BESIDE = [[3723, 13128], [3768, 13073], [2473, 12984], [3573, 12978], [3568, 12884], [2573, 12834], [2668, 12828], [3373, 12828], [2718, 12778], [3368, 12734], [2673, 12684], [3223, 12728], [2723, 12634], [3173, 12678], [2818, 12628], [3168, 12584], [2823, 12484], [2873, 12434], [2968, 12439], [3068, 12478], [2968, 12428], [3018, 12378], [2973, 12284], [3084, 12256]];
  it('beside the wharf, where the chart has water: water', () => {
    for (const [x, y] of BESIDE) expect(onLand({ x, y }), `(${x}, ${y})`).toBe(false);
  });
  it('the chart\'s berth platforms, its dolphin and its pier lines: solid', () => {
    const D = lw as unknown as { piers: { name: string; pts: [number, number][] }[]; lines: { pts: [number, number][] }[] };
    for (const a of D.piers) { const c = a.pts.reduce((s, [la, lo]) => ({ la: s.la + la / a.pts.length, lo: s.lo + lo / a.pts.length }), { la: 0, lo: 0 }); expect(onLand(LL(c.la, c.lo)), `${a.name} at ${c.la.toFixed(5)}, ${c.lo.toFixed(5)}`).toBe(true); }
    for (const l of D.lines) for (const [la, lo] of l.pts) expect(onLand(LL(la, lo)), `a pier line's point at ${la}, ${lo}`).toBe(true);
  });
});
