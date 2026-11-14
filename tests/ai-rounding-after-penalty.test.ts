// After penalty turns beside the mark she's rounding, she still rounds it (red-loop, November 2026: Seaweed Soup
// course 2 in an ebb, seed 11, Red took her 720 beside Fort Mason, the last mark, to be left to starboard; her turns
// latched "keep it to port", the side it was on, and she sailed round and round it the wrong way, never rounding it,
// until the race's time ran out).
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, n360, wrap } from '../src/core/math';

describe('rounding a mark after penalty turns beside it', () => {
  it("passes the mark on its rounding side, not the side her turns had left it on", () => {
    const s: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', current: 'ebb', fleet: 1, traffic: 0 };
    const w = new World(ss2 as unknown as CourseFile, s, 11);
    const k = w.C.marks.length - 1, m = w.C.marks[k], [, B] = w.boats;
    expect(m.type).toBe('round'); expect(m.side).toBe('s');
    for (const b of w.boats) { b.x += 1e5; b.y += 1e5; }
    w.t = 2600;
    // just past it on the wrong side, 15 m off: where Red's penalty turns ended, the mark to her port
    const rel = Math.atan2(m.r.y, m.r.x) / (Math.PI / 180), u = { x: Math.cos((rel - 100) * Math.PI / 180), y: Math.sin((rel - 100) * Math.PI / 180) };
    const h = n360(w.wind.from + 180 - 60);
    Object.assign(B, { x: m.p.x + u.x * 15, y: m.p.y + u.y * 15, h, desired: h, v: 2.3, started: true, leg: k, penalty: 0, tack: wrap(w.wind.from - h) >= 0 ? 'S' : 'P' });
    const uh = V(h); B.vx = uh.x * 2.3; B.vy = uh.y * 2.3; B.prevAng = null;
    B.ai!.passing = { key: `${m.p.x.toFixed(0)},${m.p.y.toFixed(0)}`, side: -1 }; // (her turns' latch: the mark to port)
    while (w.t < 2600 + 6 * 60 && B.leg === k) w.step(DT);
    expect(B.leg, 'rounded the last mark within six minutes').toBe(k + 1);
  }, 60_000);
});
