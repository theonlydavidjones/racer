import { describe, expect, it } from 'vitest';
import { HULL_CLEAR, routeAround } from '../src/sim/routing';
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

/** The narrowest width of water any leg crosses, measured square to the leg every 2 m (m), and the least distance from
 * any leg to the land out to `lim` (m), but for each leg's first and last 4 m. */
const measure = (r: Vec[], lim: number) => {
  let narrow = Infinity, near = Infinity;
  for (let i = 1; i < r.length; i++) {
    const L = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y), ux = (r[i].x - r[i - 1].x) / L, uy = (r[i].y - r[i - 1].y) / L;
    for (let s = 4; s <= L - 4; s += 2) {
      const q = { x: r[i - 1].x + ux * s, y: r[i - 1].y + uy * s };
      for (let d = 0; d <= lim && d < near; d += 0.5)
        if (Array.from({ length: 24 }, (_, k) => k).some(k => onLand({ x: q.x + Math.sin(k * Math.PI / 12) * d, y: q.y + Math.cos(k * Math.PI / 12) * d }))) { near = d; break; }
      let l = 0, rr = 0;
      while (l < 600 && !onLand({ x: q.x - uy * l, y: q.y + ux * l })) l += 5;
      while (rr < 600 && !onLand({ x: q.x + uy * rr, y: q.y - ux * rr })) rr += 5;
      if (l < 600 && rr < 600) narrow = Math.min(narrow, l + rr);
    }
  }
  return { narrow, near };
};

describe("down the Estuary's narrowest reach, her full width clear", () => {
  // (the Coordinator, 16 Nov 2026: the stepped-down room, as little as 30 m, must not undo #442's rule that a way keeps her
  // hull off the land. From Grand Marina the way crosses the Estuary where it is about 210 m wide, measured 16 Nov 2026:
  // every leg there keeps HULL_CLEAR, 4 m, her full beam and more, from anything she could run aground on)
  it('Grand Marina to Pier 39: through the narrowest reach, nothing within 4 m of any leg', () => {
    const e = HARBORS.find(h => h.id === 'grand-marina')!.exits[0], r = routeAround({ x: e.x + 15, y: e.y + 15 }, place('pier39'));
    const { narrow, near } = measure(r, HULL_CLEAR), legs = JSON.stringify(r.map(p => [Math.round(p.x), Math.round(p.y)]));
    expect(narrow, legs).toBeLessThan(250);
    expect(near, legs).toBe(Infinity);
  }, 60_000);
});
