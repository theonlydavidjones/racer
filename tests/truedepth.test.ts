import { describe, expect, it } from 'vitest';
import { trueDepth } from './helpers/trueDepth';
import { ground } from '../src/render/crew';
import { CABIN, COCKPIT, L } from '../src/render/hull';

// The pose checks' depth (crewfig through(), the sprint's soak): the least of straight down and sideways out from under
// ground(). The Coordinator's condition (18 Nov 2026): nothing the old straight-down check caught away from a step face
// may pass the new one, so a limb 10 cm into the middle of the cabin top or of the cockpit sole still reads 10 cm.
describe('A limb\'s depth into the boat (tests/helpers/trueDepth)', () => {
  const zCab = -L / 2 + (CABIN.u0 + CABIN.u1) / 2 * L, zCock = -L / 2 + (COCKPIT.u0 + COCKPIT.u1) / 2 * L, zFace = -L / 2 + CABIN.u1 * L;
  it('10 cm into the middle of the cabin top: 10 cm', () => { const y = ground(0, zCab) - 0.1; expect(trueDepth(0, y, zCab)).toBeGreaterThan(0.095); });
  it('10 cm into the middle of the cockpit sole: 10 cm', () => { const y = ground(0, zCock) - 0.1; expect(trueDepth(0, y, zCock)).toBeGreaterThan(0.095); });
  it('a thigh 2 cm forward of the cabin\'s after face, half a meter below its top: 2 cm, not 50', () => {
    const z = zFace - 0.02, y = ground(0.27, z) - 0.5;
    expect(ground(0.27, z) - y).toBeGreaterThan(0.45); // (straight down, it reads the step's height)
    expect(trueDepth(0.27, y, z)).toBeLessThan(0.03);
  });
  it('clear of the boat: 0', () => { expect(trueDepth(0, ground(0, zCock) + 0.2, zCock)).toBe(0); });
});
