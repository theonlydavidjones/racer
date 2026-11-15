import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
import { testBoat, sail, kt } from './helpers/testBoat';

// A puff she can't carry, upwind (physics.ts puffEase): the boom eased to the wider apparent wind, the car down the
// track first, then the sheet, by the puff's size and her heel and helm; back in as it passes. A beat in a breeze, a
// puff for 20 s, on a held course, against the same boat with nobody answering it (the trimmer never seeing it).
describe('A puff she can\'t carry: the car down, then the main (physics.ts puffEase)', () => {
  const puff = (base: number, gust: number, o: { skill?: number; answer?: boolean; yours?: boolean } = {}) => {
    const { skill = 0.6, answer = true, yours = false } = o, twa = beatAngle(base), b = testBoat({ heading: 360 - twa, kt: 5, windKt: base });
    b.crew = newCrew({ helm: { ...DEFAULT_CREW.helm, skill }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill })) }, 'S');
    if (yours) { b.isUser = true; b.hand = { ...b.hand, mainsheet: true }; }
    sail(b, 90, () => { b.h = 360 - twa; });
    const trav0 = b.ctl.traveller, boom0 = b.sheets.main;
    let helmIn = 0, helmMin = 99, heelIn = 0, heelHit = 0, carBy = Infinity, boomMin = 99, easedBy = Infinity, gustMax = 0, gustLate = 0, gustAfter = 1, v = 0, n = 0;
    sail(b, 45, t => { b.h = 360 - twa; b.ww = { ...b.ww, kt: t > 5 && t < 25 ? gust : base };
      if (!answer) b.gustSeen = 0; // (nobody sees it: no answer)
      if (t > 5 && t < 7) { boomMin = Math.min(boomMin, b.sheets.main); heelHit = Math.max(heelHit, b.heelMag ?? 0); }
      // (after the trimmer's first answer, a few seconds in: the tiller and the heel through the rest of the puff)
      if (t > 9 && t < 25) { helmIn = Math.max(helmIn, b.helmNeed ?? 0); helmMin = Math.min(helmMin, b.helmNeed ?? 0); heelIn = Math.max(heelIn, b.heelMag ?? 0); }
      if (t > 5 && t < 35) { v += kt(b); n++; }
      if (t > 5 && b.ctl.traveller > 0.95 && carBy === Infinity) carBy = t - 5;
      if (t > 5 && (b.gustDeg ?? 0) > 1 && easedBy === Infinity) easedBy = t - 5;
      gustMax = Math.max(gustMax, b.gust ?? 0); if (t > 9 && t < 25) gustLate = Math.max(gustLate, b.gust ?? 0);
      if (t > 40) gustAfter = b.gust ?? 0; });
    return { trav0, boom0, helmIn, helmMin, heelIn, heelHit, carBy, boomMin, easedBy, gustMax, gustLate, gustAfter, v: v / n };
  };
  for (const [base, gust] of [[13, 23], [18, 28], [22, 32]]) it(`${base} kt with a puff to ${gust}: steerable through it, as fast, and back as it passes`, () => {
    const r = puff(base, gust), none = puff(base, gust, { answer: false });
    expect(r.easedBy, 'seconds to answer it').toBeLessThan(2);
    expect(r.carBy, 'the car let go down the track at once, not after the sheet').toBeLessThan(2);
    expect(r.boomMin, 'the boom not trimmed in as she heels in the hit').toBeGreaterThan(r.boom0 - 0.5);
    expect(r.helmIn, 'weather helm through it, past the first answer').toBeLessThan(6); // (past about 6° they can't steer her: physics.ts)
    expect(r.helmIn, '... and well under what she carries unanswered').toBeLessThan(none.helmIn * 0.75);
    expect(r.helmMin, 'not eased into lee helm').toBeGreaterThan(-1);
    expect(r.heelIn, 'heel through it').toBeLessThan(30);
    expect(r.v, 'no slower through it than unanswered').toBeGreaterThan(none.v * 0.98);
    expect(r.gustAfter, 'sheeted back in once it has passed').toBe(0);
  }, 120_000);
  for (const [base, gust] of [[8, 14], [10, 16]]) it(`${base} kt with a puff to ${gust}: one she can carry, power, not eased for`, () => {
    const r = puff(base, gust), none = puff(base, gust, { answer: false });
    // (heeled to the mark for a moment in the hit, before she's up to speed, she may be eased a little for a second or
    // two; through the puff, none: it's power)
    expect(r.gustMax, 'eased in the hit').toBeLessThan(0.6);
    expect(r.gustLate, 'eased through the puff').toBe(0);
    expect(r.v, 'no slower through it than unanswered').toBeGreaterThan(none.v * 0.995);
  }, 120_000);
  it('an expert crew answers sooner than a novice', () => {
    expect(puff(18, 28, { skill: 0.95 }).easedBy).toBeLessThan(puff(18, 28, { skill: 0.15 }).easedBy);
  }, 120_000);
  it('with your hand on the mainsheet, the boom is yours: the crew answer nothing, nor drop the car', () => {
    const r = puff(18, 28, { yours: true });
    expect(r.gustMax).toBe(0);
  }, 120_000);
});
