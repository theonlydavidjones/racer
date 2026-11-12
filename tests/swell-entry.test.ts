import { describe, expect, it } from 'vitest';
import { swellReach, swellShare } from '../src/environment/sea';
import { LL } from '../src/geo/geo';

const OUT = LL(37.81, -122.56), BRIDGE_IN = LL(37.812, -122.465); // (outside the bar; just inside the bridge, off Fort Point)

describe('the ocean swell into the Gate', () => {
  it('outside the bar a swell travels its own way, whatever it is (a SW swell runs NE, a NW one SE)', () => {
    expect(swellReach(OUT, true, 228).toward).toBeCloseTo(48, 6);
    expect(swellReach(OUT, true, 300).toward).toBeCloseTo(120, 6);
  });
  it('inside, a south-west swell is turned into the strait and gets in as a westerly does (Hanes & Erikson 2013); a north-west one, less', () => {
    const sw = swellReach(BRIDGE_IN, true, 228).k, w = swellReach(BRIDGE_IN, true, 255).k, nw = swellReach(BRIDGE_IN, true, 305).k;
    expect(sw).toBeCloseTo(w, 6);
    expect(nw).toBeLessThan(0.9 * w);
    expect(swellReach(BRIDGE_IN, true, 228).toward).toBeCloseTo(swellReach(BRIDGE_IN, true, 300).toward, 6); // (in the channel, the channel's way)
  });
  it("the buoy's total height counts the ocean's own wind sea: the swell is most of a big sea and less of a small one", () => {
    expect(swellShare(1)).toBeCloseTo(0.74, 1); expect(swellShare(3)).toBeCloseTo(0.87, 1);
    expect(swellShare(3)).toBeGreaterThan(swellShare(1));
  });
});
