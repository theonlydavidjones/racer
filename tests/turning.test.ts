import { expect, it } from 'vitest';
import { hullSide, hullYawM, steadyTurnRate } from '../src/boat/turning';
import { testBoat, sail, kt } from './helpers/testBoat';
import type { Boat } from '../src/boat/boat';
it('closed form matches the strips', () => {
  for (const [u, d, r] of [[2.4, 0.2, 0.05], [2.4, -0.2, 0.05], [1, 0.3, -0.08], [0, 0.25, 0.01], [-0.5, 0.4, 0.1], [2, 0.01, 0.3], [3, 0.3, 0]]) expect(hullYawM(u, d, r)).toBeCloseTo(hullSide(u, d, r).m, 6);
  expect(2 / steadyTurnRate(2)).toBeCloseTo(9.2, 0);
});

it('under jib alone on a dead run she sails: nothing blankets the jib with the main down (Marinas, 13 Nov 2026)', () => {
  const run = (main: number, jib: number) => {
    const b = testBoat({ heading: 176, kt: 1, windKt: 8 }) as Boat & { handsOff?: boolean };
    b.rig = { main, jib, mainUp: main > 0, jibUp: jib > 0 }; b.handsOff = true;
    sail(b, 120, () => { b.h = 176; b.turnRate = 0; b.tiller = 0; });
    return kt(b);
  };
  const bare = run(0, 0), jibOnly = run(0, 1), full = run(1, 1);
  expect(jibOnly).toBeGreaterThan(bare + 1); // (a knot or two in 8 kt: the jib is 29% of her sail)
  expect(jibOnly).toBeLessThan(full - 0.5);
});

it('under bare poles beam-on in 25 kt the wind on her topsides, rig and crew heels her a few degrees to leeward (Crew Model, 13 Nov 2026)', () => {
  const heelIn = (windKt: number) => {
    const b = testBoat({ heading: 90, kt: 0, windKt }) as Boat & { handsOff?: boolean };
    b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.handsOff = true;
    sail(b, 60, () => { b.h = 90; b.turnRate = 0; b.tiller = 0; b.v = 0; });
    return b.heelMag ?? 0;
  };
  // (ORC's windage in the heeling moment, VPP 2023 eq. 5.56: about 1,200 N·m in 25 kt, against some 300 N·m a degree.
  // Against 8 kt, where her heel is nearly all her crew's weight, wherever they sit: about 4° further to leeward)
  const h25 = heelIn(25), h8 = heelIn(8);
expect(h25).toBeGreaterThan(h8 + 1.5); expect(h25 - h8).toBeLessThan(6);
});
