import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { CONTACT_GAP, INCIDENT_COOLDOWN } from '../src/rules';
import { LOA, V } from '../src/core/math';

// Rule 44.1, US Appeal 65 ("whether the second occurrence was the inevitable result of the first"): touches between the
// same two boats while they're still caught up together are one incident. A boat already turning for an earlier penalty
// (21.2 has her keep clear of all others) touches another, is held off her, under a length, and touches her again: one
// incident if they haven't parted, or she's had no steerage way since; a new breach if she has, so could have kept
// clear. Built by hand, so it doesn't hang on how one race sails (Crew Model's crew-stations race, 14 Nov 2026: the hulls
// overlapped at a touch (g0 = 0), a metre's drift read as parting, and a second touch 12 s on counted anew).
function tangle(o: { user?: boolean; vA: number; apart: number; pressed?: number; retired?: boolean; every?: number; n?: number; thenB?: boolean }) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 2, current: 'slack' } as Settings, 7);
  w.t = 60; w.exactPairs = true;
  const A = o.user ? w.user : w.boats[1], B = w.boats[2];
  for (const b of w.boats) Object.assign(b, { started: true, ocs: false });
  w.boats.find(b => b !== A && b !== B)!.x += 500; // (the third boat well out of it)
  const got: { t: number; kind: string }[] = [], byB: number[] = [];
  let bTurning = false;
  w.onIncident = (a, b, inc) => { if (inc.fouler === B && (a === A || b === A)) byB.push(w.t); if (inc.fouler === A && (a === B || b === B)) got.push({ t: w.t, kind: inc.kind }); };
  // (both held, side by side on opposite headings: B at 0.3 m/s, A at vA, so they close at 0.6 m/s and more, never
  // jammed; A turning for an earlier penalty, still owing)
  // (pressed, or alongside: on the same heading at the same speed, side by side, as two boats lying together do; A to
  // windward of B, so she's the one to keep clear whatever else holds: rule 11)
  const together = !!(o.pressed || o.every), h = (w.wind.from + 90) % 360, side = V(together ? h - 90 : h + 90), B0 = { x: B.x, y: B.y };
  let off = 0;
  const hB = together ? h : (h + 180) % 360, vB = together ? o.vA : 0.3;
  const run = (s: number) => {
    for (let i = 0; i < Math.round(s / DT); i++) {
      Object.assign(B, { x: B0.x, y: B0.y, h: hB, desired: hB, v: vB });
      if (bTurning) { B.penaltyDir = 1; B.penalty = Math.max(B.penalty, 360); B.penaltyTotal = Math.max(B.penaltyTotal, B.penalty); }
      Object.assign(A, { x: B0.x + side.x * off, y: B0.y + side.y * off, h, desired: h, v: o.vA, penaltyDir: 1 });
      if (o.retired) { A.retired = true; A.penalty = A.penaltyTotal = 0; A.penaltyDir = 0; } // (not racing: her contacts carry no penalty)
      else { A.penalty = Math.max(A.penalty, 360); A.penaltyTotal = Math.max(A.penaltyTotal, A.penalty); }
      w.step(DT); w.paused = false;
    }
  };
  // (a touch with the hulls overlapping, then held off `apart` m for 4.5 s (past COMPELLED_WINDOW), then together again
  // as the pair's incident cooldown runs out, so that's what's judged: three touches in 13 s, inside TANGLE_MAX)
  off = together ? 2 : 0; run(0.5);
  // (pressed: held touching, side by side 2 m apart between the centerlines, all along)
  if (o.pressed) { off = 2; run(o.pressed); return got.length; }
  // (then B, taking a penalty now (21.2: she keeps clear of A), touches her, still within a metre of her: B's own breach)
  if (o.thenB) { off = o.apart; run(7); bTurning = true; off = 2; run(1); return byB.length; }
  // (alongside: held `apart` off, a touch every `every` s, n of them)
  if (o.every) { for (let k = 1; k < (o.n ?? 4); k++) { off = o.apart; run(o.every - 1); off = 2; run(1); } return got.length; }
  for (let k = 0; k < 2; k++) { off = o.apart; run(4.5); off = 0; run(INCIDENT_COOLDOWN - 4.5 + 0.5); }
  expect(got.every(g => g.kind === 'contact'), JSON.stringify(got)).toBe(true);
  return got.length;
}

// (NEAR: over a metre wider than touching, so parted, and under a length; JUST: within a metre of touching, not parted,
// though over a metre wider than the overlapped touch's g0 = 0; FAR: more than a length apart)
const NEAR = CONTACT_GAP + 1.5, JUST = CONTACT_GAP + 0.5, FAR = LOA + 2;
describe('One incident per pair while two boats stay tangled (Rule 44.1, US Appeal 65)', () => {
  it('a boat turning, without steerage way, touching the same boat again inside a length: one incident, AI or you', () => {
    expect(tangle({ vA: 0.3, apart: NEAR })).toBe(1);
    expect(tangle({ user: true, vA: 0.3, apart: NEAR })).toBe(1);
  }, 60000);
  it('with steerage way since, once they\'d parted, she could have kept clear: each touch a new breach (21.2, 44.2)', () => {
    expect(tangle({ vA: 1.5, apart: NEAR })).toBe(3);
    expect(tangle({ user: true, vA: 1.5, apart: NEAR })).toBe(3);
  }, 60000);
  it('but not parted (within a metre of touching), one collision going on: one incident, AI or you', () => {
    expect(tangle({ vA: 1.5, apart: JUST })).toBe(1);
    expect(tangle({ user: true, vA: 1.5, apart: JUST })).toBe(1);
  }, 60000);
  it('pressed together, lying side by side touching all along, for longer than TANGLE_MAX: one incident', () => {
    expect(tangle({ vA: 1.5, apart: 0, pressed: 45 })).toBe(1);
    expect(tangle({ user: true, vA: 1.5, apart: 0, pressed: 45 })).toBe(1);
  }, 60000);
  it('a contact with no penalty (she\'s retired, not racing) pressed together all along: one incident too, not one at every cooldown', () => {
    expect(tangle({ vA: 1.5, apart: 0, pressed: 45, retired: true })).toBe(1);
  }, 60000);
  it('but sailing alongside within a metre, touching every 25 s, isn\'t pressed: the tangle\'s 30 s still bounds it', () => {
    expect(tangle({ vA: 1.5, apart: JUST, every: 25, n: 4 })).toBe(2);
  }, 60000);
  it('and with no penalty, each such touch is judged afresh: she chose it, it wasn\'t one collision going on', () => {
    expect(tangle({ vA: 1.5, apart: JUST, every: 25, n: 4, retired: true })).toBe(4);
    expect(tangle({ vA: 1.5, apart: NEAR, retired: true })).toBe(3);
  }, 60000);
  it('after a touch with no penalty, the other boat\'s own breach a few seconds on, still within a metre: hers, not swallowed', () => {
    expect(tangle({ vA: 1.5, apart: JUST, retired: true, thenB: true })).toBe(1);
  }, 60000);
  it('and once they have been a length apart, the next touch is a new incident', () => {
    expect(tangle({ vA: 0.3, apart: FAR })).toBe(3);
  }, 60000);
});
