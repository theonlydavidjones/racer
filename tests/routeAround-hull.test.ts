import { describe, expect, it } from 'vitest';
import { routeAround } from '../src/sim/routing';
import { onLand } from '../src/geo/shore';
import { HARBORS } from '../src/geo/marina';
import { PLACES } from '../src/sim/places';
import type { Vec } from '../src/core/math';

/**
 * A way round the land (sim/routing.ts routeAround) keeps her hull off the land near its ends too (ROADMAP, "AI boats into
 * the harbor after an abandonment": at the call-off a boat by West Harbor's entrance brushed a breakwater's end as she
 * left; the Coordinator, 16 Nov 2026). Within 400 m of either end routeAround asked no clearance, only that the line
 * itself cross no land: from beside a harbor's entrance a leg passed a breakwater's end 0.25 m off (West Harbor), or
 * through its corner (Gashouse Cove, South Beach). Measured here on its own terms: every half meter along each leg,
 * nothing a boat runs aground on within 1.5 m (half her beam, 1.1 m, and a little), but for the first and last 4 m of a
 * leg (where she already is, or is going).
 */
const tightest = (r: Vec[]): number => {
  let worst = Infinity;
  for (let i = 1; i < r.length; i++) {
    const L = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y);
    for (let s = 4; s <= L - 4; s += 0.5) {
      const q = { x: r[i - 1].x + (r[i].x - r[i - 1].x) * s / L, y: r[i - 1].y + (r[i].y - r[i - 1].y) * s / L };
      for (let d = 0; d <= 1.5 && d < worst; d += 0.25) {
        let hit = false;
        for (let k = 0; k < 16 && !hit; k++) hit = onLand({ x: q.x + Math.sin(k * Math.PI / 8) * d, y: q.y + Math.cos(k * Math.PI / 8) * d });
        if (hit) { worst = d; break; }
      }
    }
  }
  return worst;
};
const exit = (id: string) => HARBORS.find(h => h.id === id)!.exits[0], place = (id: string) => PLACES.find(p => p.id === id)!.p;

describe('a way round the land keeps her hull off it near its ends', () => {
  // (from beside each entrance, the starts and destinations where main's way grazed or crossed a breakwater's end)
  for (const [harbor, dx, dy, to] of [['west-harbor', 10, 0, 'crissy'], ['gashouse-cove', 10, 3, 'alcatraz'], ['south-beach', 10, -17, 'alcatraz']] as const)
    it(`out of ${harbor}'s entrance toward ${to}: nothing within 1.5 m of any leg`, () => {
      const e = exit(harbor), a = { x: e.x + dx, y: e.y + dy };
      expect(onLand(a)).toBe(false);
      const r = routeAround(a, place(to));
      expect(tightest(r), JSON.stringify(r.map(p => [Math.round(p.x - e.x), Math.round(p.y - e.y)]))).toBe(Infinity);
    });
});
