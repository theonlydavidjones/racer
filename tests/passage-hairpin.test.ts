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
  // (held apart, the Coordinator's ruling: with the land's lee without seams (shadows.ts) the pocket 100 m off Yellow
  // Bluff, 500 m along, is lighter, and with the ebb setting her on both gybes close the shore inside their minute and a
  // half: a dead end on a run, which the rule-based planner can't get out of (its stand-off is a beat's). The isochrone
  // router is the owner's decision; it removes the it.fails)
  it.fails('known failure: in the land\'s lee off Yellow Bluff (about half the wind, 100 m off) with the ebb setting her on, the run gybes in a dead end, 63 turns, 158 m back (ROADMAP: the isochrone router) (main: 54 turns, 199 m back toward the start)', () => {
    const { r, back, turns } = plan('2026-11-25', '15:00', -20, 10);
    expect(r.ok).toBe(true);
    expect(back, 'given back toward the start (m)').toBeLessThan(100);
    expect(turns).toBeLessThan(15);
  }, 120_000);
});
