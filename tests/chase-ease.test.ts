import { describe, it, expect } from 'vitest';
import { easeAngle, n360, wrap } from '../src/core/math';

// The chase camera eases its direction after the boat's heading (render/scene.ts). The owner (16 Nov 2026): "sometimes
// when I'm jibing the chase camera does a weird 360 spin around the boat". The old ease was never wrapped, so after
// two whole turns one way (penalty turns) its remainder's sign flipped and the camera swung the long way round.
const oldEase = (from: number, to: number, k: number) => from + (((to - from + 540) % 360) - 180) * k;

function maxStep(ease: (f: number, t: number, k: number) => number): number {
  let dir = 0, worst = 0;
  const k = Math.min(1, (1 / 60) * 3);
  // three whole turns to starboard (penalty turns), then a jibe through north, at 60 frames a second
  for (let i = 0; i <= 3 * 360 * 2 + 120; i++) {
    const h = n360(i * 0.5);
    const next = ease(dir, h, k);
    // the camera's actual swing this frame: its raw change (a value of 361 is not the same direction as 1 to the
    // ease that produced it, but the camera's V() is), measured the short way for the wrapped ease
    worst = Math.max(worst, ease === easeAngle ? Math.abs(wrap(next - dir)) : Math.abs(next - dir));
    dir = next;
  }
  return worst;
}

describe('chase camera ease', () => {
  it('never swings more than a few degrees in a frame through turns and a jibe', () => {
    expect(maxStep(easeAngle)).toBeLessThan(10);
  });
  it('the old, unwrapped ease swings the long way round (the bug)', () => {
    let dir = 720; // after two whole turns one way
    const next = oldEase(dir, 0, 0.05);
    expect(Math.abs(next - dir)).toBeGreaterThan(10); // a spin underway, toward a full circle
    expect(Math.abs(easeAngle(dir, 0, 0.05) - n360(dir))).toBeLessThan(1e-9);
  });
});
