// Every World is its own: the same seed sails the same race whatever ran before it in the process. The caches shared
// between Worlds (module-level memos of costly sums) must hold only what their keys say, not what the first caller's
// exact inputs gave (boat/seaway.ts beatInChop did: the same seed sailed differently after other tests).
import { describe, expect, it, vi } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';

const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o }) as Settings;

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
  it('the same seed, sailed after another race on the same course and wind, sails as it does in a fresh process', async () => {
    // (each in its own copy of the modules, so the shared caches start empty: the first alone, the second after a race
    // with another seed in the same conditions, which fills the same cache slots from other exact inputs. Without the
    // fix it parted at 140 s; 600 s takes it past the start, t from −180)
    const fresh = async () => { vi.resetModules(); return await import('../src/sim/world'); };
    const run = (m: typeof import('../src/sim/world'), seed: number) => {
      const w = new m.World(ss2 as unknown as CourseFile, S({ fleet: 4, current: 'ebb', sea: 'real' }), seed), out: string[] = [];
      while (w.t < 600) { w.step(m.DT); if (w.steps % 600 === 0) out.push(w.boats.map(b => `${b.x},${b.y},${b.h},${b.v}`).join(';')); }
      return out;
    };
    const first = run(await fresh(), 11), m = await fresh();
    run(m, 12);
    const again = run(m, 11), k = first.findIndex((x, i) => x !== again[i]);
    expect(k, `first differs at ${(k + 1) * 10 - 180} s`).toBe(-1);
  }, 900_000);
});
