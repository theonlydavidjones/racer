import { describe, expect, it } from 'vitest';
import { ground, innerHalf } from '../src/render/crew';
import { COCKPIT, COCKPIT_FIT, cockpitHalf, hullInnerHalf, thwartBottom, thwartTop, uAtZ } from '../src/render/hull';

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

// The thwart is a beam, open beneath it (hull.ts thwartBottom): a foot can hook under it. The check is no weaker for
// anything in the beam itself: a point inside its body reads as under the thwart's top with the height given (ground's
// new way) as without it (the old, solid down to the sole), so crewfig's through() flags a shin through it either way.
describe('crew.ts ground: the thwart a beam, open under it', () => {
  const T = COCKPIT_FIT.thwart, top = thwartTop(), w = cockpitHalf(uAtZ(T.z)) - 0.02;
  it('a point inside the beam is in it, read either way', () => {
    for (let i = 0; i <= 20; i++) for (const fz of [-0.8, 0, 0.8]) for (const fy of [0.1, 0.5, 0.9]) {
      const x = -w + 2 * w * i / 20, z = T.z + fz * T.half, y = thwartBottom(x) + fy * (top - thwartBottom(x));
      const old = ground(x, z), now = ground(x, z, y);
      expect(old, `old at ${x.toFixed(2)}`).toBe(top); expect(now, `new at ${x.toFixed(2)}, ${y.toFixed(2)}`).toBe(top);
      if (top - y > 0.025) expect(y < now - 0.025, 'flagged as into it (as crewfig through())').toBe(true);
    }
  });
  it('under the beam, the floor below it, not the thwart', () => {
    for (let i = 0; i <= 20; i++) { const x = -w + 2 * w * i / 20, y = thwartBottom(x) - 0.05; expect(ground(x, T.z, y), `at ${x.toFixed(2)}`).toBeLessThan(thwartBottom(x)); expect(ground(x, T.z, y)).toBeGreaterThanOrEqual(COCKPIT.sole - 0.6); }
  });
});
