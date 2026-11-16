import { describe, expect, it } from 'vitest';
import { routeAround } from '../src/sim/routing';
import { landAlong, onLand } from '../src/geo/shore';
import { HARBORS } from '../src/geo/marina';
import { PLACES } from '../src/sim/places';
import type { Vec } from '../src/core/math';

/**
 * Out of the Oakland Estuary's harbors to the central Bay, the way round the land goes down the Estuary and round
 * Alameda's west end, not through Alameda (ROADMAP; found reviewing #442, 16 Nov 2026). The Estuary is a few hundred
 * meters wide: at routeAround's 120 m off the land every cell of it but its ends was blocked, and the way fell back to
 * the straight line through the land. Measured on its own terms: no leg crosses anything a boat runs aground on, and none
 * passes within 1.5 m of it (half her beam, 1.1 m, and a little) but for its first and last 4 m.
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
const place = (id: string) => PLACES.find(p => p.id === id)!.p;

describe('out of the Estuary, round Alameda, not through it', () => {
  for (const harbor of ['encinal', 'oakland-yc', 'marina-village', 'fortmann', 'grand-marina', 'alameda-marina'])
    for (const to of ['pier39', 'alcatraz'])
      it(`${harbor} to ${to}: through nothing, and nothing within 1.5 m of any leg`, () => {
        const H = HARBORS.find(h => h.id === harbor)!, e = H.exits[0], a = { x: e.x + 15, y: e.y + 15 };
        expect(onLand(a)).toBe(false);
        const r = routeAround(a, place(to)), legs = JSON.stringify(r.map(p => [Math.round(p.x), Math.round(p.y)]));
        expect(r.slice(1).every((p, i) => landAlong(r[i], p) === Infinity), `through the land: ${legs}`).toBe(true);
        expect(tightest(r), legs).toBe(Infinity);
      }, 60_000);
});
