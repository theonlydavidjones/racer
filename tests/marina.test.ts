import { describe, expect, it } from 'vitest';
import { HARBOR, SLIPS, inBasin, slipById } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { V } from '../src/core/math';

describe('West Harbor', () => {
  it('a basin you can sail in, with its docks and breakwaters solid', () => {
    expect(HARBOR.walkways.length).toBeGreaterThan(10); expect(HARBOR.fingers.length).toBeGreaterThan(100);
    const s = SLIPS[0];
    expect(inBasin(s.p)).toBe(true); expect(onLand(s.p)).toBe(false); // the water in a slip
    const w = HARBOR.walkways[0], mid = { x: (w[0].x + w[1].x) / 2, y: (w[0].y + w[1].y) / 2 };
    expect(onLand(mid)).toBe(true); // a dock
    expect(onLand(LL(37.8130, -122.4440))).toBe(false); // the Bay outside
  });
  it('slips for the fleet, each clear of the docks', () => {
    expect(SLIPS.length).toBeGreaterThan(250);
    expect(new Set(SLIPS.map(s => s.id)).size).toBe(SLIPS.length);
    for (const s of SLIPS) expect(onLand(s.p)).toBe(false);
  });
  it('the entrance is open: from the Bay you can reach a slip without crossing land (a coarse path search)', () => {
    const start = LL(37.8095, -122.4385), goal = slipById(SLIPS[Math.floor(SLIPS.length / 2)].id)!.p, step = 8;
    const key = (p: { x: number; y: number }) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
    const seen = new Set([key(start)]); let frontier = [start], found = false;
    for (let it = 0; it < 400 && frontier.length && !found; it++) {
      const next: typeof frontier = [];
      for (const p of frontier) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
        if (seen.has(k) || onLand(q) || Math.hypot(q.x - start.x, q.y - start.y) > 1500) continue;
        seen.add(k); next.push(q); if (Math.hypot(q.x - goal.x, q.y - goal.y) < step * 1.5) found = true;
      }
      frontier = next;
    }
    expect(found).toBe(true);
  });
  it('Cruise from her slip: in it, bow out, stopped; and home again when she comes back in and stops', () => {
    const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14' };
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    expect(w.homeSlip?.id).toBe(slip.id); expect(u.v).toBe(0);
    expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(1);
    const out = V(slip.heading + 180); expect(Math.sin(u.h * Math.PI / 180) * out.x + Math.cos(u.h * Math.PI / 180) * out.y).toBeGreaterThan(0.99);
    w.t = 300; Object.assign(u, { x: slip.p.x, y: slip.p.y, v: 0.2 }); w.step(DT);
    expect(w.arrivedT).not.toBeNull();
  });
});
