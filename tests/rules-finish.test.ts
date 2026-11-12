// The racing rules finished (RRS 2025–2028): 20.2(e)'s end, 20.3 passing on a hail, a boat as the obstruction
// (rule 19, WS Case 11; and rule 20), and blanketing as rule 23 interference.
import { settleTrim } from '../src/boat/physics';
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, n360, type Vec } from '../src/core/math';
import { LL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';
import { beatAngle } from '../src/boat/polar';
import { BLANKET_K, BLANKET_TIME, CONTACT_GAP, hullGap, assessPair, hailBreach, newPairRecord, rightOfWay, type RulesBoat, type RulesContext } from '../src/rules';
import { WIND, boat, ctx, moveTo, pair } from './diagram';

describe('Rule 20.2(e): 18.2 stays off until the hailing boat has tacked and avoided the hailed boat', () => {
  //   ↑ wind     (mark M to port, Blue inside and overlapped, both in the zone)
  const M = { name: 'M', p: { x: 0, y: 0 }, type: 'round' as const, side: 'p' as const, beat: true };
  it('a hail that lapses (a breach called) does not bring mark-room back while the hailing boat has still to tack', () => {
    const red = boat('Red', { at: [-12, -10], heading: 315 }), blue = boat('Blue', { at: [-6, -16], heading: 315 });
    const p = pair(red, blue, [M]);
    expect(p.at(48).rule).toBe('18.2(a)');
    p.rec.hail = { by: blue.id, at: 48.5, kind: 'room' };
    expect(p.at(49).rule).not.toBe('18.2(a)');
    expect(p.at(54).foul).toMatchObject({ by: 'Red', rule: '20', kind: 'hail' }); // Red never responded
    expect(p.rec.hail).toBeNull(); // the hail is done with...
    expect(p.at(55).rule).not.toBe('18.2(a)'); // ...but Blue hasn't tacked yet, so 18.2 still doesn't apply (20.2(e))
    expect(p.rec.r202e).not.toBeNull();
  });
  it('ends once she has tacked and is clear of the hailed boat', () => {
    const red = boat('Red', { at: [-12, -10], heading: 315 }), blue = boat('Blue', { at: [-6, -16], heading: 315 });
    const p = pair(red, blue, [M]);
    p.at(48); p.rec.hail = { by: blue.id, at: 48.5, kind: 'room' }; p.at(49);
    red.lastTackT = 50; moveTo(red, [-16, -6], 45); // Red responds by tacking
    p.at(51);
    expect(p.rec.r202e).not.toBeNull(); // Blue hasn't tacked yet
    blue.lastTackT = 52; moveTo(blue, [-2, -14], 45); // Blue tacks, away from Red
    p.at(53);
    expect(p.rec.r202e).not.toBeNull(); // just out of the tack
    p.at(55);
    expect(p.rec.r202e).toBeNull();
  });
});

describe('Rule 20.3: passing on a hail to an additional boat', () => {
  // L (leeward, at the obstruction) hails M; W, to windward of M on the same tack, stops M tacking (WS Case 113)
  const three = () => ({ L: boat('L', { at: [0, 0], heading: 315 }), M: boat('M', { at: [2, 9], heading: 315 }) });
  it('the hailed boat that passed the hail on is not late while the boat she hailed has still to respond', () => {
    const { L, M } = three(), rec = newPairRecord();
    rec.hail = { by: L.id, at: 50, kind: 'room', passedOn: { to: 999, at: 50.5 } };
    expect(hailBreach(rec, L, M, 56)).toBeNull(); // more than 5 s, but W hasn't responded yet
    rec.hail.passedOn!.respondedAt = 57; // W tacks
    expect(hailBreach(rec, L, M, 61)).toBeNull();
    expect(hailBreach(rec, L, M, 62.5)).toMatchObject({ boat: M, role: 'hailed' }); // M then has to tack as soon as possible
  });
  it('if the boat she hailed never responds, she could not tack: no breach for her', () => {
    const { L, M } = three(), rec = newPairRecord();
    rec.hail = { by: L.id, at: 50, kind: 'room', passedOn: { to: 999, at: 50.5, failed: true } };
    expect(hailBreach(rec, L, M, 70)).toBeNull();
  });
});

describe('A boat as the obstruction (Definitions, Obstruction; rule 19, WS Case 11)', () => {
  //            S (starboard, crossing) ←←←
  //      PW ↗ (port, windward, inside: nearest S's stern)
  //           PL ↗ (port, leeward, outside) luffs toward S, squeezing PW
  const setup = () => {
    const S = boat('S', { at: [4, 14], heading: 270 });
    const PW = boat('PW', { at: [8, 9], heading: 45 }), PL = boat('PL', { at: [12, 6], heading: 45 });
    const extra: Partial<RulesContext> = {
      fleet: [S, PW, PL],
      keepsClearOf: (a: RulesBoat, c: RulesBoat) => rightOfWay(a, c, ctx(50)).kc.id === a.id
    };
    return { S, PW, PL, extra };
  };
  it('the outside boat must give the inside boat room between her and the starboard boat: squeezing her is a foul', () => {
    const { PW, PL, extra } = setup();
    const p = pair(PL, PW, [], extra);
    expect(p.at(50)).toMatchObject({ keepsClear: 'PW', rule: '11', foul: null });
    moveTo(PL, [10.3, 7.2], 20, 45); // PL luffs up into PW, toward S
    expect(p.at(51).foul).toMatchObject({ by: 'PL', rule: '19', part: '19.2(b)' });
  });
  it('a boat neither of them has to keep clear of is no obstruction to them', () => {
    const { S, PW, PL, extra } = setup();
    void S; // say PW and PL had no need to keep clear of her (as if she were on port, crossing behind them)
    const other = { ...extra, keepsClearOf: () => false };
    const p = pair(PL, PW, [], other);
    p.at(50);
    moveTo(PL, [10.3, 7.2], 20, 45);
    expect(p.at(51).foul?.rule).not.toBe('19');
  });
});

describe('Rule 23: interfering by taking a boat\'s wind', () => {
  const step = (rec: ReturnType<typeof newPairRecord>, A: ReturnType<typeof boat>, B: ReturnType<typeof boat>, t: number, byA: number) =>
    assessPair(rec, A, B, ctx(t), { swerve: false, blanket: { byA, byB: 0 } }).incident;
  it('23.1: a boat that has finished sitting on a racing boat\'s wind for long enough breaks rule 23', () => {
    const fin = boat('Fin', { at: [0, 20], heading: 180, finished: true }), racer = boat('Racer', { at: [0, 0], heading: 315 });
    const rec = newPairRecord();
    for (let t = 300; t < 300 + BLANKET_TIME - 0.5; t += 0.5) expect(step(rec, fin, racer, t, BLANKET_K + 0.05)).toBeNull();
    expect(step(rec, fin, racer, 300 + BLANKET_TIME, BLANKET_K + 0.05)).toMatchObject({ kind: 'blanket', fouler: fin, rule: '23', part: '23.1' });
  });
  it('just over the finishing line and still clearing it, she is racing: no 23.1 (Definitions, Racing)', () => {
    const fin = boat('Fin', { at: [0, 20], heading: 180, finished: true }), racer = boat('Racer', { at: [0, 0], heading: 315 });
    fin.cleared = false;
    const rec = newPairRecord();
    for (let t = 300; t < 300 + 3 * BLANKET_TIME; t += 0.5) expect(step(rec, fin, racer, t, 0.3)).toBeNull();
  });
  it('a blanketing call leaves the pair\'s other judging alone: contact just after is still a foul', () => {
    const fin = boat('Fin', { at: [0, 20], heading: 180, finished: true }), racer = boat('Racer', { at: [0, 0], heading: 315 });
    const rec = newPairRecord();
    let t = 300;
    for (; !step(rec, fin, racer, t, 0.3); t += 0.5) expect(t).toBeLessThan(320);
    moveTo(fin, [-1, 1.5], 45); // then the finished boat, on port, runs into the racing boat
    expect(step(rec, fin, racer, t + 1, 0)).toMatchObject({ kind: 'contact', fouler: fin, rule: '23' });
  });
  it('passing through her wind for a moment is not interference', () => {
    const fin = boat('Fin', { at: [0, 20], heading: 180, finished: true }), racer = boat('Racer', { at: [0, 0], heading: 315 });
    const rec = newPairRecord();
    for (let t = 300; t < 330; t += 0.5) expect(step(rec, fin, racer, t, (t % 6) < 3 ? BLANKET_K + 0.05 : 0)).toBeNull();
  });
  it('23.2: above her proper course, taking the wind of a boat on another leg breaks it; on her proper course it does not', () => {
    const X = boat('X', { at: [0, 20], heading: 315, leg: 1, aboveProper: true }), Y = boat('Y', { at: [0, 0], heading: 180, leg: 2 });
    let rec = newPairRecord(), last = null;
    for (let t = 100; t <= 100 + BLANKET_TIME; t += 0.5) last = step(rec, X, Y, t, 0.3);
    expect(last).toMatchObject({ fouler: X, rule: '23', part: '23.2' });
    X.aboveProper = false; rec = newPairRecord(); last = null;
    for (let t = 100; t <= 100 + 2 * BLANKET_TIME; t += 0.5) last = last ?? step(rec, X, Y, t, 0.3);
    expect(last).toBeNull();
  });
  it('23.2 below her proper course: bearing away onto the wind of a boat on another leg breaks it; sailing low already does not', () => {
    // X was close-hauled at 315 and bore away to 250 to put her shadow on Y
    const X = boat('X', { at: [0, 20], heading: 250, headingAgo: 315, leg: 1, belowProper: true }), Y = boat('Y', { at: [0, 0], heading: 180, leg: 2 });
    let rec = newPairRecord(), last = null;
    for (let t = 100; t <= 100 + BLANKET_TIME; t += 0.5) { last = step(rec, X, Y, t, 0.3); X.headingAgo = X.h; }
    expect(last).toMatchObject({ fouler: X, rule: '23', part: '23.2' });
    // already low when her shadow reached Y (no bear-away onto her): not called
    rec = newPairRecord(); last = null;
    for (let t = 100; t <= 100 + 2 * BLANKET_TIME; t += 0.5) last = last ?? step(rec, X, Y, t, 0.3);
    expect(last).toBeNull();
  });
  it('on the same leg, racing, blanketing is just tactics', () => {
    const X = boat('X', { at: [0, 20], heading: 315, aboveProper: true }), Y = boat('Y', { at: [0, 0], heading: 315 });
    const rec = newPairRecord();
    let last = null;
    for (let t = 100; t <= 100 + 2 * BLANKET_TIME; t += 0.5) last = last ?? step(rec, X, Y, t, 0.4);
    expect(last).toBeNull();
  });
});

/* ---------- in the world ---------- */
const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', current: 'slack', traffic: 0, fleet: 3, ...o });
const OPEN = LL(37.8180, -122.4420); // open water off the Marina Green
function race() {
  const w = new World(SS2, settings(), 4);
  w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
  w.step(DT);
  return w;
}
type B = World['boats'][number];
function sail(w: World, b: B, p: Vec, tack: 'S' | 'P', v = 2.4) {
  const beat = beatAngle(w.wind.kt), h = n360(tack === 'S' ? w.wind.from - beat : w.wind.from + beat), u = V(h);
  Object.assign(b, { x: p.x, y: p.y, h, desired: h, v, vx: u.x * v, vy: u.y * v, tack, tacking: false, twa: beat, ww: { from: w.wind.from, kt: w.wind.kt }, lastTackT: -999, turnTarget: null });
  settleTrim(b, w.wind.from, w.wind.kt); // (her sheets trimmed close-hauled, as a boat sailing there would have them)
  if (b.ai) { b.ai.turnCommit = 0; b.ai.commitFor = 0; } // (no turn the AI committed to where she was before)
  return h;
}
const off = (p: Vec, u: Vec, k: number) => ({ x: p.x + u.x * k, y: p.y + u.y * k });

describe('in the world', () => {
  it('20.3: hailed with a boat to windward, an AI boat passes the hail on, and tacks only once that boat responds', () => {
    const w = race(), [, L, M, W] = w.boats, wv = V(w.wind.from);
    expect(onLand(OPEN)).toBe(false);
    w.user.x = OPEN.x + 2000; w.user.y = OPEN.y; // out of the way
    sail(w, L, OPEN, 'S'); sail(w, M, off(OPEN, wv, 9), 'S'); sail(w, W, off(OPEN, wv, 18), 'S');
    expect(w.tackBlocker(M)).toBe(W);
    w.hail(L, M, 'room');
    const t0 = w.t;
    w.step(DT); w.step(DT);
    expect(w.pairRecord(M, W)?.hail).toMatchObject({ by: M.id, kind: 'room', relayed: true });
    expect(w.pairRecord(L, M)?.hail?.passedOn?.to).toBe(W.id);
    // (each boat's first tack after the hail: free of it, W may well tack back for the mark later)
    let wT = NaN, mT = NaN;
    for (let t = 0; t < 20; t += DT) { w.step(DT); if (isNaN(wT) && W.lastTackT > t0) wT = W.lastTackT; if (isNaN(mT) && M.lastTackT > t0) mT = M.lastTackT; }
    expect(wT).toBeGreaterThan(t0);
    expect(mT).toBeGreaterThan(t0);
    expect(mT).toBeGreaterThanOrEqual(wT); // M waited for W
    expect(mT - wT).toBeLessThan(6); // and then tacked as soon as she could (20.2(c))
    expect(M.tack, 'and stayed tacked').toBe('P');
  });

  it('20.3: you, hailed with a boat to windward, press Hail and pass it on', () => {
    const w = race(), u = w.user, [, L, W] = w.boats, wv = V(w.wind.from);
    w.boats[3].x = OPEN.x + 2000;
    sail(w, L, OPEN, 'S'); sail(w, u, off(OPEN, wv, 9), 'S'); sail(w, W, off(OPEN, wv, 18), 'S');
    w.hail(L, u, 'room');
    w.userHail();
    expect(w.pairRecord(u, W)?.hail).toMatchObject({ by: u.id, kind: 'room', relayed: true });
    expect(w.pairRecord(u, L)?.hail?.replyAt).toBeUndefined(); // passed on, not "You tack"
  });

  it('20.1 at a boat: close-hauled on port with a starboard boat to duck and a port boat to windward, you may hail', () => {
    const w = race(), u = w.user, [, A, S] = w.boats, wv = V(w.wind.from);
    w.boats[3].x = OPEN.x + 2000;
    const hP = sail(w, u, OPEN, 'P'); sail(w, A, off(OPEN, wv, 8), 'P');
    const beat = beatAngle(w.wind.kt), hS = n360(w.wind.from - beat);
    const X = off(OPEN, V(hP), 15); // where they'd meet, about 6 s on
    sail(w, S, off(X, V(hS), -15), 'S');
    expect(w.boatObstructionAhead(u, A)).toBe(S);
    expect(w.roomBlocker(u)).toBe(A);
    S.x += V(hS).x * -60; S.y += V(hS).y * -60; // far off: not yet "soon"
    expect(w.roomBlocker(u)).toBeNull();
  });

  it('an AI boat closing on a starboard boat, with a port boat to windward, hails it "Room to tack" (WS Case 11)', () => {
    const w = race(), [u, A, W, S] = w.boats, wv = V(w.wind.from);
    // somewhere 500 m straight downwind of a mark, in open water, on the leg to that mark: a beat
    const leg = w.C.marks.findIndex(m => m.type === 'round' && !onLand(off(m.p, wv, -500)) && !onLand(off(m.p, wv, -480)));
    expect(leg).toBeGreaterThanOrEqual(0);
    const P = off(w.C.marks[leg].p, wv, -500);
    for (const b of w.boats) b.leg = leg;
    w.t = 120; // (not in the crush just after the start, when the AI ducks instead)
    u.x = P.x + 2000;
    const hP = sail(w, A, P, 'P'); sail(w, W, off(P, wv, 8), 'P');
    const beat = beatAngle(w.wind.kt), hS = n360(w.wind.from - beat), X = off(P, V(hP), 26);
    sail(w, S, off(X, V(hS), -26), 'S');
    expect(w.roomBlocker(A)).toBe(W);
    let hailed = false;
    for (let t = 0; t < 8 && !hailed; t += DT) { w.step(DT); hailed = w.pairRecord(A, W)?.hail?.by === A.id; }
    expect(hailed).toBe(true);
    // she holds her course while W responds, then tacks (20.2(d)), and nobody touches
    const t0 = w.t; let minGap = Infinity;
    for (let t = 0; t < 20; t += DT) { w.step(DT); minGap = Math.min(minGap, hullGap(A, S), hullGap(A, W)); }
    expect(W.lastTackT).toBeGreaterThan(t0 - 3);
    expect(A.lastTackT).toBeGreaterThanOrEqual(W.lastTackT);
    expect(minGap).toBeGreaterThan(CONTACT_GAP);
  });

  it('if her hail goes unanswered (passed on to a boat that never responds), the AI still ducks the starboard boat in time', () => {
    for (const gap of [22, 26, 30]) {
      const w = race(), [u, A, W, S] = w.boats, wv = V(w.wind.from);
      const leg = w.C.marks.findIndex(m => m.type === 'round' && !onLand(off(m.p, wv, -500)) && !onLand(off(m.p, wv, -480)));
      const P = off(w.C.marks[leg].p, wv, -500);
      for (const b of w.boats) b.leg = leg;
      w.t = 120;
      const hP = sail(w, A, P, 'P'); sail(w, W, off(P, wv, 8), 'P'); sail(w, u, off(P, wv, 30), 'P'); // you, 22 m to windward of W, do nothing
      const beat = beatAngle(w.wind.kt), hS = n360(w.wind.from - beat), X = off(P, V(hP), gap);
      sail(w, S, off(X, V(hS), -gap), 'S');
      let minGap = Infinity;
      let relayed = false;
      for (let t = 0; t < 20; t += DT) { u.h = hP; u.desired = hP; w.step(DT); minGap = Math.min(minGap, hullGap(A, S)); relayed ||= !!w.pairRecord(A, W)?.hail?.passedOn; }
      expect(relayed, `starting ${gap} m off: W passed the hail on to you`).toBe(true);
      expect(minGap, `starting ${gap} m off`).toBeGreaterThan(CONTACT_GAP);
    }
  });

  it('a running boat takes a good part of the wind of a boat close downwind of her, and none of one upwind', () => {
    const w = race(), u = w.user, X = w.boats[1], wv = V(w.wind.from);
    sail(w, X, OPEN, 'S'); X.h = n360(w.wind.from + 180 - 10); X.desired = X.h;
    sail(w, u, off(OPEN, wv, -14), 'S');
    w.step(DT);
    u.x = OPEN.x - wv.x * 14; u.y = OPEN.y - wv.y * 14; X.x = OPEN.x; X.y = OPEN.y;
    expect(w.takenBy(X, u)).toBeGreaterThan(BLANKET_K);
    u.x = OPEN.x + wv.x * 14; u.y = OPEN.y + wv.y * 14;
    expect(w.takenBy(X, u)).toBeLessThan(0.03);
  });
});

void WIND;

describe('proper course allows for the current (Rules 17, 23.2)', () => {
  it('reaching across a strong tide, her proper course is the crab up-tide of the mark, not the bearing of it', async () => {
    const { properTwa } = await import('../src/sim/world');
    const w = race(), b = w.boats[1], m = w.C.marks[b.leg];
    // put her beam-on to the wind, the mark straight ahead of her
    const wv = V(w.wind.from), side = V(w.wind.from + 90), P = off(m.p, side, -400);
    Object.assign(b, { x: P.x, y: P.y, h: n360(w.wind.from + 90), v: 2.5, ww: { from: w.wind.from, kt: w.wind.kt } });
    b.cur = { x: 0, y: 0 };
    const still = properTwa(w, b);
    b.cur = { x: -wv.x * 1.2, y: -wv.y * 1.2 }; // 2.3 kt setting her to leeward
    const tide = properTwa(w, b);
    expect(tide).not.toBeNull();
    expect(tide!).toBeLessThan(still! - 10); // she must point higher to make good the line
    b.cur = { x: -wv.x * 4, y: -wv.y * 4 }; // nearly 8 kt across her track: no heading makes good the line
    expect(properTwa(w, b)).toBeNull(); // undetermined: neither above nor below it
  });
});
