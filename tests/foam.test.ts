import { describe, expect, it } from 'vitest';
import { FOAM_DRIFT, foamDrift } from '../src/environment/sea';
import { KT } from '../src/core/math';

describe('foam drifts with the surface water (sea.ts foamDrift)', () => {
  it('in 20 kt with no current: about 3% of the wind, downwind (0.3 m/s), nothing like the wind or the waves', () => {
    const d = foamDrift(270, 20, { x: 0, y: 0 }), sp = Math.hypot(d.x, d.y);
    expect(sp).toBeCloseTo(20 * KT * FOAM_DRIFT, 6); expect(sp).toBeLessThan(0.5);
    expect(d.x).toBeGreaterThan(0); expect(Math.abs(d.y)).toBeLessThan(1e-9); // (a westerly sets it east)
  });
  it('with the current added: a 1.5 kt ebb carries it seaward faster than the wind drift does', () => {
    const ebb = { x: -1.5 * KT, y: 0 }, d = foamDrift(270, 20, ebb);
    expect(d.x).toBeCloseTo(20 * KT * FOAM_DRIFT - 1.5 * KT, 6);
  });
});
