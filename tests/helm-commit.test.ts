// The AI's helm commits to the way round a big turn (physics.ts turnCommit) and holds to it: too slow to tack, she goes
// round by the gybe and doesn't bail out halfway (Deep Physics' trace, November 2026); and a turn done, past where she
// set out for, is over: a new course a little behind her she comes back to the short way (abandon-home, 26 kt).
import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { legacyKnobs } from '../src/ai/skipper';
import { KT, wrap } from '../src/core/math';
import type { Boat } from '../src/boat/boat';

function aiBoat(heading: number, v: number): Boat {
  const b = testBoat({ heading, kt: v / KT, windFrom: 0, windKt: 12 });
  b.isUser = false; b.tack = 'P';
  b.ai = { mode: 'race', wp: 1, f: 0.5, depth: 70, aggr: 2, width: 160, aware: true, kn: legacyKnobs(true), clearing: false, plan: { leave: NaN, tReach: Infinity, coast: 0, back: false }, turnCommit: 0, commitFor: 0, commitLong: false, duckUntil: -Infinity, lastHail: -Infinity, running: false, avgFrom: null, thought: null } as unknown as Boat['ai'];
  return b;
}
/** Steer her for `to` and follow her turn: how far she turned each way, deg. */
function turnTo(b: Boat, to: number, s = 40) {
  let right = 0, left = 0, prev = b.h;
  sail(b, s, () => { b.desired = to; const d = wrap(b.h - prev); if (d > 0) right += d; else left -= d; prev = b.h; });
  return { right, left, end: b.h };
}

describe('the AI helm commits to the way round a big turn', () => {
  it('too slow to tack (0.9 m/s), told to the other tack, she goes round by the gybe and never reverses', () => {
    const r = turnTo(aiBoat(45, 0.9), 335);
    expect(r.right, 'turned the long way, to starboard').toBeGreaterThan(200);
    expect(r.left, 'turned back the other way').toBeLessThan(15);
    expect(Math.abs(wrap(r.end - 335))).toBeLessThan(15);
  });
  it('a turn done, a new course a little behind her: back to it the short way', () => {
    const b = aiBoat(300, 2.5); b.tack = 'P';
    turnTo(b, 90, 0.1); b.ai!.turnCommit = 1; b.ai!.commitFor = 10; b.ai!.commitLong = false; b.h = 20; // (committed to starboard, toward 10, and already past it)
    const r = turnTo(b, 340, 12);
    expect(r.right, 'on round the long way').toBeLessThan(30);
    expect(Math.abs(wrap(r.end - 340))).toBeLessThan(15);
  });
});
