import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, brg, wrap } from '../src/core/math';
import { X_FLAG_MAX } from '../src/sim/signals';
import train from '../src/courses/data/training-windward-return.json';
import type { Boat } from '../src/boat/boat';

/** Your helm put over toward a heading (the World's turn to a heading: physics.ts turnTarget), once. */
const steerTo = (u: Boat, h: number) => { if (u.turnTarget == null || Math.abs(wrap(u.turnTarget - h)) > 1) { u.turnTarget = (h + 360) % 360; u.turnDir = Math.sign(wrap(h - u.h)) || 1; } };
/** A point `fwd` m ahead of p on heading h and `stbd` m to her starboard. */
const off = (p: { x: number; y: number }, h: number, fwd: number, stbd: number) => { const f = V(h), r = V(h + 90); return { x: p.x + f.x * fwd + r.x * stbd, y: p.y + f.y * fwd + r.y * stbd }; };
// (for a new case: say(calls, w) prints the calls and where the boats ended)
export const say = (calls: { rule: string; part?: string; fouler: Boat; kind: string; t: number }[], w: World) => console.log(JSON.stringify([calls.map(c => `${c.rule} ${c.part ?? ''} ${c.fouler.name} ${c.kind} ${c.t.toFixed(1)}`), w.boats.map(b => `${b.name} ${b.h.toFixed(0)} ${b.tack} ${b.v.toFixed(2)}`)]));

const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', current: 'slack', sea: 'flat', traffic: 0, judging: 'umpired', ...o });

/** Two boats in open water, yours held on the course given (an AI boat sails as she would), stepped to the first call. */
export function meet(place: (w: World, at: (across: number, up: number) => { x: number; y: number }, from: number) => void, secs = 30, each?: (w: World, dt: number) => void) {
  const w = new World(SS2, settings({ fleet: 1 }), 5);
  w.t = 60;
  const from = w.wind.from, up = V(from), right = V(from + 90);
  const at = (a: number, b: number) => ({ x: 200 * right.x + a * right.x + b * up.x, y: 200 * right.y + a * right.y + b * up.y });
  for (const b of w.boats) Object.assign(b, { started: true, ocs: false, leg: 0, penalty: 0, lastTackT: -999, tacking: false });
  place(w, at, from);
  for (const b of w.boats) { const u = V(b.h); b.vx = u.x * b.v; b.vy = u.y * b.v; b.desired = b.h; }
  const calls: { rule: string; part?: string; fouler: Boat; kind: string; t: number }[] = [];
  w.onIncident = (_a, _b, inc) => { calls.push({ rule: inc.rule, part: inc.part, fouler: inc.fouler as Boat, kind: inc.kind, t: w.t }); };
  const t0 = w.t;
  while (w.t < t0 + secs && !calls.length) { each?.(w, w.t - t0); w.step(DT); w.paused = false; w.drainEvents(); }
  return { w, calls };
}

// The rules coverage check (docs/rules/coverage.md, 21 Nov 2026): each rule here had only unit tests of the judge on
// set-up poses, or a Case loop. These sail the meeting in a World: you foul, an AI boat sails as she would (she keeps
// clear or holds her course), and the call is the engine's, as in a race. RRS 2025–2028.
describe('Part 2 calls, sailed (you hold your course, the AI boat sails as she would, to the call)', () => {
  it('rule 10: port meets starboard on a collision course; port is called', () => {
    const { w, calls } = meet((w, at, from) => {
      const [you, o] = w.boats;
      Object.assign(you, { ...at(-30, 0), h: (from + 45) % 360, tack: 'P', v: 2.5 }); // port, close-hauled
      Object.assign(o, { ...at(30, 0), h: (from - 45 + 360) % 360, tack: 'S', v: 2.5 });
    });
    expect(calls[0], 'the first call').toMatchObject({ rule: '10', fouler: w.user });
  });

  const S = (from: number) => (from - 45 + 360) % 360, P = (from: number) => (from + 45) % 360;
  it('rule 11: you, to windward and overlapped, bear down onto the leeward boat', () => {
    const { w, calls } = meet((w, at, from) => {
      const [you, o] = w.boats, h = S(from), p = at(0, 0);
      Object.assign(you, { ...p, h: h - 10, tack: 'S', v: 2.5 }); // (starboard tack: leeward is her port side)
      Object.assign(o, { ...off(p, h, 2, -7), h, tack: 'S', v: 2.5 });
    });
    expect(calls[0], 'the first call').toMatchObject({ rule: '11', fouler: w.user });
  });
  it('rule 12: you, clear astern and faster, sail into her transom', () => {
    const { w, calls } = meet((w, at, from) => {
      const [you, o] = w.boats, h = S(from), p = at(0, 0);
      Object.assign(you, { ...p, h, tack: 'S', v: 3.2 });
      Object.assign(o, { ...off(p, h, 14, 0), h, tack: 'S', v: 1.2 });
    });
    expect(calls[0], 'the first call').toMatchObject({ rule: '12', fouler: w.user });
  });
  it('rule 16.1: you, leeward with right of way, luff hard into the windward boat close aboard', () => {
    const { w, calls } = meet((w, at, from) => {
      const [you, o] = w.boats, h = S(from) - 30, p = at(0, 0); // (a close reach)
      Object.assign(you, { ...p, h, tack: 'S', v: 2.8 });
      Object.assign(o, { ...off(p, h, 0.5, 2.8), h, tack: 'S', v: 2.8 }); // (to windward: her starboard side)
    }, 10, (w, dt) => { if (dt < 0.02) steerTo(w.user, S(w.wind.from) - 10); }); // (a 20° luff at once)
    expect(calls[0], 'the first call').toMatchObject({ rule: '16.1', fouler: w.user });
  });
  it('rule 17: you, overlapped to leeward from clear astern within two lengths, sail above close-hauled into her', () => {
    const { w, calls } = meet((w, at, from) => {
      const [you, o] = w.boats, h = S(from), p = at(0, 0);
      Object.assign(you, { ...off(p, h, -10, -6), h, tack: 'S', v: 3.2 }); // (astern and to leeward, faster)
      Object.assign(o, { ...p, h, tack: 'S', v: 2.0 });
    }, 25, (w, dt) => { if (dt > 4 && dt < 4.05) steerTo(w.user, S(w.wind.from) + 25); });
    expect(calls[0], 'the first call').toMatchObject({ rule: '17', fouler: w.user });
  });
  it('rule 23.1: you, finished, get in the way of a boat still racing', () => {
    const { w, calls } = meet((w, at, from) => {
      const [you, o] = w.boats;
      Object.assign(you, { ...at(-30, 0), h: P(from), tack: 'P', v: 2.5, finished: true, finishT: 30 });
      Object.assign(o, { ...at(30, 0), h: S(from), tack: 'S', v: 2.5 });
    });
    expect(calls[0], 'the first call').toMatchObject({ rule: '23', part: '23.1', fouler: w.user });
  });
});


describe('the start, sailed: the X flag (RRS 29.1) and returning boats (21.1)', () => {
  const TRAIN = train as unknown as CourseFile;
  const overAtGun = (fleet: number) => {
    const w = new World(TRAIN, settings({ fleet, seq: 2 }), 1), u = w.user, to = brg(w.N.x, w.N.y);
    w.t = -0.5; Object.assign(u, { x: w.center.x + w.N.x * 6, y: w.center.y + w.N.y * 6, h: to, v: 0, prevD: null, luff: true });
    let horns = 0, said = '';
    for (let i = 0; i < 60; i++) { w.step(DT); for (const e of w.drainEvents()) { if (e.type === 'horn') horns++; if (e.type === 'toast') said += e.msg; } }
    return { w, u, to, horns, said };
  };

  it('a boat over at the gun: X goes up with one sound (29.1), and comes down once she has returned', () => {
    const { w, u, to, horns, said } = overAtGun(0);
    expect(u.ocs).toBe(true);
    expect(w.flags).toContain('X');
    expect(horns).toBe(2); // (the start's, and the recall's one sound)
    expect(said).toMatch(/Individual recall: X flag up, one sound/);
    Object.assign(u, { x: w.center.x - w.N.x * 12, y: w.center.y - w.N.y * 12, h: to }); w.step(DT); w.step(DT);
    expect(u.ocs).toBe(false);
    expect(w.flags).not.toContain('X');
  });

  it('a boat that never returns: X comes down four minutes after the start (29.1)', () => {
    const { w } = overAtGun(0);
    // (she stays on the course side, never coming back: held 20 m above the line, as the flag's clock is what's tested)
    const above = () => { const u = w.user; u.x = w.center.x + w.N.x * 20; u.y = w.center.y + w.N.y * 20; u.prevD = null; };
    while (w.t < X_FLAG_MAX - 1) { above(); w.step(DT); w.drainEvents(); }
    expect(w.user.ocs).toBe(true);
    expect(w.flags).toContain('X');
    while (w.t < X_FLAG_MAX + 1) { above(); w.step(DT); w.drainEvents(); }
    expect(w.flags).not.toContain('X');
  });

  it('nobody over: no X', () => {
    const w = new World(TRAIN, settings({ fleet: 0, seq: 2 }), 1), u = w.user, to = brg(w.N.x, w.N.y);
    w.t = -0.5; Object.assign(u, { x: w.center.x - w.N.x * 20, y: w.center.y - w.N.y * 20, h: to, v: 0, prevD: null, luff: true });
    for (let i = 0; i < 60; i++) { w.step(DT); w.drainEvents(); }
    expect(w.flags).not.toContain('X');
  });

  it('rule 21.1: you, over early and sailing back to start, meet a boat that has started; you keep clear, and are called', () => {
    const w = new World(TRAIN, settings({ fleet: 1, seq: 2 }), 1), [u, o] = w.boats, to = brg(w.N.x, w.N.y);
    w.t = 30;
    const p = { x: w.center.x + w.N.x * 15, y: w.center.y + w.N.y * 15 };
    Object.assign(u, { ...p, h: (to + 180) % 360, desired: (to + 180) % 360, v: 2.5, started: false, ocs: true, luff: false, prevD: null });
    const sh = (w.wind.from - 45 + 360) % 360;
    Object.assign(o, { x: p.x - w.N.x * 8, y: p.y - w.N.y * 8, h: sh, desired: sh, tack: 'S', v: 1.2, started: true, ocs: false, leg: 0 });
    for (const b of [u, o]) { const v = V(b.h); b.vx = v.x * b.v; b.vy = v.y * b.v; }
    const calls: { rule: string; fouler: Boat }[] = [];
    w.onIncident = (_a, _b, inc) => { calls.push({ rule: inc.rule, fouler: inc.fouler as Boat }); };
    while (w.t < 50 && !calls.length) { w.step(DT); w.paused = false; w.drainEvents(); }
    expect(u.returning).toBe(true);
    expect(calls[0], 'the first call').toMatchObject({ rule: '21.1', fouler: u });
  });
});

describe('one penalty for the incident, sailed (RRS 44.1(a))', () => {
  it('you foul a boat at the mark and touch the mark in the same incident: the foul\'s turns, no extra turn for rule 31', () => {
    const w = new World(SS2, settings({ fleet: 1 }), 7), [u, o] = w.boats;
    w.t = 30; for (const b of w.boats) Object.assign(b, { started: true, ocs: false, leg: 0, penalty: 0, lastTackT: -999 });
    const m = w.C.marks[0].p, h = (w.wind.from + 180) % 360, back = V(w.wind.from), side = V(w.wind.from + 90);
    Object.assign(o, { x: m.x + back.x * 4 + side.x * 1, y: m.y + back.y * 4 + side.y * 1, h, desired: h, v: 0.4 });
    Object.assign(u, { x: m.x + back.x * 16 + side.x * 0.5, y: m.y + back.y * 16 + side.y * 0.5, h, desired: h, v: 2.2 });
    for (const b of [u, o]) { const v = V(b.h); b.vx = v.x * b.v; b.vy = v.y * b.v; }
    const calls: string[] = []; let said = '', touched = false;
    w.onIncident = (_a, _b, inc) => { calls.push(`${inc.rule} ${(inc.fouler as Boat).name}`); };
    for (let i = 0; i < 60 * 15; i++) { w.step(DT); w.paused = false; touched ||= !!u.markTouch; for (const e of w.drainEvents()) if (e.type === 'toast') said += e.msg + ' | '; }
    // (here the foul is mark-room, 18.2(a): she was clear ahead at the zone; any Part 2 foul does)
    expect(calls[0]).toMatch(/ You$/);
    expect(touched, 'you touched the mark').toBe(true);
    expect(said).toContain('only owe the penalty for the foul (Rule 44.1(a))');
    expect(u.penaltyTotal, 'no One-Turn Penalty for the touch').toBe(0); // (your foul's turns come with the incident review)
  });
});
