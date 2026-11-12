import { describe, expect, it } from 'vitest';
import { makeTf } from '../src/ui/draw2d';
import { northOnMap } from '../src/ui/hud';

describe("the inset map's north arrow (it's turned wind-up)", () => {
  it('points where true north is drawn, whatever the wind', () => {
    for (const W of [0, 45, 90, 200, 270, 315]) {
      const tf = makeTf(0, 0, W, 1, 200, 200), [x, y] = tf(0, 1000); // (a point 1 km due north of the centre)
      const drawn = Math.atan2(x - 100, -(y - 100)), a = northOnMap(W);
      expect(Math.abs(Math.atan2(Math.sin(drawn - a), Math.cos(drawn - a)))).toBeLessThan(1e-9);
    }
  });
  it('in a westerly (the map turned with west at the top), north is to the right', () => {
    expect(Math.sin(northOnMap(270))).toBeCloseTo(1, 9);
  });
});
