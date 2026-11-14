import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { V } from '../src/core/math';
import { recordPose, rowCouldAvoid } from '../src/rules/pairs';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { boat, ctx } from './diagram';

// Rule 14 for the right-of-way boat (43.1(c): only with damage) and 44.1(b) (serious damage: retire)
const meet = (vS: number, vP: number) => {
  // S on starboard at 315°, P on port at 045°, both reaching the origin at 60 s; P never turns
  const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [0, 0], heading: 45 });
  for (let t = 52; t <= 60 + 1e-9; t += 0.1) for (const [b, h, v] of [[S, 315, vS], [P, 45, vP]] as const) {
    const u = V(h), d = 60 - t; b.h = h; b.v = v; b.vx = u.x * v; b.vy = u.y * v; b.x = -u.x * v * d; b.y = -u.y * v * d; recordPose(b, t);
  }
  return { S, P };
};
describe('rule 14: could the right-of-way boat have avoided contact once it was clear?', () => {
  it('a slow port boat holding on into a starboard boat at 2.5 m/s: S had time to turn away, so with damage she broke 14 too', () => {
    const { S, P } = meet(2.5, 1);
    expect(rowCouldAvoid(S, P, ctx(60))).toBe(true);
  });
  it('a port boat as fast as the starboard boat: once it was clear, it was too late for S', () => {
    const { S, P } = meet(2.5, 2.5);
    expect(rowCouldAvoid(S, P, ctx(60))).toBe(false);
    const slow = meet(1.5, 2.5);
    expect(rowCouldAvoid(slow.S, slow.P, ctx(60))).toBe(false);
  });
  it('no history: no (she had no time we can show)', () => {
    expect(rowCouldAvoid(boat('S', { at: [0, 0], heading: 315 }), boat('P', { at: [5, 5], heading: 45 }), ctx(60))).toBe(false);
  });
});

const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', current: 'slack', fleet: 1, ...o });
describe('damage in the World: serious damage, the fouler retires (44.1(b))', () => {
  it('you on port, holding on into a starboard boat at speed: serious damage, and you retire', () => {
    const w = new World(SS2, settings(), 3);
    w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; }
    const u = w.user, o = w.boats[1], wf = w.wind.from, mid = { x: u.x + 200, y: u.y + 200 };
    const place = (b: typeof u, h: number, s: number) => { const v = V(h); Object.assign(b, { h, desired: h, v: 2.5, x: mid.x - v.x * s, y: mid.y - v.y * s }); };
    place(o, (wf + 315) % 360, 3); place(u, (wf + 45) % 360, 3); // (both 3 m short of meeting: too late for either)
    let damage: string | undefined;
    w.onIncident = (_a, _b, inc) => { damage ??= inc.damage; };
    for (let i = 0; i < 60 * 3 && !u.retired; i++) { w.step(DT); w.drainEvents(); }
    expect(damage).toBe('serious');
    expect(u.retired).toBe(true);
  });
});
