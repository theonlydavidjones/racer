import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { World } from '../src/sim/world';
import { LANDMARKS, transitBeyond, transitOffset } from '../src/sim/transits';
import { LL } from '../src/geo/geo';

describe('Transits', () => {
  it('finds a landmark in line beyond a point', () => {
    const coit = LANDMARKS.find(l => l.name === 'Coit Tower')!.p, eye = LL(37.82, -122.42);
    const through = { x: eye.x + (coit.x - eye.x) * 0.3, y: eye.y + (coit.y - eye.y) * 0.3 };
    expect(transitBeyond(eye, through)?.mark.name).toBe('Coit Tower');
  });
  it('in line means zero offset; off the line, the near object moves off the far one', () => {
    const a = { x: 0, y: 0 }, near = { x: 0, y: 100 }, far = { x: 0, y: 3000 };
    expect(Math.abs(transitOffset(a, near, far))).toBeLessThan(1e-9);
    expect(Math.abs(transitOffset({ x: 20, y: 0 }, near, far))).toBeGreaterThan(5);
  });
  it('every course has a line transit, a landmark or a point on the far shore', () => {
    for (const c of [ss2, train]) {
      const w = new World(c as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 0 }, 1);
      const T = w.lineTransit;
      expect(T).not.toBeNull();
      expect(T!.name.length).toBeGreaterThan(3);
    }
  });
});
