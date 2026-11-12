// The wind across the course is cached on a grid (World.buildField) and taken from the day's weather itself outside it:
// across the grid's outermost cell the one is eased into the other, so a boat (or the map's wind colours) crossing the
// edge meets no seam in the wind, however coarse the grid or however old its samples (rebuilt every 30 s).
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { wrap } from '../src/core/math';

/** The largest jump in the wind's factor and turn across the grid's edge, a metre apart, all the way round it. */
function seam(w: World) {
  const g = (w as unknown as { field: { x0: number; y0: number; step: number; n: number } }).field, L = (g.n - 1) * g.step;
  let dk = 0, dt = 0;
  for (let s = 0; s <= L; s += 23) for (const [a, b] of [
    [{ x: g.x0 + 0.5, y: g.y0 + s }, { x: g.x0 - 0.5, y: g.y0 + s }], [{ x: g.x0 + L - 0.5, y: g.y0 + s }, { x: g.x0 + L + 0.5, y: g.y0 + s }],
    [{ x: g.x0 + s, y: g.y0 + 0.5 }, { x: g.x0 + s, y: g.y0 - 0.5 }], [{ x: g.x0 + s, y: g.y0 + L - 0.5 }, { x: g.x0 + s, y: g.y0 + L + 0.5 }]
  ]) { const fa = w.fieldAt(a), fb = w.fieldAt(b); dk = Math.max(dk, Math.abs(fa.k - fb.k)); dt = Math.max(dt, Math.abs(wrap(fa.turn - fb.turn))); }
  return { dk, dt };
}
const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...o }) as Settings;

describe('no seam in the wind at the edge of its grid', () => {
  for (const [name, mk] of [
    ['a forecast day, racing', () => new World(ss2 as unknown as CourseFile, S({ windKind: 'auto', tideDate: '2026-11-14' }), 3)],
    ['an observed day, racing', () => new World(ss2 as unknown as CourseFile, S({ windKind: 'auto', tideDate: '2026-11-09' }), 3)],
    ['a forecast day, sailing to Alcatraz (a bigger, coarser grid)', () => new World(COURSES[0], S({ windKind: 'auto', tideDate: '2026-11-14', mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', sea: 'flat' }), 4, { freeSail: true })]
  ] as const) it(name, () => {
    const w = mk();
    let s = seam(w);
    expect(s.dk, `factor ${s.dk}`).toBeLessThan(0.002); expect(s.dt, `turn ${s.dt}`).toBeLessThan(0.1);
    // 25 s on, the grid's samples are 25 s old; the weather outside it is now
    for (let i = 0; i < 25 / DT; i++) w.step(DT);
    s = seam(w);
    expect(s.dk, `factor ${s.dk}, 25 s on`).toBeLessThan(0.002); expect(s.dt, `turn ${s.dt}, 25 s on`).toBeLessThan(0.1);
  });
});
