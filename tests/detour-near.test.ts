// The AI's way round land, close beside a long pier (Deep Physics, 18 Nov 2026, the same fault as the tiller pilot's on
// the soak): within about 25 m of it, clearRun's side lines began abreast of her, one of them on the pier's far side, so
// every heading read blocked, detour found no way round, and she steered straight on for her mark, through the pier.
// Fixed (ai.ts clearRun, detour, wayRound): the side lines full width from 50 m on, and the side once chosen kept. Here, the abandoned outer Berkeley Pier, 3 km long, between off the Berkeley Marina and off Emeryville; it
// joins the shore at its east end, so only one end is a way round.
import { describe, expect, it } from 'vitest';
import { detour, wayRound } from '../src/ai/ai';
import { routeAround } from '../src/sim/routing';
import { landAlong, onLand } from '../src/geo/shore';
import { PLACES } from '../src/sim/places';
import { brg, wrap, type Vec } from '../src/core/math';

const from = PLACES.find(p => p.id === 'berkeley')!.p, to = PLACES.find(p => p.id === 'emeryville')!.p;
const along = (a: Vec, b: Vec, d: number) => { const L = Math.hypot(b.x - a.x, b.y - a.y); return { x: a.x + (b.x - a.x) * d / L, y: a.y + (b.y - a.y) * d / L }; };

describe('the AI round a long pier close beside her', () => {
  // where the straight line from off the Marina to Emeryville first meets the pier (it runs about 110°/290° there)
  const h = landAlong(from, to), H = along(from, to, h);
  // her positions in the water just off the pier's near side, a few metres to about 25 m off it, where on main every
  // heading read blocked (a probe of the 6 m grid round H: 40 such points, all found a clear way after the fix)
  it.each([[-48, -12], [-30, -6], [-24, 0], [-12, 0], [-6, 6]])('at H %i, %i m: a way round, clear of it from where she is', (dx, dy) => {
    expect(h).toBeLessThan(Infinity);
    const b = { x: H.x + dx, y: H.y + dy };
    expect(onLand(b)).toBe(false);
    expect(landAlong(b, to), 'her straight line to the mark crosses the pier').toBeLessThan(Infinity);
    const q = detour(b, to);
    expect(q, 'no way round: she steers straight on through it').not.toBeNull();
    expect(landAlong(b, q!), 'the way round crosses land').toBe(Infinity);
    expect(Math.abs(wrap(brg(q!.x - b.x, q!.y - b.y) - brg(to.x - b.x, to.y - b.y)))).toBeGreaterThan(5);
  });

  // sailing on from there, re-planning every 5 m with her side kept, as the AI does: past the pier within 1.5 times the
  // way by water, never across it, never swapping sides (on main she found no way, or chosen afresh she weaved along it)
  it.each([[-30, -6], [-6, 6], [-48, -12]])('from H %i, %i m she sails on round it, never across it', (dx, dy) => {
    let b = { x: H.x + dx, y: H.y + dy }, side = 0, run = 0, q: Vec | null = null;
    const way = routeAround(b, to, 30); let byWater = 0; for (let i = 1; i < way.length; i++) byWater += Math.hypot(way[i].x - way[i - 1].x, way[i].y - way[i - 1].y);
    while (run < 1.5 * byWater && landAlong(b, to) < Infinity) {
      if (!q || Math.hypot(q.x - b.x, q.y - b.y) < 40 || landAlong(b, q) < Infinity) { const r = wayRound(b, to, side); expect(!side || !r.side || r.side === side, 'swapped sides').toBe(true); q = r.q; side = r.side; }
      expect(q, `no way round ${run.toFixed(0)} m on`).not.toBeNull();
      const n = along(b, q!, 5);
      expect(landAlong(b, n), `across land ${run.toFixed(0)} m on`).toBe(Infinity);
      b = n; run += 5;
    }
    expect(landAlong(b, to), `still behind the pier after ${run.toFixed(0)} m (the way by water ${byWater.toFixed(0)} m)`).toBe(Infinity);
  });
});
