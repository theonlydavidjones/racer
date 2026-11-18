import { describe, expect, it } from 'vitest';
import { CLEATS } from '../src/render/boatParts';
import { L } from '../src/render/hull';

// The after deck's mooring cleat on the centerline (the owner, 18 Nov 2026: "the aft cleat should be at centerline, not
// offset"), where it was fore and aft, midway between the cockpit's after end and the transom. The tiller passes over it
// amidships, its underside 7.8 cm above the cleat's top.
describe("The after deck's cleat (boatParts.ts CLEATS, boatMesh.ts)", () => {
  it('on the centerline, on the after deck', () => {
    const aft = CLEATS.reduce((a, c) => (c.z > a.z ? c : a));
    expect(Math.abs(aft.x)).toBeLessThan(0.001);
    expect(aft.z).toBeGreaterThan(L / 2 - 0.6);
  });
});
