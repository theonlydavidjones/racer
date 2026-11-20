import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { V } from '../src/core/math';
import { recordPose, rowCouldAvoid } from '../src/rules/pairs';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { boat, ctx } from './diagram';

// Rule 14 for the right-of-way boat (43.1(c): only with damage) and 44.1(b) (serious damage: retire)
const meet = (vS: number, vP: number, lead = 0) => {
  // S on starboard at 315°, P on port at 045°, S's bow reaching P's track at 60 s with P's middle `lead` m past it (3.5:
  // S's bow on P's quarter, WS Case 123's hit); P never turns
  const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [0, 0], heading: 45 });
  for (let t = 52; t <= 60 + 1e-9; t += 0.1) for (const [b, h, v, ahead] of [[S, 315, vS, -3.82], [P, 45, vP, lead]] as const) { // (S's middle half a length short: her bow on P's track)
    const u = V(h), d = 60 - t; b.h = h; b.v = v; b.vx = u.x * v; b.vy = u.y * v; b.x = u.x * (ahead - v * d); b.y = u.y * (ahead - v * d); recordPose(b, t);
  }
  return { S, P };
};
describe('rule 14: could the right-of-way boat have avoided contact once it was clear?', () => {
  it('WS Case 123: alike, the same speed, S\'s bow on P\'s quarter: once P\'s bow crossed S\'s, S could still bear away: she broke 14', () => {
    const { S, P } = meet(2.5, 2.5, 3.5);
    expect(rowCouldAvoid(S, P, ctx(60))).toBe(true);
  });
  it('a slow port boat holding on: clear from further off (her length takes her longer), and S had time', () => {
    const { S, P } = meet(2.5, 1, 1);
    expect(rowCouldAvoid(S, P, ctx(60))).toBe(true);
  });
  it('bow to bow at the same speed: by the time it\'s clear it is too late for S (she need not act sooner)', () => {
    const { S, P } = meet(2.5, 2.5, 0);
    expect(rowCouldAvoid(S, P, ctx(60))).toBe(false);
  });
  it('a slow starboard boat against a faster port boat: too late for her', () => {
    const slow = meet(1.5, 2.5, 3.5);
    expect(rowCouldAvoid(slow.S, slow.P, ctx(60))).toBe(false);
  });
  it('the moment it\'s clear matters: given only 2.5 s, S in the Case 123 crossing could not', () => {
    const { S, P } = meet(2.5, 2.5, 3.5);
    expect(rowCouldAvoid(S, P, ctx(60), 2.5)).toBe(false);
  });
  it('no history: no (nothing to show she had time)', () => {
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

describe('the blow: along the line where the hulls touch (contactNormal), not between their centres', () => {
  it('a sideswipe on reciprocal courses: the normal is athwartships, so the passing speed is no blow', async () => {
    const { contactNormal } = await import('../src/rules/geometry');
    const A = boat('A', { at: [0, 0], heading: 0 }), B = boat('B', { at: [2.0, 3], heading: 180 }); // (passing 2 m apart)
    const c = contactNormal(A, B);
    expect(Math.abs(c.n.x)).toBeGreaterThan(0.95); // (east-west: across both hulls)
  });
  it('a bow into the other\'s side: the normal is the struck side\'s, wherever along her it lands', async () => {
    const { contactNormal } = await import('../src/rules/geometry');
    const S = boat('S', { at: [0, 0], heading: 90 }); // (struck: her side faces north and south)
    for (const along of [0, 3]) {
      const P = boat('P', { at: [along, -3.8], heading: 0 }); // (P's bow just touching S's side, `along` m from her middle)
      expect(Math.abs(contactNormal(P, S).n.y)).toBeGreaterThan(0.95);
    }
  });
});
