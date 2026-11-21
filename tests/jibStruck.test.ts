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
const { sailForces, RIG } = await import('../src/boat/balance');
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
    expect(step.args[3]).not.toBeNull(); expect(step.args[5]).toEqual({ main: 1, jib: 1 });
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
});
