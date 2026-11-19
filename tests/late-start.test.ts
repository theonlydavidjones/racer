import { describe, expect, it } from 'vitest';
import { wrap } from '../src/core/math';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { CourseFile } from '../src/courses/course';

/**
 * A late starter beyond the line's end (the Coordinator, 19 Nov 2026, from the light-air tack work): in
 * crewstation.test.ts's 6 kt west wind on the training course, seed 11, Blue is 160 m below the line at the gun and still
 * short of it 9 minutes on, beyond its end. Getting back in between the ends, she aimed for a point 10-20 m off (ai.ts, the
 * !started aim), whose bearing swung 100° and more as she moved: her plan changed mid-turn and the helm went on round the
 * long way, 200-380°, twice. A boat not yet started should turn as she means to, not circle.
 */
describe('A late starter beyond the line\'s end (seed 11, 6 kt west)', () => {
  it('after the gun, no boat not yet started turns more than 200° one way, outside a penalty', () => {
    const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as never, 11);
    const ai = w.boats.filter(b => !b.isUser), was = ai.map(b => b.h), turn = ai.map(() => 0), long: string[] = [];
    let late = 0;
    while (w.t < 800) {
      w.step(DT);
      ai.forEach((b, k) => {
        const d = wrap(b.h - was[k]); was[k] = b.h;
        if (w.t < 0 || b.penalty > 0 || b.started) { turn[k] = 0; return; }
        late += DT;
        turn[k] = Math.sign(d) === Math.sign(turn[k]) || turn[k] === 0 ? turn[k] + d : d;
        if (Math.abs(turn[k]) > 200) { long.push(`${b.name} at ${w.t.toFixed(0)} s, ${b.v.toFixed(2)} m/s, ${w.lineA(b).toFixed(0)} m along the line`); turn[k] = 0; }
      });
    }
    expect(late, 'a boat still to start after the gun (the case under test)').toBeGreaterThan(300);
    expect(long).toEqual([]);
  }, 300_000);
});
