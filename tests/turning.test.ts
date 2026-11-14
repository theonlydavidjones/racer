import { expect, it } from 'vitest';
import { RUDDER_STALL, helmForMoment, hullSide, hullYawM, rudderCoef, steadyTurnRate, turnDragN } from '../src/boat/turning';
import { HOVE } from '../src/boat/physics';
import { RUDDER } from '../src/boat/balance';
import { HULL } from '../src/boat/dynamics';
import { D2R, wrap } from '../src/core/math';
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

it("the blade's lift and drag run on through its stall with no step, and a helmsman's hardest helm stays short of it", () => {
  const e = 1e-4, a = rudderCoef(RUDDER_STALL - e), b = rudderCoef(RUDDER_STALL + e);
  expect(Math.abs(b.cl - a.cl)).toBeLessThan(0.01 * a.cl); expect(Math.abs(b.cd - a.cd)).toBeLessThan(0.02 * a.cd);
  // past it: less lift, much more drag; broadside-on a plate's 1.2, all drag
  expect(rudderCoef(30 * D2R).cl).toBeLessThan(a.cl); expect(rudderCoef(30 * D2R).cd).toBeGreaterThan(3 * a.cd);
  expect(rudderCoef(Math.PI / 2).cd).toBeCloseTo(1.2, 6); expect(Math.abs(rudderCoef(Math.PI / 2).cl)).toBeLessThan(1e-6);
  // asked for more turn than the blade can give, the helm goes to the stall and no further, in whatever water meets it
  for (const u of [0.5, 1.2, 2.4, 3.2]) for (const r of [-0.3, -0.05, 0, 0.05, 0.3]) for (const want of [-1e6, 1e6]) {
    const delta = helmForMoment(want, u, 0, r), aoa = delta - Math.atan2(HOVE.rudderFlow * r * RUDDER.arm, u);
    if (Math.abs(delta) < 30 * D2R - 1e-9) expect(Math.abs(aoa)).toBeLessThanOrEqual(RUDDER_STALL);
  }
});
it("a turn's drag goes as the square of the turn, to nothing with her way, and by what her keel is already carrying", () => {
  expect(turnDragN(0.2, 0)).toBe(0);
  expect(turnDragN(0.2, 2.4) / turnDragN(0.1, 2.4)).toBeCloseTo(4, 6);
  for (const u of [0.05, 0.2, 0.5, 1, 2.4]) expect(turnDragN(0.25, u)).toBeLessThanOrEqual(HULL.displacement * 1.2 * u * 0.25);
  // with 800 N of side force on her keel already: luffing (a turn toward the wind) loads it harder, bearing away unloads it
  expect(turnDragN(0.2, 2.4, 800)).toBeGreaterThan(turnDragN(0.2, 2.4)); expect(turnDragN(-0.2, 2.4, 800)).toBeLessThan(turnDragN(0.2, 2.4));
});
it('going astern, the helm hard over slows her sternway: it does not add to it', () => {
  const astern = (tiller: number) => {
    const b = testBoat({ heading: 0, kt: 0, windKt: 15 }) as Boat & { handsOff?: boolean };
    b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.handsOff = true; b.astern = 0.6;
    sail(b, 3, () => { b.tiller = tiller; });
    return b.astern ?? 0;
  };
  expect(astern(1)).toBeLessThanOrEqual(astern(0) + 1e-6);
});
it('left alone under bare poles she swings to lie with the wind near her beam, from head to wind or stern-to (computed from the drawn boat, not observed)', () => {
  for (const h of [15, 165]) {
    const b = testBoat({ heading: h, kt: 0, windFrom: 0, windKt: 12 }) as Boat & { handsOff?: boolean };
    b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.handsOff = true;
    sail(b, 240, () => { b.tiller = 0; });
    const off = Math.abs(((b.ww.from - b.h + 540) % 360) - 180);
    expect(off).toBeGreaterThan(70); expect(off).toBeLessThan(105);
    expect(Math.abs(b.turnRate ?? 0)).toBeLessThan(0.3); // (settled)
  }
});

it('aground with no way on, her crew gets her head round and off: backing the jib and sculling to get clear (RRS 42.3(h); Skipper Model, 14 Nov 2026)', () => {
  // (Skipper Model's case: an AI boat that touched a jetty on a reach, the wind abeam, wanting to bear away along it.
  // Stopped dead each time she drives in, she has no water over the rudder, and her sails' own weather helm rounds her
  // up at the jetty again. Held stopped here, as the jetty holds her)
  const turned = (aground: boolean) => {
    const b = testBoat({ heading: 10, kt: 0, windFrom: 283, windKt: 11 }); b.isUser = false; b.desired = 75;
    sail(b, 15, t => { b.v = 0; b.astern = 0; b.sway = 0; if (aground) b.groundT = t; });
    return wrap(b.h - 10);
  };
  // (left to her rudder she gets nowhere near it, or goes the other way)
  expect(turned(false)).toBeLessThan(25);
  // (her crew backing the jib: round at the sculled turn's pace, 4.4°/s, and so on her way inside a quarter of a minute)
  expect(turned(true)).toBeGreaterThan(35); expect(turned(true)).toBeLessThan(66); // (15 s at 4.4°/s is 66°, less her getting going)
  // (the leave ends a quarter of a minute after she last touched: no more of it once she's been off that long)
  const b = testBoat({ heading: 10, kt: 0, windFrom: 283, windKt: 11 }); b.isUser = false; b.desired = 190; b.groundT = -20;
  sail(b, 15, () => { b.v = 0; b.astern = 0; b.sway = 0; });
  expect(wrap(b.h - 10)).toBeLessThan(25);
});
