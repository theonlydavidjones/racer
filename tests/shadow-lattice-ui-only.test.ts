// The inset's wind shadows read the land's lee from a lattice of their own (ui/shadowLayer.ts), passed to
// World.shadowAt as `landK`. The wind the boats sail in stays exact: without the argument shadowAt is what it always
// was, the land's lee worked out at the point itself, to the last bit, and only the page's map ever passes one.
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { landLee } from '../src/environment/wind';

describe("the map's lattice of the land's lee is the map's alone", () => {
  it("shadowAt without it: the land's lee at the point itself, bit for bit", () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 1, fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'], windKind: 'west', windKt: 18 } as Settings, 4);
    for (let k = 0; k < 600; k++) w.step(DT);
    let n = 0;
    for (let x = -3000; x <= 3000; x += 137) for (let y = -2000; y <= 2500; y += 151) {
      const p = { x: w.C.center.x + x, y: w.C.center.y + y }, a = w.shadowAt(p), b = w.shadowAt(p, undefined, landLee(p, w.wind.from));
      expect(Object.is(a.k, b.k) && Object.is(a.shift, b.shift), `${p.x}, ${p.y}`).toBe(true); n++;
    }
    expect(n).toBeGreaterThan(1000);
    // (and a boat's own: her lee from her step, as before)
    for (const b of w.boats) { const s = w.shadowAt(b, b), t = w.shadowAt(b, b, b.leeK); expect(Object.is(s.k, t.k)).toBe(true); }
  }, 120_000);

  it('only the page (src/ui) passes the land lee to shadowAt', () => {
    const SRC = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    // (a call with a third argument: shadowAt(p, self, landK))
    const callers = Object.keys(SRC).filter(f => /\.shadowAt\([^()]*(\([^()]*\)[^()]*)*,[^,()]*,/.test(SRC[f]));
    expect(callers.every(f => f.startsWith('../src/ui/')), callers.join(', ')).toBe(true);
    expect(callers.length).toBeGreaterThan(0);
  });
});
