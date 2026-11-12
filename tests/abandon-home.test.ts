// After racing is called off for the day (N over A, AP over A: "no more racing today"), the AI boats sail home to the
// racing harbour nearest the course, round the land, and lie off its entrance (ai.ts goHome).
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { dist } from '../src/core/math';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';

describe('the AI boats after racing is called off', () => {
  for (const far of [false, true]) it(far ? 'from north of Alcatraz, beating home round the island' : 'sail home round the land, never onto it, and lie off the harbour', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 16, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'] } as never, 7);
    const ai = w.boats.filter(b => !b.isUser);
    while (w.t < 120) w.step(DT); // two minutes into the race
    w.cancelled = { t: w.t, kt: 24, up: ['N', 'A'], say: '' };
    // (put north of Alcatraz, a couple of lengths apart, in the westerly: the island between them and home)
    if (far) ai.forEach((b, k) => { const p = LL(37.8345, -122.4235); b.x = p.x + k * 40; b.y = p.y + k * 25; b.h = 200; b.v = 2; });
    w.step(DT);
    const home = ai[0].ai!.home!.at, d0 = ai.map(b => dist(b, home));
    let ashore = 0;
    while (w.t < 120 + 90 * 60 && !ai.every(b => b.luff)) {
      w.step(DT);
      if (w.steps % 30 === 0) for (const b of ai) if (onLand(b)) ashore++;
    }
    const d1 = ai.map(b => dist(b, home));
    expect(ai.every(b => b.ai!.home!.at === home)).toBe(true);
    expect(ashore, 'on the land').toBe(0);
    expect(d1.every(d => d < 160), `still off: ${d1.map(d => d.toFixed(0)).join(' ')} m, from ${d0.map(d => d.toFixed(0)).join(' ')} m`).toBe(true);
    for (const b of ai) expect(b.luff, 'lying to off the entrance').toBe(true);
  }, 600000);
});
