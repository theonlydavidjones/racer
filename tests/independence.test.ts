// Every World is its own: the same seed sails the same race whatever ran before it in the process. The caches shared
// between Worlds (module-level memos of costly sums) must hold only what their keys say, not what the first caller's
// exact inputs gave (boat/seaway.ts beatInChop did: the same seed sailed differently after other tests).
import { describe, expect, it, vi } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o }) as Settings;
/** Each boat's place and speed every 10 s, to the last digit. */
function track(file: unknown, s: Partial<Settings>, seed: number, sec: number): string[] {
  const w = new World(file as CourseFile, S(s), seed), out: string[] = [];
  while (w.t < sec) { w.step(DT); if (w.steps % 600 === 0) out.push(w.boats.map(b => `${b.x},${b.y},${b.h},${b.v}`).join(';')); }
  return out;
}

describe('every World is independent of the ones before it', () => {
  it('the angle to beat at in chop is the same whichever wind asked first (beatInChop)', async () => {
    // (11.88 kt, 0.59 m, 2.96 s and 12 kt, 0.6 m, 3 s share a cache slot, and searched exactly give 41° and 40.5°:
    // each must get the slot's own answer, whichever asks first)
    vi.resetModules(); let m = await import('../src/boat/seaway');
    const a1 = m.beatInChop(12, 0.6, 3), a2 = m.beatInChop(11.88, 0.59, 2.96);
    vi.resetModules(); m = await import('../src/boat/seaway');
    const b2 = m.beatInChop(11.88, 0.59, 2.96), b1 = m.beatInChop(12, 0.6, 3);
    expect([a1, a2]).toEqual([b1, b2]);
  });
  it('the same seed, run again after other races in other winds, sails the same race to the last digit', () => {
    const first = track(ss2, { fleet: 4, current: 'ebb', sea: 'real' }, 11, 300);
    track(train, { fleet: 5, current: 'ebb', windKt: 17, sea: 'real' }, 7, 300); // (other winds and seas fill the shared caches)
    track(ss2, { fleet: 3, current: 'flood', windKt: 9, sea: 'real' }, 5, 300);
    const again = track(ss2, { fleet: 4, current: 'ebb', sea: 'real' }, 11, 300);
    const k = first.findIndex((x, i) => x !== again[i]);
    expect(k, `first differs at ${(k + 1) * 10} s`).toBe(-1);
  }, 600_000);
});
