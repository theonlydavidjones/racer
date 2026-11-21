import { describe, expect, it } from 'vitest';
import { ROUTES } from '../src/sim/traffic';
import { onLand } from '../src/geo/shore';
import { ENC } from '../src/ui/encChart';
import { LL } from '../src/geo/geo';

// ENC check #4 and #5 (21 Nov 2026): the ships ran across Yerba Buena Island and the tour boats turned ashore at Lime
// Point. Every route, sampled every 10 m, off the land a boat runs aground on; the big ships' inside NOAA's traffic
// scheme: never in a separation zone (the chart's own, from the ENC).
const along = (r: { x: number; y: number }[], f: (p: { x: number; y: number }) => void) => {
  for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
    for (let k = 0; k <= n; k++) f({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); }
};
const ring = (pts: number[]) => { const out: { x: number; y: number }[] = []; let x = 0, y = 0; for (let i = 0; i < pts.length; i += 2) { x += pts[i]; y += pts[i + 1]; out.push(LL(y / 1e5, x / 1e5)); } return out; };
const inRing = (p: { x: number; y: number }, r: { x: number; y: number }[]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };

describe('the traffic routes (ENC check #4, #5)', () => {
  it('no route runs over land', () => {
    for (const [k, r] of Object.entries(ROUTES)) {
      let ashore = 0; along(r, p => { if (onLand(p)) ashore++; });
      expect(ashore, k).toBe(0);
    }
  });
  it('the big ships never enter a separation zone', () => {
    const zones = ENC.areas.filter(a => a.k === 'sepzone' && a.f?.length).flatMap(a => a.f!.map(poly => ring(poly[0])));
    expect(zones.length).toBeGreaterThan(0);
    for (const k of ['channel', 'channelOut']) { let inZone = 0; along(ROUTES[k], p => { if (zones.some(z => inRing(p, z))) inZone++; }); expect(inZone, k).toBe(0); }
  });
});
