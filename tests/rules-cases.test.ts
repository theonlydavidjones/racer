// World Sailing Cases (The Case Book for 2025–2028, v2025-07) set up as diagrams and checked against the Case's answer.
// One `it` per Case, named by its number; docs/RULES-CASES.md has the coverage table and the findings. A Case the engine
// doesn't yet answer the same way is written as `it.fails`, with the Case's answer as the expectation: the test stays green
// while the finding stands, and fails (prompting it to be turned back into a plain `it`) once the engine is fixed.
// Source: https://media.sailing.org/sailing/wp-content/uploads/2025/07/31104846/WS-Case-Book-2025-2028-v2025-07.pdf
//
// The diagrams (tests/diagram.ts): wind from the top of the page (000°), x east, y north, metres; 315 = starboard
// close-hauled, 045 = port close-hauled, 180 = a dead run. A Folkboat is 7.64 m; the zone is 3 lengths (22.9 m).
import { describe, expect, it } from 'vitest';
import { V } from '../src/core/math';
import { hailBreach, newPairRecord, notRacing, rightOfWay, type RulesBoat, type RulesContext, type RulesMark } from '../src/rules';
import { boat, ctx, moveTo, pair } from './diagram';

const mark = (side: 's' | 'p', beat: boolean, at: [number, number] = [0, 0]): RulesMark => ({ name: 'M', p: { x: at[0], y: at[1] }, type: 'round', side, beat });
/** A point `along` metres ahead of p on heading h and `across` metres to her starboard. */
const off = (p: [number, number], h: number, along: number, across = 0): [number, number] => {
  const u = V(h), s = V(h + 90);
  return [p[0] + u.x * along + s.x * across, p[1] + u.y * along + s.y * across];
};

describe('Rule 18 · mark-room', () => {
  it('Case 2: the boat clear astern reaches the zone first, while the boat clear ahead is outside it: the one ahead owes her mark-room, and hitting her transom is her foul', () => {
    // A and B on port, reaching (120°) to a mark left to starboard. B is 21 m from the mark (in the zone); A is 10 m ahead
    // along the course but wide of it, 34 m from the mark (4.5 lengths).
    const M = mark('s', false);
    const B = boat('B', { at: off([0, 0], 120, -20, -5), heading: 120 }), A = boat('A', { at: off([0, 0], 120, -10, -33), heading: 120 });
    const p = pair(A, B, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'A', rule: '18.2(a)' }); // A owes B mark-room (18.2(a)(2))
    // later A, sailing faster, runs into B's transom
    moveTo(B, off([0, 0], 120, -6, -2)); moveTo(A, off([0, 0], 120, -12.5, -2));
    expect(p.at(104).foul).toMatchObject({ by: 'A' });
  });

  it('Case 9: on a beat, boats on opposite tacks at a windward mark: rule 18 doesn\'t apply; port keeps clear (rule 10)', () => {
    const M = mark('s', true);
    const S = boat('S', { at: [10, -12], heading: 315 }), P = boat('P', { at: [-10, -14], heading: 45 });
    expect(pair(S, P, [M]).at(100)).toMatchObject({ keepsClear: 'P', rule: '10' });
  });

  it('Case 12: overlapped when the first reaches the zone, on courses 90° apart: the outside boat owes mark-room, and contact is hers', () => {
    // Starboard tack, mark left to starboard. OL close-hauled (315°), IW nearly running (225°), IW nearer the mark.
    const M = mark('s', false);
    const OL = boat('OL', { at: [18, -14], heading: 315 }), IW = boat('IW', { at: [12, 6], heading: 225 });
    const p = pair(OL, IW, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'OL', rule: '18.2(a)' });
    moveTo(OL, [9, -4]); moveTo(IW, [7, -1.5]);
    expect(p.at(103).foul).toMatchObject({ by: 'OL', rule: '18.2(a)' });
  });

  it('Case 15: clear ahead at the zone, upwind, the boat astern keeps clear and gives mark-room; once the boat ahead passes head to wind, rule 18 ends and she must keep clear while tacking (13)', () => {
    // Port tack, close-hauled (045°), windward mark left to port. A is in the zone, clear ahead; B astern, outside it.
    const M = mark('p', true);
    const A = boat('A', { at: off([0, 0], 45, -14, 3), heading: 45 }), B = boat('B', { at: off([0, 0], 45, -26, 3), heading: 45 });
    const p = pair(A, B, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'B', rule: '18.2(a)' });
    A.tacking = true; A.lastTackT = 100.5; moveTo(A, [A.x, A.y], 350); A.tack = 'S'; // past head to wind
    expect(p.at(101)).toMatchObject({ keepsClear: 'A', rule: '13' });
  });

  it('Case 59: a boat clear ahead but outside the zone when the boat astern reaches it owes that boat mark-room, even after she becomes overlapped inside', () => {
    // A dead run (180°, starboard), mark left to port. E, 20 m from the mark, is in the zone; D is 12 m ahead but 31 m out.
    const M = mark('p', false);
    const E = boat('E', { at: [-5, 20], heading: 180 }), D = boat('D', { at: [-30, 8], heading: 180 });
    const p = pair(D, E, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' });
    moveTo(D, [-12, -2], 120); moveTo(E, [-5, 4], 150); // D turns to round outside, E overlapped inside her
    expect(p.at(104)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' });
  });

  it('Case 81: entitled to mark-room as the boat clear ahead, she tacks to round and the boat astern hits her: hers is the foul (13); her mark-room ended when she passed head to wind', () => {
    // Starboard, close-hauled (315°), mark left to starboard. A clear ahead, in the zone; B astern and outside it.
    const M = mark('s', true);
    const A = boat('A', { at: [12, -12], heading: 315 }), B = boat('B', { at: [21, -17], heading: 315 });
    const p = pair(A, B, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'B', rule: '18.2(a)' });
    A.tacking = true; A.lastTackT = 101; moveTo(A, [13.5, -15], 20); A.tack = 'P';
    moveTo(B, [15, -11.5]);
    expect(p.at(102).foul).toMatchObject({ by: 'A', rule: '13' });
  });

  it.fails('Case 93: after a boat tacks in the zone, one that gets a leeward overlap from clear astern and luffs at once into her breaks 15 and 16.1; the boat that tacked gave mark-room (18.3)', () => {
    // Windward mark left to port. W tacks from port to starboard in the zone, above the layline; L on starboard, fetching,
    // directly astern of her. L bears away to overlap to leeward and luffs straight into W.
    const M = mark('p', true);
    const W = boat('W', { at: [6.9, -0.9], heading: 45 }), L = boat('L', { at: [14, -8], heading: 315 });
    const p = pair(W, L, [M]);
    p.at(44);
    W.lastTackT = 45.5; moveTo(W, [6.9, -0.9], 315); // W has tacked onto starboard in the zone
    expect(p.at(46)).toMatchObject({ keepsClear: 'L', rule: '12' });
    moveTo(L, off([6.9, -0.9], 315, -2, -3), 315); // overlapped to leeward from clear astern
    p.at(48);
    moveTo(L, off([6.9, -0.9], 315, -1.5, -1.6), 345, 315); // and luffs at once into W
    expect(p.at(48.5).foul).toMatchObject({ by: 'L' }); // (the engine: W, under 18.3: see docs/RULES-CASES.md, Findings)
  });
});

describe('Rules 10–17 · Section A and B', () => {
  it('Case 6: starboard tacks after port has borne away to pass astern of her: no breach; past head to wind, starboard keeps clear (13)', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [4, -10], heading: 70 }); // P bearing away to duck
    const p = pair(S, P);
    expect(p.at(50)).toMatchObject({ keepsClear: 'P', rule: '10', foul: null });
    S.tacking = true; S.lastTackT = 51; moveTo(S, [-0.5, 0.5], 10); S.tack = 'P'; // past head to wind
    expect(p.at(51.5)).toMatchObject({ keepsClear: 'S', rule: '13', foul: null });
  });

  it('Case 7: a boat overlapped to leeward from clear astern within two lengths, sailing no higher than her proper course: the windward boat that touches her broke 11', () => {
    const W = boat('W', { at: [0, 0], heading: 315 }), L = boat('L', { at: off([0, 0], 315, -9, -1), heading: 315 });
    const p = pair(W, L);
    expect(p.at(50)).toMatchObject({ keepsClear: 'L', rule: '12' });
    moveTo(L, off([0, 0], 315, -1, -6)); // overlapped to leeward, within two lengths
    p.at(51);
    moveTo(W, off([0, 0], 315, 4, -3.5)); moveTo(L, off([0, 0], 315, 4, -5.6)); // W's boom touches L later (L not above her proper course)
    expect(p.at(60).foul).toMatchObject({ by: 'W', rule: '11' });
  });

  it('Case 13: before the start, a leeward boat with an overlap from astern may luff to close-hauled (no proper course, so no rule 17): the windward boat touched broke 11', () => {
    const W = boat('W', { at: [0, 0], heading: 280, started: false }), L = boat('L', { at: off([0, 0], 280, -9, -1), heading: 280, started: false });
    const p = pair(W, L);
    expect(p.at(-40)).toMatchObject({ keepsClear: 'L', rule: '12' });
    moveTo(L, off([0, 0], 280, -1, -5)); p.at(-39); // leeward overlap from astern, within two lengths
    L.aboveProper = true; moveTo(L, off([0, 0], 280, 2, -4), 315, 315); // she has luffed to close-hauled
    moveTo(W, off([0, 0], 280, 2, -1.8)); // and W, slower, is touched
    expect(p.at(-30).foul).toMatchObject({ by: 'W', rule: '11' });
  });

  it('Case 17: rule 13 ends when she is on a close-hauled course, however slow she is', () => {
    const A = boat('A', { at: [0, 0], heading: 315, speed: 0.1, lastTackT: 49.5 }), B = boat('B', { at: [8, -2], heading: 45 });
    expect(pair(A, B).at(50)).toMatchObject({ keepsClear: 'B', rule: '10' }); // A, close-hauled and not tacking, has starboard's right of way
  });

  it('Case 24: overlapped to leeward from directly astern, close to the other boat\'s stern: contact before the windward boat can respond is the leeward boat\'s (15)', () => {
    const A = boat('A', { at: [0, 0], heading: 240 }), B = boat('B', { at: off([0, 0], 240, -10.5, 0), heading: 240 });
    const p = pair(A, B);
    expect(p.at(50)).toMatchObject({ keepsClear: 'B', rule: '12' });
    moveTo(B, off([0, 0], 240, -6.5, -2)); // overlapped to leeward, close to A's stern
    expect(p.at(51).foul).toMatchObject({ by: 'B', rule: '15' });
  });

  it('Case 27: a boat that tacks close ahead of another on the same tack breaks 13 when they collide', () => {
    const AS = boat('AS', { at: [0, 0], heading: 45 }), BP = boat('BP', { at: off([0, 0], 45, -7.6, -7.6), heading: 45 });
    const p = pair(AS, BP);
    p.at(50);
    AS.tacking = true; AS.lastTackT = 50.5; moveTo(AS, [0.5, 0.5], 350); AS.tack = 'S'; // tacks, still turning
    moveTo(BP, off([0, 0], 45, -2.5, -1.5)); // BP, fast, runs into her
    expect(p.at(51).foul).toMatchObject({ by: 'AS', rule: '13' });
  });

  it('Case 43: port, sailing close along a bank, meets a boat that has tacked onto starboard: port keeps clear (10); rule 19 doesn\'t apply on opposite tacks', () => {
    const bank = { obstacle: () => ({ d: 2, n: { x: -1, y: 0 }, continuing: true }) };
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [4, -8], heading: 15 });
    const p = pair(S, P, [], bank);
    expect(p.at(50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    moveTo(P, [0.8, -2]);
    expect(p.at(52).foul).toMatchObject({ by: 'P', rule: '10' });
  });

  it('Case 53: overlapped to leeward from astern by a boat that had been clear astern, a near-stationary windward boat gets time to respond (15): no breach while she does', () => {
    const W = boat('W', { at: [0, 0], heading: 300, speed: 0.2, started: false }), L = boat('L', { at: off([0, 0], 300, -9, -1), heading: 300, started: false });
    const p = pair(W, L);
    p.at(-30);
    moveTo(L, off([0, 0], 300, -2, -4)); // overlapped to leeward from astern
    expect(p.at(-29)).toMatchObject({ keepsClear: 'W', rule: '11', foul: null });
    expect(p.rec.by).toBe(L.id); // rule 15: L just acquired right of way, so W gets time
    moveTo(W, off([0, 0], 300, 1, 2), 330); // W trims and heads up, clear
    expect(p.at(-27).foul).toBeNull();
  });

  it('Case 87: a port-tack boat that makes no attempt to keep clear and hits a starboard-tack boat broke 10', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [3, -3.5], heading: 45 });
    expect(pair(S, P).at(30).foul).toMatchObject({ by: 'P', rule: '10' });
  });

  it('Case 92: on a beat, starboard keeps bearing away onto port, who is ducking her: starboard broke 16.2', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [-2, -10], heading: 60 });
    const p = pair(S, P);
    expect(p.at(50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    moveTo(S, [-1, -1], 265, 315); moveTo(P, [-2.5, -2.3], 80); // S bears away onto P as P bears away to pass astern
    expect(p.at(52).foul).toMatchObject({ by: 'S', rule: '16.2' });
  });

  it.fails('Case 105: running on opposite tacks after a long time side by side, starboard luffs and port doesn\'t respond though she had room (she could gybe): port broke 10; starboard didn\'t break 16.1', () => {
    const S = boat('S', { at: [0, 0], heading: 190 }), P = boat('P', { at: [-7, 1], heading: 170 });
    const p = pair(S, P);
    expect(p.at(50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    moveTo(S, [-2, -2], 230, 190); moveTo(P, [-4, -2.5]); // S luffs; P holds her course
    expect(p.at(53).foul).toMatchObject({ by: 'P', rule: '10' }); // (the engine: S, 16.1: see docs/RULES-CASES.md, Findings)
  });

  it('Case 147: starboard luffs onto a port boat that can\'t then keep clear: starboard owed her room (16.1)', () => {
    const S = boat('S', { at: [0, 0], heading: 300 }), PB = boat('PB', { at: [-6, 4], heading: 45 });
    const p = pair(S, PB);
    p.at(50);
    moveTo(S, [-2, 1.5], 330, 300); moveTo(PB, [-3.5, 3.5]); // S luffs onto PB, too close for PB to respond
    expect(p.at(51).foul).toMatchObject({ by: 'S', rule: '16.1' });
  });
});

/** The fleet and who keeps clear of whom, for a boat as an obstruction (as the World supplies them). */
const fleetCtx = (boats: RulesBoat[], t = 50): Partial<RulesContext> => ({ fleet: boats, keepsClearOf: (a, c) => rightOfWay(a, c, ctx(t)).kc.id === a.id });

describe('Rules 19–24 · obstructions, room to tack, Section D', () => {
  it('Case 11: two port boats overlapped, meeting a starboard boat both must keep clear of: she is an obstruction, and the outside boat must give the inside boat room to pass astern of her (19.2(b))', () => {
    const S = boat('S', { at: [4, 14], heading: 270 });
    const PW = boat('PW', { at: [8, 9], heading: 45 }), PL = boat('PL', { at: [12, 6], heading: 45 });
    const p = pair(PL, PW, [], fleetCtx([S, PW, PL]));
    expect(p.at(50)).toMatchObject({ keepsClear: 'PW', rule: '11' });
    moveTo(PL, [10.3, 7.2], 20, 45); // PL luffs into PW, toward S's stern, instead of giving her room
    expect(p.at(51).foul).toMatchObject({ by: 'PL', rule: '19', part: '19.2(b)' });
  });

  it('Case 23: running, a starboard boat passes between two port boats: they keep clear of her (10), and rule 19 doesn\'t come into it', () => {
    const S = boat('S', { at: [0, 0], heading: 190 }), PW = boat('PW', { at: [-4, -1], heading: 170 }), PL = boat('PL', { at: [4, -1], heading: 170 });
    const p = pair(S, PW, [], fleetCtx([S, PW, PL]));
    expect(p.at(50)).toMatchObject({ keepsClear: 'PW', rule: '10' });
    moveTo(PW, [-1.6, -1]); // the courses converge
    expect(p.at(52).foul).toMatchObject({ by: 'PW', rule: '10' });
  });

  it('Case 29: a boat sails into the gap between two boats overlapped on a run: the leeward boat is an obstruction, not a continuing one; with room given, no breach', () => {
    const L = boat('L', { at: [0, 0], heading: 200 }), W = boat('W', { at: [-14, 3], heading: 200 }), M = boat('M', { at: [-7, 4], heading: 200 });
    const p = pair(W, M, [], fleetCtx([L, W, M]));
    expect(p.at(50)).toMatchObject({ keepsClear: 'W', foul: null }); // M, in the gap, is to leeward of W
    expect(p.at(55).foul).toBeNull();
  });

  it('Case 35: after "You tack", the hailing boat tacks and passes clear astern of the boat that replied: she complied with 20.2(c), no breach', () => {
    const L = boat('L', { at: [0, 0], heading: 315 }), W = boat('W', { at: [-6, 13], heading: 315 });
    const p = pair(L, W);
    p.at(50);
    p.rec.hail = { by: L.id, at: 50, kind: 'room', replyAt: 50.5 };
    L.lastTackT = 51; moveTo(L, [2, 2], 45); // L tacks
    expect(p.at(53).foul).toBeNull();
    moveTo(L, [4, 9], 45); // and passes astern of W, a metre or more clear
    expect(p.at(57).foul).toBeNull();
  });

  it('Case 101: after "You tack" and her tack, the hailing boat on port must keep clear of the boat on starboard (10)', () => {
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: [-6, 13], heading: 315 });
    const p = pair(A, B);
    p.at(50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    A.lastTackT = 51; moveTo(A, [6, 4], 45);
    p.at(58); // she has tacked and got going: the "You tack" room is spent
    expect(p.at(59)).toMatchObject({ keepsClear: 'A', rule: '10' });
  });

  it('Case 113: hailed with a boat to windward stopping her tacking, the middle boat passes the hail on (20.3) and isn\'t late while that boat has still to respond', () => {
    const L = boat('L', { at: [0, 0], heading: 315 }), M = boat('M', { at: [2, 9], heading: 315 });
    const rec = newPairRecord();
    rec.hail = { by: L.id, at: 50, kind: 'room', passedOn: { to: 999, at: 50.5 } };
    expect(hailBreach(rec, L, M, 57)).toBeNull();
  });

  it('Case 127: a boat that has finished is racing until she has cleared the finishing line and marks', () => {
    const b = boat('F', { at: [0, 0], heading: 0, finished: true });
    b.cleared = false; expect(notRacing(b)).toBe(false);
    b.cleared = true; expect(notRacing(b)).toBe(true);
  });

  it('Case 149: a boat breaking off her penalty turns to keep clear of a boat on her proper course: she keeps clear (21.2); the other boat breaks 23.2 only if off her proper course', () => {
    for (const above of [false, true]) {
      const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: [3, -3.5], heading: 45, penalty: 500 });
      A.aboveProper = above;
      const r = pair(A, B).at(50).foul;
      expect(r, `A above her proper course: ${above}`).toMatchObject(above ? { by: 'A', rule: '23', part: '23.2' } : { by: 'B', rule: '21.2' });
    }
  });
});
