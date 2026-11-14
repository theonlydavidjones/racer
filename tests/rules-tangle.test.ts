import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { CONTACT_GAP } from '../src/rules';
import { LOA, V } from '../src/core/math';

// Rule 44.1, US Appeal 65 ("whether the second occurrence was the inevitable result of the first"): touches between the
// same two boats while they're still caught up together are one incident. A boat already turning for an earlier penalty
// (21.2 has her keep clear of all others) that touches another, is held off her, under a length, and touches her again:
// one incident if she's had no steerage way since; a new breach if she has, so could have kept clear. Built by hand, so
// it doesn't hang on how one race sails (Crew Model's crew-stations race, 14 Nov 2026: a second touch 12 s on, the hulls
// overlapped at the touch before (g0 = 0), counted anew).
function tangle(o: { user?: boolean; vA: number; apart: number }) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 2, current: 'slack' } as Settings, 7);
  w.t = 60; w.exactPairs = true;
  const A = o.user ? w.user : w.boats[1], B = w.boats[2];
  for (const b of w.boats) Object.assign(b, { started: true, ocs: false });
  w.boats.find(b => b !== A && b !== B)!.x += 500; // (the third boat well out of it)
  const calls: number[] = [];
  w.onIncident = (a, b, inc) => { if (inc.fouler === A && (a === B || b === B)) calls.push(w.t); };
  const h = (w.wind.from + 90) % 360, side = V(h + 90), toB = (h + 270) % 360;
  // (B at 0.3 m/s, under steerage way; A coming at her at vA: closing at 0.3 m/s and more, never jammed)
  const B0 = { x: B.x, y: B.y };
  let hold: { x: number; y: number } | null = null;
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      Object.assign(B, { x: B0.x, y: B0.y, h, desired: h, v: 0.3 });
      if (hold) Object.assign(A, hold);
      A.v = o.vA; A.penaltyDir = 1; A.penalty = Math.max(A.penalty, 360); A.penaltyTotal = Math.max(A.penaltyTotal, A.penalty); // (turning for an earlier penalty, still owing)
      w.step(DT); w.paused = false;
    }
  };
  const touch = () => { hold = null; Object.assign(A, { x: B0.x + side.x * 1.5, y: B0.y + side.y * 1.5, h: toB, desired: toB }); run(0.5); };
  // (held off her side, parallel, `apart` m between the hulls' centerlines, for 7 s: past the pair's incident cooldown)
  const off = () => { hold = { x: B0.x + side.x * o.apart, y: B0.y + side.y * o.apart }; Object.assign(A, { ...hold, h, desired: h }); run(7); };
  touch(); for (let k = 0; k < 2; k++) { off(); touch(); } // (three touches in 16 s, inside TANGLE_MAX)
  return calls.length;
}

// (CONTACT_GAP + 1.5: over a metre wider than touching (`parted`), well under a length)
const NEAR = CONTACT_GAP + 1.5, FAR = LOA + 2;
describe('One incident per pair while two boats stay tangled (Rule 44.1, US Appeal 65)', () => {
  it('an AI boat turning, under steerage way, touching the same boat again inside a length: one incident', () => {
    expect(tangle({ vA: 0.3, apart: NEAR })).toBe(1);
  }, 60000);
  it('your boat the same: one incident', () => {
    expect(tangle({ user: true, vA: 0.3, apart: NEAR })).toBe(1);
  }, 60000);
  it('but with steerage way she could have kept clear: each touch a new breach (21.2, 44.2), AI or you', () => {
    expect(tangle({ vA: 1.5, apart: NEAR })).toBe(3);
    expect(tangle({ user: true, vA: 1.5, apart: NEAR })).toBe(3);
  }, 60000);
  it('and once they have been a length apart, the next touch is a new incident', () => {
    expect(tangle({ vA: 0.3, apart: FAR })).toBe(3);
  }, 60000);
});
