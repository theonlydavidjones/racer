import { describe, expect, it, vi } from 'vitest';
import type { sailForces as SF } from '../src/boat/balance';

// r037 (the owner, 15 Nov 2026): "check that the wind over sails map is accounting for when I'm sailing on just jib or
// just main." The physics too: with the jib struck, the force model must see the main alone, its induced drag (the rig's
// span against its area), its centre of effort's height and its flatness the main's by itself, not a phantom jib's.
const calls: { args: Parameters<typeof SF>; jib: unknown; out: ReturnType<typeof SF> }[] = [];
vi.mock('../src/boat/balance', async orig => {
  const m = await orig<typeof import('../src/boat/balance')>();
  return { ...m, sailForces: (...a: Parameters<typeof SF>) => { const out = m.sailForces(...a); calls.push({ args: a, jib: a[3], out }); return out; } };
});
const { testBoat, sail, courseHeading } = await import('./helpers/testBoat');
const { sailForces } = await import('../src/boat/balance');

describe('the physics on the main alone (physics.ts step: the struck jib out of the air)', () => {
  it("the force model gets the main by itself: its induced drag, centre of effort and flatness the main's alone", () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
    sail(b, 30, () => { b.h = courseHeading(b, 318); });
    b.rig = { main: 1, jib: 0, mainUp: true, jibUp: false };
    const h = b.h; sail(b, 20, () => { b.h = h; });
    calls.length = 0; sail(b, 0.2, () => { b.h = h; });
    const step = calls[0]; // (the step's own call, the first each step)
    expect(step.jib).toBeNull();
    // the step's forces are the main's by itself, at the step's own wind; with the phantom jib (as before) they weren't
    const [aws, awa, main, , luff] = step.args, alone = sailForces(aws, awa, main, null, luff);
    const phantom = sailForces(aws, awa, main, { trim: b.trim.jib!, shape: b.shape.jib! }, luff);
    expect(step.out.ceh).toBeCloseTo(alone.ceh, 9); expect(step.out.flat).toBeCloseTo(alone.flat, 9);
    expect(step.out.main.drive).toBeCloseTo(alone.main.drive, 6); expect(step.out.jib.drive).toBe(0);
    // (the main alone: less area over the same span, so less induced drag and more drive from the same cloth; its centre
    // of effort its own, not the two sails' together)
    expect(alone.main.drive).toBeGreaterThan(phantom.main.drive);
    expect(Math.abs(alone.ceh - phantom.ceh)).toBeGreaterThan(0.01);
  });
  it('both up: the jib is in the air', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
    sail(b, 30, () => { b.h = courseHeading(b, 318); });
    calls.length = 0; sail(b, 0.2, () => { b.h = courseHeading(b, 318); });
    expect(calls[0].jib).not.toBeNull();
  });
});
