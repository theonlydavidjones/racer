import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { turnSpeed } from '../src/boat/physics';
import { beatAngle } from '../src/boat/polar';
import type { Boat } from '../src/boat/boat';

/**
 * The speed law a predicted turn is stepped by (physics.ts turnSpeed; arcs.ts, the rules' and the AI's "could she get
 * clear?") against the boat's own step, through a tack: the law is fed her real heading and turn rate each step, so what
 * is measured is the speed alone. Flat water, the AI's helm. (Skipper Model, 14 Nov 2026: tacks judged near another
 * boat were sailed slower than predicted. The law held; what it lacked was her sheets let fly, which the AI does to slow
 * and to keep clear, and which takes her down to half a meter a second through a tack in 22 kt.)
 */
function tack(kt: number, luff: boolean) {
  const beat = beatAngle(kt), b = testBoat({ heading: 360 - beat - 4, kt: 4, windKt: kt }); b.isUser = false; (b as unknown as { ai: unknown }).ai = { turnCommit: 0, commitFor: 0, commitLong: false };
  sail(b, 40, () => { b.desired = 360 - beat - 4; });
  let law = b.v, plain = b.v, worst = 0, next = 1;
  const step = (v: number, b: Boat, l: boolean) => turnSpeed(v, b.turnRate ?? 0, b.h, 0, kt, 1 / 60, b.helmNeed ?? 0, b.leeway ?? 4, l);
  sail(b, 8, t => {
    b.desired = beat + 4; b.luff = luff; law = step(law, b, luff); plain = step(plain, b, false);
    if (t >= next - 1e-9) { worst = Math.max(worst, Math.abs(law - b.v)); next++; }
  });
  return { worst, real: b.v, law, plain };
}

describe('the predicted turn\'s speed, against the boat\'s own', () => {
  it('through a tack with her sails drawing: within 0.15 m/s of her every second, at 8, 12 and 22 kt', () => {
    for (const kt of [8, 12, 22]) expect(tack(kt, false).worst, `${kt} kt`).toBeLessThan(0.15);
  });
  it('through a tack with her sheets let fly: within 0.1 m/s every second at 8 and 12 kt, 0.3 at 22 kt (the law the slower); without the luff it has her 0.15 to 0.4 m/s too fast after 8 s', () => {
    for (const [kt, tol, gap] of [[8, 0.1, 0.12], [12, 0.1, 0.25], [22, 0.3, 0.3]] as const) {
      const r = tack(kt, true);
      expect(r.worst, `${kt} kt`).toBeLessThan(tol);
      expect(r.plain - r.real, `${kt} kt: the law with her sails drawing, against her with them flying`).toBeGreaterThan(gap);
      expect(r.law, `${kt} kt: never the faster by more than a tenth`).toBeLessThan(r.real + 0.1);
    }
  });
});
