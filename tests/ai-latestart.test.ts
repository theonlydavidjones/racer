// A late start from beyond an end of the line (sprint bug, found by sim-ai's tack test, 19 Nov 2026): a boat that hadn't
// started after the gun (her penalty turns taken over the gun) lay 90–105 m along the line, beyond its 77 m half-length.
// She aimed for a point 10 m over the line inside its ends, but the straight course to it crossed the line's extension
// just outside the end, which isn't a start (Definitions, Start: she crosses the starting line), so she turned back
// below and tried again, round and round for 25 minutes. A start needs her to cross between the ends.
import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, n360, wrap } from '../src/core/math';

describe('a late start from beyond an end of the line', () => {
  // (and in a real current, the 14 Nov 2026 tide, setting her along the line: there a point only just below it let the
  // stream carry her over the extension and round onto the committee boat, physics review, 19 Nov 2026)
  for (const [current, side, along, below] of [['slack', -1, 17, 10], ['slack', -1, 28, 6], ['slack', 1, 17, 10], ['slack', 1, 28, 6],
    ['real', -1, 40, 8], ['real', 1, 40, 8], ['real', -1, 17, 1], ['real', 1, 17, 1]] as const) {
    it(`${current === 'real' ? 'in the tide, ' : ''}${along} m beyond the ${side < 0 ? 'one' : 'other'} end, ${below} m below the line: she starts, between the ends, touching no mark`, () => {
      const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'] } as never, 77);
      while (w.t < 20) w.step(DT);
      const ai = w.boats.filter(b => !b.isUser), B = ai[0];
      for (const o of w.boats) if (o !== B) { o.x += 5000; o.y += 5000; } // (the line to herself)
      // where she lay in the race: beyond the end, a few meters below the line, sailing along it toward the end
      const a = side * (w.lineLen / 2 + along), p = { x: w.center.x + w.L.x * a - w.N.x * below, y: w.center.y + w.L.y * a - w.N.y * below };
      const h = n360(Math.atan2(-side * w.L.x, -side * w.L.y) * 180 / Math.PI), u = V(h), rel = wrap(w.wind.from - h);
      Object.assign(B, { x: p.x, y: p.y, h, desired: h, v: 2, vx: u.x * 2, vy: u.y * 2, tack: rel >= 0 ? 'S' : 'P', twa: Math.abs(rel), started: false, ocs: false, penalty: 0 });
      const t0 = w.t;
      let touched: string | null = null;
      while (w.t < t0 + 180 && !B.started) { w.step(DT); touched ??= B.markTouch; }
      expect(touched, 'touched a mark').toBeNull();
      expect(B.started, `started within 3 min (at ${(w.t - t0).toFixed(0)} s)`).toBe(true);
      expect(Math.abs(w.lineA(B))).toBeLessThan(w.lineLen / 2 + 2);
    }, 120_000);
  }
});
