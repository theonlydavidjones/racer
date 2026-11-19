import { describe, expect, it } from 'vitest';
import { wrap } from '../src/core/math';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { CourseFile } from '../src/courses/course';

// AI steering in a dying breeze: the whole races (out of test:fast); the tack itself is tests/light-tack.test.ts
/** (the races the bug was found in: tests/crewstation.test.ts's 6 kt west wind on the training course, seeds 4 and 11,
 * where it dies to 1-5 kt. On main seed 4 has an AI boat gybing right round where her plan asked for a tack, in 2.1 kt
 * at 0.45 m/s; seed 11 is a guard (its long turns on main were a boat not yet started). Penalty turns, which are meant to go round, aren't counted; nor a boat
 * not yet started: in seed 11 one starts late, 160 m below the line at the gun, and still short of it 9 minutes on,
 * beyond its end, aiming for a point 10-20 m off whose bearing swings 100° and more as she moves (ai.ts, the !started aim):
 * a separate bug, reported to the Coordinator 19 Nov 2026) */
describe('A dying breeze: the AI tacks rather than gybing round (seeds 4 and 11, 6 kt west)', () => {
  for (const seed of [4, 11]) it(`seed ${seed}: no turn of more than 200° one way, outside a penalty`, () => {
    const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as never, seed);
    const ai = w.boats.filter(b => !b.isUser), was = ai.map(b => b.h), turn = ai.map(() => 0), long: string[] = [];
    while (w.t < 800) {
      w.step(DT);
      ai.forEach((b, k) => {
        const d = wrap(b.h - was[k]); was[k] = b.h;
        if (w.t < 300 || b.penalty > 0 || !b.started) { turn[k] = 0; return; }
        turn[k] = Math.sign(d) === Math.sign(turn[k]) || turn[k] === 0 ? turn[k] + d : d;
        if (Math.abs(turn[k]) > 200) { long.push(`${b.name} at ${w.t.toFixed(0)} s, ${b.v.toFixed(2)} m/s in ${b.ww.kt.toFixed(1)} kt`); turn[k] = 0; }
      });
    }
    expect(long).toEqual([]);
  }, 300_000);
});
