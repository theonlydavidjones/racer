import { describe, expect, it } from 'vitest';
import { KT } from '../src/core/math';
import { Streaks, TIMELAPSE, streakMetres, type FlowField } from '../src/ui/flow';
import type { Tf } from '../src/ui/draw2d';

// The map's streaks are a time-lapse of the flow where they are (ROADMAP 8l, the owner's "rushing water"): a streak
// never crosses the water faster than TIMELAPSE times the local current (or wind), at any zoom.
const ctx = new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D;
function run(scale: number, kt: number, kind: 'current' | 'wind'): number {
  const field = { at: () => ({ kt, ux: 1, uy: 0 }) } as unknown as FlowField;
  const tf: Tf = (x, y) => [400 + x * scale, 300 - y * scale];
  const s = new Streaks(40), xs = () => Array.from((s as unknown as { xs: Float64Array }).xs);
  s.draw(ctx, tf, 800, 600, scale, field, kind, 0.05); // (they're scattered over the view)
  const a = xs(); for (let i = 0; i < 10; i++) s.draw(ctx, tf, 800, 600, scale, field, kind, 0.1);
  const b = xs(), moved = a.map((x, i) => b[i] - x).filter(d => d > 0); // (the ones that didn't leave the view and start again)
  expect(moved.length).toBeGreaterThan(5);
  return Math.max(...moved);
}
describe('the map\'s streaks', () => {
  for (const kind of ['current', 'wind'] as const) for (const kt of kind === 'current' ? [0.3, 2.5] : [6, 18]) {
    it(`${kind} ${kt} kt: one second of streak is ${TIMELAPSE[kind]} s of the flow, zoomed out or right in`, () => {
      const want = kt * KT * TIMELAPSE[kind]; // metres in one real second
      expect(streakMetres(kind, kt, 1)).toBeCloseTo(want, 6);
      for (const scale of [0.08, 0.25, 2, 6]) expect(run(scale, kt, kind)).toBeCloseTo(want, 3);
    });
  }
});
