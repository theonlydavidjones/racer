import { describe, expect, it } from 'vitest';
import { innerHalf } from '../src/render/crew';
import { hullInnerHalf, uAtZ } from '../src/render/hull';

/**
 * crew.ts innerHalf: the hull's inner half-breadth over the cockpit, tabled at 2 cm and read bilinearly, in place of
 * hull.ts hullInnerHalf's 30 bisections of her section a call, which ground() asked every frame for every figure
 * (Capacity, 15 Nov 2026: about 2 ms of JS a frame headless). It must stay true to the hull: within a millimetre.
 */
describe('The cockpit table of the hull inside (render/crew.ts innerHalf)', () => {
  it('agrees with hull.ts hullInnerHalf to under a millimetre over the cockpit', () => {
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let worst = 0, at = '';
    for (let n = 0; n < 4000; n++) {
      const z = 0.98 + rnd() * 1.86, y = -0.58 + rnd() * 1.63; // (its range: the cockpit, z 0.98 to 2.84, and from half a metre under the sole up past the deck)
      const d = Math.abs(innerHalf(z, y) - hullInnerHalf(uAtZ(z), y));
      if (d > worst) { worst = d; at = `z ${z.toFixed(3)} y ${y.toFixed(3)}`; }
    }
    console.log(`largest difference ${(worst * 1000).toFixed(3)} mm at ${at}`);
    expect(worst).toBeLessThan(0.001);
  });
});
