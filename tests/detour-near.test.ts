// The AI's way round land, close beside a long pier (Deep Physics, 18 Nov 2026, the same fault as the tiller pilot's on
// the soak): within about 20 m of it, clearRun's side lines began abreast of her, one of them on the pier's far side, so
// every heading read blocked, detour found no way round, and she steered straight on for her mark, through the pier.
// Fixed (ai.ts clearRun, detour): the side lines from 50 m on, and the side once chosen kept. Here, the abandoned outer
// Berkeley Pier, 3 km long, between off
// the Berkeley Marina and off Emeryville.
import { describe, expect, it } from 'vitest';
import { detour } from '../src/ai/ai';
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
});
