import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, wrap } from '../src/core/math';
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
