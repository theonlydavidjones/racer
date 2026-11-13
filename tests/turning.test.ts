import { expect, it } from 'vitest';
import { hullSide, hullYawM, steadyTurnRate } from '../src/boat/turning';
it('closed form matches the strips', () => {
  for (const [u, d, r] of [[2.4, 0.2, 0.05], [2.4, -0.2, 0.05], [1, 0.3, -0.08], [0, 0.25, 0.01], [-0.5, 0.4, 0.1], [2, 0.01, 0.3], [3, 0.3, 0]]) expect(hullYawM(u, d, r)).toBeCloseTo(hullSide(u, d, r).m, 6);
  expect(2 / steadyTurnRate(2)).toBeCloseTo(9.2, 0);
});
