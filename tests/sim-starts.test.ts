// (split from sim.test.ts so the slow whole-race runs share the cores)
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o });

describe('AI starts (regression guard, 8 races × 5 boats)', () => {
  const starts = (cur: string) => {
    const delays: number[] = []; let ocs = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = new World(SS2, settings({ fleet: 5, current: cur }), seed), ai = w.boats.slice(1), st = new Map<number, number>();
      while (w.t < 90) {
        w.step(DT);
        if (Math.abs(w.t) < DT) ocs += ai.filter(b => b.ocs).length;
        for (const b of ai) if (b.started && !st.has(b.id)) st.set(b.id, w.t);
      }
      for (const b of ai) delays.push(st.get(b.id) ?? 90);
    }
    delays.sort((a, b) => a - b);
    return { median: delays[delays.length >> 1], ocsRate: ocs / delays.length };
  };
  for (const cur of ['slack', 'ebb']) it(`Seaweed Soup line, ${cur}: few OCS, median start within 18 s of the gun`, () => {
    const r = starts(cur);
    expect(r.ocsRate).toBeLessThan(0.1);
    expect(r.median).toBeLessThan(18);
  }, 150_000);
});

