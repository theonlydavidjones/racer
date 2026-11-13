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
import { TerrainGrid, landLee, windTerrain } from '../src/environment/wind';

/** The largest jump in the wind's factor and turn (and the drawn wind's factor) across the grid's edge, 10 cm apart,
 *  all the way round it. (The shore's own slowing changes the factor by up to about 5e-5 in 10 cm.) */
function seam(w: World) {
  const g = (w as unknown as { field: { x0: number; y0: number; step: number; n: number } }).field, L = (g.n - 1) * g.step;
  let dk = 0, dt = 0, de = 0;
  for (let s = 0; s <= L; s += 23) for (const [a, b] of [
    [{ x: g.x0 + 0.05, y: g.y0 + s }, { x: g.x0 - 0.05, y: g.y0 + s }], [{ x: g.x0 + L - 0.05, y: g.y0 + s }, { x: g.x0 + L + 0.05, y: g.y0 + s }],
    [{ x: g.x0 + s, y: g.y0 + 0.05 }, { x: g.x0 + s, y: g.y0 - 0.05 }], [{ x: g.x0 + s, y: g.y0 + L - 0.05 }, { x: g.x0 + s, y: g.y0 + L + 0.05 }]
  ]) {
    const fa = w.fieldAt(a), fb = w.fieldAt(b);
    dk = Math.max(dk, Math.abs(fa.k - fb.k)); dt = Math.max(dt, Math.abs(wrap(fa.turn - fb.turn))); de = Math.max(de, Math.abs(w.fieldExtra(a) - w.fieldExtra(b)));
  }
  return { dk, dt, de };
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
    expect(s.dk, `factor ${s.dk}`).toBeLessThan(3e-4); expect(s.dt, `turn ${s.dt}`).toBeLessThan(0.02); expect(s.de, `drawn ${s.de}`).toBeLessThan(3e-4);
    // just before the grid's next rebuild (every 30 s), its samples are 29.9 s old; the weather outside it is now
    for (let i = 0; i < 29.9 / DT; i++) w.step(DT);
    s = seam(w);
    expect(s.dk, `factor ${s.dk}, 29.9 s on`).toBeLessThan(3e-4); expect(s.dt, `turn ${s.dt}, 29.9 s on`).toBeLessThan(0.02); expect(s.de, `drawn ${s.de}, 29.9 s on`).toBeLessThan(3e-4);
  });
});

describe('no seam in the wind drawn on the water at the edge of its terrain grid (environment/wind.ts TerrainGrid)', () => {
  it('across the edge, as smooth as the terrain itself; beyond it, the terrain and the lee of the land as inside', () => {
    // (for Seaweed Soup course 2 the grid's west edge, 5 km from the course's centre, runs past Lands End: it fell to
    // 1 there, from as little as 0.28 inside)
    const C = new World(ss2 as unknown as CourseFile, S({ windKind: 'west', windKt: 14 }), 3).C.center;
    const half = 5000, cell = 50, from = 255, tg = new TerrainGrid(C.x, C.y, half, cell, from);
    let jump = 0;
    for (let s = -half; s <= half; s += 17) for (const [a, b] of [
      [[C.x - half + 0.05, C.y + s], [C.x - half - 0.05, C.y + s]], [[C.x + half - 0.05, C.y + s], [C.x + half + 0.05, C.y + s]],
      [[C.x + s, C.y - half + 0.05], [C.x + s, C.y - half - 0.05]], [[C.x + s, C.y + half - 0.05], [C.x + s, C.y + half + 0.05]]
    ]) jump = Math.max(jump, Math.abs(tg.at(a[0], a[1]) - tg.at(b[0], b[1])));
    expect(jump, `across the edge ${jump}`).toBeLessThan(3e-3);
    // well outside, off the 200 m nodes: the exact terrain and lee, to within the lee's own interpolation inside
    let off = 0, n = 0;
    for (let k = 0; k < 400; k++) {
      const x = C.x - half - 300 - (k % 20) * 137, y = C.y - half + Math.floor(k / 20) * 211;
      off += Math.abs(tg.at(x, y) - windTerrain({ x, y }, from) * landLee({ x, y }, from)); n++;
    }
    expect(off / n, `beyond it, mean |off| ${off / n}`).toBeLessThan(0.03);
  });
});
