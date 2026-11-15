import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import type { Boat } from '../src/boat/boat';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { aiThink } from '../src/ai/ai';
import { yawLag } from '../src/boat/physics';
import { beatFor } from '../src/boat/seaway';
import { V, dist, n360, wrap } from '../src/core/math';
import { cpa, hullGap } from '../src/rules';

// Rule 14 between two AI boats: a port-tacker that makes a starboard boat swerve to avoid her hasn't kept clear (the
// definition of Keep Clear, (a): the right-of-way boat "can sail her course with no need to take avoiding action"), so
// the swerve is an incident as it is when your boat forces one (ai.ts, world.ts forced14). Only the swerve proper:
// about to touch, close; not the starboard boat's wide early avoidance, a boat-length or two out, which the AI
// port-tacker, already turning away, might yet have made unneeded.
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', tideDate: '2026-11-14', traffic: 0, ...o });
function put(w: World, b: Boat, at: { x: number; y: number }, x: number, y: number, h: number, v: number): void {
  const u = V(h), from = w.wind.from, rel = wrap(from - h);
  Object.assign(b, { x: at.x + x, y: at.y + y, h: n360(h), desired: n360(h), v, vx: u.x * v, vy: u.y * v, tack: rel >= 0 ? 'S' : 'P', twa: Math.abs(rel), rel, tacking: false, penalty: 0, started: true });
  b.ww = { from, kt: w.wind.kt };
}
/** B on starboard close-hauled and Y on port close-hauled, both at v, meeting at the same point in t seconds. */
function crossing(t: number, v = 3, userY = false) {
  const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 3 }), 1);
  w.t = 300;
  const [, B, Y] = w.boats, F = w.wind.from;
  const at = { x: w.center.x - w.N.x * 300, y: w.center.y - w.N.y * 300 };
  for (const b of w.boats) put(w, b, at, 5000, 5000, 0, 2);
  const beat = beatFor({ ww: { kt: w.wind.kt }, sea: B.sea }), hS = n360(F - beat), hP = n360(F + beat);
  const uS = V(hS), uP = V(hP), meet = { x: uS.x * v * t, y: uS.y * v * t };
  put(w, B, at, 0, 0, hS, v);
  put(w, Y, at, meet.x - uP.x * v * t, meet.y - uP.y * v * t, hP, v);
  if (userY) Y.isUser = true;
  return { w, B, Y };
}
describe('Rule 14 between AI boats: a swerve forced by the keep-clear boat is a foul (ai.ts forced14)', () => {
  it('about to touch, within 10 m: the starboard boat\'s swerve is put down to the port-tacker', () => {
    const { w, B, Y } = crossing(1.2, 4);
    expect(w.rights(B, Y).kc).toBe(Y);
    const cp = cpa(B, Y);
    expect(cp.t).toBeLessThan(Math.min(1.5, yawLag(B.v)) + 1);
    expect(cp.d).toBeLessThan(4.5);
    expect(dist(B, Y)).toBeLessThan(10);
    expect(hullGap(B, Y), 'not touching yet').toBeGreaterThan(0.5);
    aiThink(w, B, DT);
    expect(Math.abs(wrap(B.desired - B.h)), 'she swerves').toBeGreaterThan(5);
    expect(B.forced14).toBe(Y.id);
  });
  it('her wider, earlier avoidance, a couple of lengths out: she still keeps out of it, but no foul is called', () => {
    const { w, B, Y } = crossing(2.4);
    const cp = cpa(B, Y);
    expect(cp.t).toBeGreaterThan(Math.min(1.5, yawLag(B.v)) + 1);
    expect(cp.t).toBeLessThan(2.4 + Math.min(1.5, yawLag(B.v))); // (inside the rule 14 branch: she does avoid)
    aiThink(w, B, DT);
    expect(Math.abs(wrap(B.desired - B.h)), 'she avoids').toBeGreaterThan(5);
    expect(B.forced14).toBeNull();
  });
  it('your boat in the same place: the swerve she forces is still a foul, as before', () => {
    const { w, B, Y } = crossing(2.5, 3, true);
    expect(dist(B, Y)).toBeLessThan(10);
    expect(cpa(B, Y).t).toBeGreaterThan(Math.min(1.5, yawLag(B.v)) + 1);
    aiThink(w, B, DT);
    expect(B.forced14).toBe(Y.id);
  });
});
