// The AI's way round a jetty, when the turn she was laying is no longer in sight (ai.ts, the beat's detour).
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { landAlong, onLand } from '../src/geo/shore';

describe('a boat inside the Marina\'s jetty, holding a turn outside it', () => {
  /*
   * Seaweed Soup course 2's last beat (tests/sim-fleet.test.ts, seed 16, November 17, 2026): a boat that had come in
   * under the jetty off the GGYC (its tip near x 290, y −190) still held the turn she'd been laying from outside it,
   * the far side of the stones from her. She steered for it, struck the jetty every few seconds and sat there from
   * minute 62 to minute 102; with a slightly different race two boats did, and neither finished in 110 minutes.
   * Here: the same place, the same held turn, the last leg. She plans again, goes out round the tip and finishes.
   */
  it('plans again, and sails out round its end without striking it', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, judging: 'umpired', windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 1, current: 'ebb' } as never, 16);
    while (w.t < 5) w.step(DT); // (the gun; her start's own logic done with)
    const b = w.boats[1], u = w.boats[0];
    u.x = -2000; u.y = 2000; // (your boat, unsailed, well out of it)
    b.x = 272; b.y = -265; b.h = 30; b.v = 1; b.started = true; b.ocs = false; b.leg = w.C.marks.length; b.penalty = 0;
    b.ai!.mode = 'race'; b.ai!.detour = { x: 190, y: -152 };
    expect(onLand(b), 'she starts afloat').toBe(false);
    expect(landAlong(b, b.ai!.detour!), 'the held turn is the far side of the jetty from her').toBeLessThan(Infinity);
    const t0 = w.t; let hits = 0, last: number | undefined = b.lastHitT;
    while (w.t < t0 + 15 * 60 && !b.finished) { w.step(DT); if (b.lastHitT !== last) { last = b.lastHitT; hits++; } }
    expect(hits, 'times she struck anything (the only other boat is yours, two kilometers off)').toBe(0);
    expect(b.finished, `finished within 15 minutes (she is at ${b.x.toFixed(0)}, ${b.y.toFixed(0)})`).toBe(true);
  }, 120_000);
});
