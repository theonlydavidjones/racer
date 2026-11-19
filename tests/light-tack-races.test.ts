import { describe, expect, it } from 'vitest';
import { wrap } from '../src/core/math';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { CourseFile } from '../src/courses/course';

// AI steering in a dying breeze: the whole races (out of test:fast); the tack itself is tests/light-tack.test.ts
/** (the races the bug was found in: tests/crewstation.test.ts's 6 kt west wind on the training course, seeds 4 and 11,
 * where it dies to 1-5 kt. On main each had AI boats gybing right round, 250-380° one way, where their plan asked for a
 * tack, three times between them from 300 s on. Penalty turns, which are meant to go round, aren't counted) */
describe('A dying breeze: the AI tacks rather than gybing round (seeds 4 and 11, 6 kt west)', () => {
  for (const seed of [4, 11]) it(`seed ${seed}: no turn of more than 200° one way, outside a penalty`, () => {
    const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as never, seed);
    const ai = w.boats.filter(b => !b.isUser), was = ai.map(b => b.h), turn = ai.map(() => 0), long: string[] = [];
    while (w.t < 800) {
      w.step(DT);
      ai.forEach((b, k) => {
        const d = wrap(b.h - was[k]); was[k] = b.h;
        if (w.t < 300 || b.penalty > 0) { turn[k] = 0; return; }
        turn[k] = Math.sign(d) === Math.sign(turn[k]) || turn[k] === 0 ? turn[k] + d : d;
        if (Math.abs(turn[k]) > 200) { long.push(`${b.name} at ${w.t.toFixed(0)} s, ${b.v.toFixed(2)} m/s in ${b.ww.kt.toFixed(1)} kt`); turn[k] = 0; }
      });
    }
    expect(long).toEqual([]);
  }, 300_000);
});
