import { describe, expect, it, vi } from 'vitest';
import type { sailForces as SF } from '../src/boat/balance';

// r037 (the owner, 15 Nov 2026): "check that the wind over sails map is accounting for when I'm sailing on just jib or
// just main." The physics too: each sail's area and centre of effort weighted by how much of it is hoisted, inside the
// force model, so on the main alone the rig is the main's, on the jib alone the jib's, and the heeling moment changes
// smoothly as a sail goes up (the physics review of v214: a phantom main heeled her a third too hard under jib alone).
const calls: { args: Parameters<typeof SF>; out: ReturnType<typeof SF> }[] = [];
vi.mock('../src/boat/balance', async orig => {
  const m = await orig<typeof import('../src/boat/balance')>();
  return { ...m, sailForces: (...a: Parameters<typeof SF>) => { const out = m.sailForces(...a); calls.push({ args: a, out }); return out; } };
});
const { testBoat, sail, courseHeading } = await import('./helpers/testBoat');
const { sailForces, RIG, rigSpanHeight } = await import('../src/boat/balance');
const { hoistDraw } = await import('../src/boat/controls');
type Boat = import('../src/boat/boat').Boat;

/** The centre of effort's height above the hull's centre of pressure for one sail by itself (balance.ts, eqs. 5.39–5.40). */
const oneSailCeh = (z: number, flat: number) => RIG.hbi + z * (1 - (0.5 * (1 - flat) + 0.902 * (1 - flat) * (1 - RIG.frac)) * (1 - (RIG.overlap - 0.9) / 0.6)) + RIG.rm4;
/** Upwind in 12 kt, then on `rig` for 20 s; the step's own call to the force model. */
function onRig(rig?: Boat['rig']): { b: Boat; step: (typeof calls)[number] } {
  const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
  sail(b, 30, () => { b.h = courseHeading(b, 318); });
  if (rig) { b.rig = rig; const h = b.h; sail(b, 20, () => { b.h = h; }); }
  calls.length = 0; const h = b.h; sail(b, 0.2, () => { b.h = h; });
  return { b, step: calls[0] }; // (the step's own call, the first each step)
}

describe('the physics on one sail (balance.ts sailForces, weighted by each sail\'s hoist)', () => {
  it('on the main alone: the rig\'s centre of effort and flatness are the main\'s by itself', () => {
    const { step } = onRig({ main: 1, jib: 0, mainUp: true, jibUp: false }), up = step.args[5]!;
    expect(up.jib).toBe(0); expect(up.main).toBe(1);
    const [aws, awa, main, , luff] = step.args, alone = sailForces(aws, awa, main, null, luff);
    expect(step.out.ceh).toBeCloseTo(alone.ceh, 2); expect(step.out.flat).toBeCloseTo(alone.flat, 2);
    expect(step.out.ceh).toBeCloseTo(oneSailCeh(RIG.zMain, step.out.flat), 2);
  });
  it('on the jib alone: the arm is the jib\'s, about a third lower than the two sails\' (no phantom main)', () => {
    const { step } = onRig({ main: 0, jib: 1, mainUp: false, jibUp: true }), both = onRig().step;
    expect(step.args[5]!.main).toBe(0);
    expect(Math.abs(step.out.ceh - oneSailCeh(RIG.zJib, step.out.flat))).toBeLessThan(0.02); // (the struck main's 0.1% of area kept)
    expect(step.out.ceh).toBeLessThan(both.out.ceh * 0.85);
  });
  it('both up: the jib is in the air, both at full weight', () => {
    const { step } = onRig();
    expect(step.args[3]).not.toBeNull(); expect(step.args[5]).toEqual({ main: 1, jib: 1, wMain: 1, wJib: 1 });
  });
  it('the heeling moment changes smoothly as the jib goes up, 0 to 1 (no step at any hoist)', () => {
    const { step } = onRig(), [aws, awa, main, jib, luff] = step.args;
    let last = NaN, worst = 0;
    for (let i = 0; i <= 200; i++) {
      const h = i / 200, sf = sailForces(aws, awa, main, jib, luff, { main: 1, jib: h });
      const M = (sf.main.heel + sf.jib.heel * h * hoistDraw(h, 'jib')) * sf.ceh; // (as physics.ts step: each sail's force by its hoist)
      if (i) worst = Math.max(worst, Math.abs(M - last) / last);
      last = M;
    }
    expect(worst).toBeLessThan(0.01); // (each half-percent of hoist moves the moment under 1%)
  });
  it("the rig's span is the hoisted rig's: on the jib alone 7.15 m (IG + HBI), not the 10.4 m mast (the v215 review)", () => {
    expect(rigSpanHeight({ main: 0, jib: 1 })).toBeCloseTo(RIG.IG + RIG.hbi, 6); expect(RIG.IG + RIG.hbi).toBeCloseTo(7.15, 2);
    expect(rigSpanHeight({ main: 1, jib: 1 })).toBeCloseTo(RIG.P + RIG.BAS + RIG.hbi, 6);
    expect(rigSpanHeight({ main: 1, jib: 0 }, false)).toBeCloseTo(10.4, 2);
    // the step under jib alone: the jib's shorter span, so more induced drag than the whole mast's would give it (the
    // review: about 4 N of drive in 150 N at 16 kt apparent)
    const { step } = onRig({ main: 0, jib: 1, mainUp: false, jibUp: true }), [aws, awa, main, jib, luff, up] = step.args;
    expect(up!.main).toBe(0); expect(up!.wMain).toBe(0); expect(up!.wJib).toBeGreaterThan(0.9);
    const mast = sailForces(aws, awa, main, jib, luff, { ...up!, main: 1 }); // (the span as if the mast were all rig: as before)
    expect(step.out.jib.drive).toBeLessThan(mast.jib.drive);
  });
  // (a sail part-hoisted is drawn squeezed onto its boom or stay, the tack where it is and the luff h of its length,
  // boatMesh.ts: ORC eq. 5.7's centre of effort, its girths' centroid, scales with the luff that's up)
  it('the arm falls with the hoist: a part-hoisted sail\'s centre of effort is as high as its luff is up', () => {
    const { step } = onRig(), [aws, awa, main, jib, luff] = step.args;
    for (const h of [0.25, 0.5, 0.75, 1]) {
      const m = sailForces(aws, awa, main, null, luff, { main: h, jib: 0 });
      expect(Math.abs(m.ceh - oneSailCeh(RIG.BAS + h * (RIG.zMain - RIG.BAS), m.flat))).toBeLessThan(0.02);
      const j = sailForces(aws, awa, main, jib, luff, { main: 0, jib: h });
      expect(Math.abs(j.ceh - oneSailCeh(h * RIG.zJib, j.flat))).toBeLessThan(0.02);
    }
    const half = sailForces(aws, awa, main, null, luff, { main: 0.5, jib: 0 }), full = sailForces(aws, awa, main, null, luff, { main: 1, jib: 0 });
    expect(full.ceh - half.ceh).toBeGreaterThan(1); // (half the main's luff up: its arm about 1.7 m lower)
  });
  for (const which of ['main', 'jib'] as const) it(`the forces and the arm change smoothly as the ${which} goes up, 0 to 1, weighted as physics.ts weights them`, () => {
    const { step } = onRig(), [aws, awa, main, jib, luff] = step.args;
    let last: number[] = [], worst = 0;
    for (let i = 0; i <= 400; i++) {
      const h = i / 400, d = h * hoistDraw(h, which), up = which === 'main' ? { main: h, jib: 1, wMain: d, wJib: 1 } : { main: 1, jib: h, wMain: 1, wJib: d };
      const sf = sailForces(aws, awa, main, jib, luff, up), k = which === 'main' ? [d, 1] : [1, d];
      const now = [sf.main.heel * k[0] + sf.jib.heel * k[1], sf.main.drive * k[0] + sf.jib.drive * k[1], sf.ceh];
      if (i) now.forEach((v, j) => { worst = Math.max(worst, Math.abs(v - last[j]) / Math.max(1, Math.abs(last[j]))); });
      last = now;
    }
    expect(worst).toBeLessThan(0.02); // (each quarter-percent of hoist moves the heel, drive and arm under 2%)
  });
});
