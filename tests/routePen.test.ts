import { describe, expect, it } from 'vitest';
import { PEN } from '../src/ui/draw2d';

// r267 (the owner): the navigator's route read as the red port layline, both dashed lines. The route is now a string of
// round dots, a pattern no layline (or the start line, or a ship's minute ahead) uses.
describe('the route on the chart (r267)', () => {
  it('is round dots, not dashes like the laylines', () => {
    expect(PEN.dest.cap).toBe('round');
    expect(PEN.dest.dash[0]).toBeLessThan(0.5); // (a near-zero dash with round caps: a dot)
    for (const other of [PEN.layline, PEN.start, PEN.ahead]) expect(other.dash[0]).toBeGreaterThanOrEqual(3);
  });
});
