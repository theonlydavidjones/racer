import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

/**
 * The wind she'll meet going out astern (World.windAstern), which the shove is gauged by: read along her line astern and
 * to leeward of it, where the wind sets her meanwhile. Here the wind is given a slope each way, so each reading shows
 * where it was taken: more wind the farther astern, less the farther to the west.
 */
describe('the wind along her way out astern', () => {
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 10, windDir: 270, mode: 'sail', tideDate: '2026-11-14', current: 'slack' } as Settings;
  const set = (from: number) => {
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let k = 0; k < 5; k++) w.step(DT);
    const x0 = u.x, y0 = u.y; // (her bow north: astern is south; the wind 20 kt where she lies)
    (w as unknown as { windHere: (p: { x: number; y: number }) => { from: number; kt: number } }).windHere = p => ({ from, kt: 20 + 0.1 * (y0 - p.y) + 0.5 * (p.x - x0) });
    return w.windAstern(u, 0);
  };
  it('along her line: the wind 10 m astern of her as she\'s let go, and the last reading beyond the farthest', () => {
    const at = set(0); // (the wind on her bow: nothing sets her across her line)
    expect(at(0, 0).kt).toBeCloseTo(20, 5); expect(at(10, 0).kt).toBeCloseTo(21, 5); expect(at(10, 60).kt).toBeCloseTo(21, 5);
    expect(at(500, 0).kt).toBeCloseTo(24, 5);
  });
  it('a wind on her starboard beam sets her to port, to leeward: read there, more so with time', () => {
    const at = set(90); // (from the east, her bow north: to leeward is west, where this wind is lighter)
    expect(at(0, 10).kt).toBeLessThan(19); expect(at(0, 20).kt).toBeLessThan(at(0, 10).kt - 1);
    expect(at(0, 20).kt).toBeCloseTo(20 - 0.5 * 0.019 * 20 * 20, 1); // (0.019 m/s a knot of the 20 kt on her beam, 20 s: 7.6 m)
  });
  it('and one on her port beam sets her to starboard', () => {
    const at = set(270);
    expect(at(0, 20).kt).toBeCloseTo(20 + 0.5 * 0.019 * 20 * 20, 1);
  });
});
