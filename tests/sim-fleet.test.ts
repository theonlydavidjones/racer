// (split from sim.test.ts so the slow whole-race runs share the cores)
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

const SS2 = ss2 as unknown as CourseFile, TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o });

describe('AI fleet sails the course', () => {
  const race = (file: CourseFile, s: Partial<Settings>, seed: number, minutes: number) => {
    const w = new World(file, settings(s), seed);
    const end = minutes * 60;
    while (w.t < end && !w.boats.slice(1).every(b => b.finished)) w.step(DT);
    return w;
  };

  it('training course: every AI boat starts, rounds and finishes', () => {
    const w = race(TRAIN, { fleet: 5, current: 'ebb' }, 7, 20);
    for (const b of w.boats.slice(1)) expect(b.finished, `${b.name} leg ${b.leg}`).toBe(true);
  }, 60_000);

  it('Seaweed Soup course 2 in an ebb: every AI boat finishes', () => {
    const w = race(SS2, { fleet: 3, current: 'ebb' }, 11, 90); // (the real jetty pushes the last beat out from the Marina shore)
    for (const b of w.boats.slice(1)) expect(b.finished, `${b.name} leg ${b.leg}`).toBe(true);
  }, 180_000);
});

