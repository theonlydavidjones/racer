import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { passageNow } from '../src/sim/navigator';
import { sub, unit } from '../src/core/math';
import { LL } from '../src/geo/geo';

/**
 * The owner's passage plan, Horseshoe Bay across to a point past Yellow Bluff (ROADMAP 8b, 15 Nov 2026: "why does it
 * need that awkward first big jibe?"; screenshot reference/screens/planner-jibe.jpg): a run in a southwesterly, the
 * ebb across her course. On main the plan jibed off Yellow Bluff onto a board that made no ground and doubled back,
 * hairpin after hairpin: 54 turns, 199 m given back toward the start, 227 min. Here: each gybe's angle chosen with the
 * current in it, and no turn back onto a board making less than half what hers does.
 */
const A = LL(37.8312, -122.4757), B = LL(37.848, -122.450); // (the start just inside Horseshoe Bay's entrance; the point she picked, NE of Yellow Bluff)
function plan(date: string, time: string, turn: number, kt: number) {
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windTurn: turn, windKt: kt, tideDate: date, tideTime: time } as Settings;
  const w = new World(COURSES[0], S, 7, { freeSail: true }); w.user.x = A.x; w.user.y = A.y; (w as unknown as { dest: { p: typeof B } }).dest = { p: B };
  const r = passageNow(w as never)!, u = unit(sub(B, A));
  let far = -Infinity, back = 0; for (const q of r.track) { const s = (q.p.x - A.x) * u.x + (q.p.y - A.y) * u.y; far = Math.max(far, s); back = Math.max(back, far - s); }
  return { r, back, turns: r.tacks.length + r.gybes.length };
}

describe('the passage plan off Yellow Bluff, with the ebb across her course', () => {
  // (the isochrone router, sim/router.ts, the owner's decision: she cheats the ebb up the Marin shore, where it runs at
  // 0.1–0.4 kt against 2–3 kt foul across the open water, and crosses to the mark: about an hour, a handful of jibes)
  it('gets there without doubling back, cheating the ebb inshore: no hairpins, about an hour (main: 54 turns, 199 m back, 227 min)', () => {
    const { r, back, turns } = plan('2026-11-25', '15:00', -20, 10);
    expect(r.ok).toBe(true);
    expect(back, 'given back toward the start (m)').toBeLessThan(100);
    expect(turns).toBeLessThan(15);
    expect(r.minutes).toBeLessThan(90);
  }, 120_000);
});
