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

describe('the inset is north up just sailing, and a tap on the chart picks the point under it', () => {
  it('wind up in a race, north up just sailing', async () => {
    const { insetRotation } = await import('../src/ui/hud');
    expect(insetRotation({ freeSail: true, C: { base: 270 } })).toBe(0);
    expect(insetRotation({ freeSail: false, C: { base: 270 } })).toBe(270);
  });
  it("a tap converts back to the world point the chart drew there (the chart's north up)", async () => {
    const { chartPoint } = await import('../src/ui/chart');
    const tf = makeTf(-3000, 800, 0, 0.07, 900, 600);
    for (const p of [{ x: -9000, y: 800 }, { x: -3000, y: 4000 }, { x: 1500, y: -2000 }]) {
      const [sx, sy] = tf(p.x, p.y), q = chartPoint(sx, sy, 900, 600, -3000, 800, 0.07);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(1e-6);
    }
    // (a spot due west on the water is to the left of the boat on the chart)
    const [wx] = tf(-9000, 800); expect(wx).toBeLessThan(450);
  });
});

describe("the map's visibility is the boat's own (owner)", () => {
  it('thick fog and heavy rain set at the Gate: a few hundred metres, not Pier 17\'s miles', async () => {
    const { Hud } = await import('../src/ui/hud');
    const { setVisibility } = await import('../src/environment/weather');
    const { World } = await import('../src/sim/world');
    const { COURSES } = await import('../src/courses/registry');
    const { DEFAULT_SETTINGS } = await import('../src/settings');
    expect(setVisibility({ fog: 2, rain: 2 }).m).toBeLessThan(500);
    expect(setVisibility({ fog: 'real', rain: 2 }).m).toBeLessThan(3500);
    expect(setVisibility({ fog: 'real', rain: 0 }).m).toBe(Infinity);
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'gate', sailTo: '', windKt: 30, rain: 2, fog: 2, tideDate: '2026-11-14', mapLayers: { fog: true } } as never, 1, { freeSail: true });
    const note = Hud.prototype.fogNote.call({}, w, true)!;
    expect(note).toMatch(/^VIS 0\.[1-3] NM HERE/); expect(note).not.toMatch(/PIER 17/);
  });
});
