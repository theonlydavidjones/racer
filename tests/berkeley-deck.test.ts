import { describe, expect, it } from 'vitest';
import { onLand, wharfNearest } from '../src/geo/shore';

/**
 * w044: the water beside the Berkeley Pier's deck is water (the physics review of nav-pier, 19 Nov 2026; ROADMAP 8q8).
 * The terrain's 50 m land cells read two squares astride the 6.6 m deck as land, about 20 m either side of it, near
 * (10308–10356, 5480–5530) and (10880–10930, 5730–5780): the water a boat turns into after the gap at the deck's end,
 * northbound for the marina. NOAA's chart has no land and no construction there (ENC US5OAKFH ed. 1 upd. 1, issued
 * 2026-10-28, and US5OAKFI ed. 1 upd. 0, 2025-12-05: LNDARE and SLCONS), and the deck is OpenStreetMap's (way 32211603,
 * src/geo/data/east-piers.json): only the deck is solid.
 */
describe('the water beside the Berkeley Pier deck is water', () => {
  // (inside the two cells, off the deck by more than her beam)
  const BESIDE = [[10295, 5520], [10305, 5525], [10322, 5484], [10290, 5505], [10885, 5765], [10900, 5740], [10925, 5750], [10880, 5775], [10935, 5740]];
  it('beside the deck, inside the two 50 m cells: water', () => {
    for (const [x, y] of BESIDE) {
      const p = { x, y };
      expect((wharfNearest(p, 30)?.d ?? 99), `(${x}, ${y}) is off the deck`).toBeGreaterThan(3);
      expect(onLand(p), `(${x}, ${y})`).toBe(false);
    }
  });
  it('and the deck itself is still solid', () => {
    for (const [x, y] of [[10300, 5490], [10905, 5760]]) expect(onLand({ x, y }), `(${x}, ${y})`).toBe(true);
  });
});
