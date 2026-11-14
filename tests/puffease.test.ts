import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
import { testBoat, sail } from './helpers/testBoat';

// A puff she can't carry, upwind (physics.ts puffEase): the traveller down, then the main eased, held while it blows,
// back as it passes. A beat in a breeze, a puff of 10 kt more for 20 s, on a held course.
describe('A puff she can\'t carry: the traveller down, then the main (physics.ts puffEase)', () => {
  const puff = (base: number, gust: number, skill = 0.6) => {
    const twa = beatAngle(base), b = testBoat({ heading: 360 - twa, kt: 5, windKt: base });
    b.crew = newCrew({ helm: { ...DEFAULT_CREW.helm, skill }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill })) }, 'S');
    sail(b, 90, () => { b.h = 360 - twa; });
    const trav0 = b.ctl.traveller; let helmIn = 0, heelIn = 0, travIn = -2, easedBy = Infinity, gustAfter = 1;
    sail(b, 45, t => { b.h = 360 - twa; b.ww = { ...b.ww, kt: t > 5 && t < 25 ? gust : base };
      // (after the trimmer's first answer, a few seconds in: the tiller and the heel through the rest of the puff)
      if (t > 9 && t < 25) { helmIn = Math.max(helmIn, b.helmNeed ?? 0); heelIn = Math.max(heelIn, b.heelMag ?? 0); travIn = Math.max(travIn, b.ctl.traveller); }
      if (t > 5 && (b.gust ?? 0) > 0.3 && easedBy === Infinity) easedBy = t - 5;
      if (t > 40) gustAfter = b.gust ?? 0; });
    return { trav0, helmIn, heelIn, travIn, easedBy, gustAfter };
  };
  for (const [base, gust] of [[18, 28], [22, 32]]) it(`${base} kt with a puff to ${gust}: steerable through it, and back as it passes`, () => {
    const r = puff(base, gust);
    expect(r.easedBy, 'seconds to answer it').toBeLessThan(2);
    expect(r.travIn, 'the traveller down to leeward').toBeGreaterThan(0.95);
    expect(r.helmIn, 'weather helm through it, past the first answer').toBeLessThan(6); // (past about 6° they can't steer her: physics.ts)
    expect(r.heelIn, 'heel through it').toBeLessThan(30);
    expect(r.gustAfter, 'eased back once it has passed').toBe(0);
  }, 120_000);
  it('an expert crew answers sooner than a novice', () => {
    expect(puff(18, 28, 0.95).easedBy).toBeLessThan(puff(18, 28, 0.15).easedBy);
  }, 120_000);
});
