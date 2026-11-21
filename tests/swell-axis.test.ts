import { describe, expect, it } from 'vitest';
import { LL } from '../src/geo/geo';
import { brg } from '../src/core/math';
import { swellReach } from '../src/environment/sea';

/**
 * w047: the strait's axis into the Bay, along which the ocean swell comes through the Gate, is the line from the
 * file's own point outside the Gate to the bridge (sea.ts BRIDGE, OUTSIDE), not a bare number: 79.9°. The bridge
 * to Alcatraz, the way the channel opens out, is 80.9°.
 */
describe('the swell through the Gate travels along the strait\'s axis', () => {
  const BRIDGE = LL(37.81972, -122.47861), OUTSIDE = LL(37.8125, -122.53), axis = brg(BRIDGE.x - OUTSIDE.x, BRIDGE.y - OUTSIDE.y);
  it('at the bridge it travels along the line from outside the Gate to the bridge', () => {
    expect(axis).toBeCloseTo(79.9, 1);
    expect(swellReach(BRIDGE).toward).toBeCloseTo(axis, 6);
  });
  it('crossing the bar, a westerly swell is turned onto the same axis by the time it reaches the bridge', () => {
    const near = LL(37.8197, -122.4787); // (a few meters west of the bridge: all the way turned)
    expect(Math.abs(swellReach(near, true, 270).toward - axis)).toBeLessThan(0.1);
  });
});
