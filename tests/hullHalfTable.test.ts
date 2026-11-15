import { describe, expect, it } from 'vitest';
import { innerAt, hullInnerHalf, COCKPIT_FIT, FOOTREST } from '../src/render/hull';

// The bench's and the footrest's edges, read from a table along her after half (hull.ts innerAt) rather than bisecting
// her section each call: the same within a tenth of a millimeter all along her (Capacity's profile, 15 Nov 2026)
describe('hull.ts innerAt: the tabulated half-breadth at one height', () => {
  for (const [name, row, y] of [['the bench', 0, COCKPIT_FIT.seat], ['the footrest', 1, FOOTREST.y]] as const)
    it(`${name}: within 0.1 mm of hullInnerHalf, bow to stern`, () => {
      let worst = 0;
      for (let i = -40; i < 4040; i++) { const u = i / 4000 + 0.37e-4; worst = Math.max(worst, Math.abs(innerAt(row, u, y) - hullInnerHalf(u, y))); }
      expect(worst).toBeLessThan(1e-4);
    });
});
