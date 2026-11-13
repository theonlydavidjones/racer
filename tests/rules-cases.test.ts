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

/** The first look at a diagram: the boats must start apart (an opening contact would start the 6 s incident cooldown and hide
 * the contact the Case is about). */
const clean = (p: ReturnType<typeof pair>, t: number) => { const r = p.at(t); expect(r.foul, 'the diagram starts with the boats in contact').toBeNull(); return r; };
/** The fleet and who keeps clear of whom, for a boat as an obstruction (as the World supplies them). */
const fleetCtx = (boats: RulesBoat[], t = 50): Partial<RulesContext> => ({ fleet: boats, keepsClearOf: (a, c) => rightOfWay(a, c, ctx(t)).kc.id === a.id });

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
    // (A's bow 0.7 m short of B's transom: B still clear ahead, the hulls within contact distance)
    moveTo(B, off([0, 0], 120, -6, -2)); moveTo(A, off([0, 0], 120, -14.34, -2));
    expect(p.at(104).foul).toMatchObject({ by: 'A', rule: '18.2(a)' });
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
    // A dead run (180°: port tack in these diagrams), mark left to port. E, 20 m from the mark, is in the zone; D is 12 m ahead but 31 m out.
    const M = mark('p', false);
    const E = boat('E', { at: [-5, 20], heading: 180 }), D = boat('D', { at: [-30, 8], heading: 180 });
    const p = pair(D, E, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' });
    moveTo(D, [-12, -2], 120); moveTo(E, [-5, 4], 150); // D turns to round outside, E overlapped inside her
    expect(p.at(104)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' });
  });

  it.fails('Case 2, with the gybes: the boat entitled to mark-room under 18.2(a) gybes in the zone: 18.2(a) still applies (18.2(b) ends it only when she passes head to wind or leaves the zone)', () => {
    // A dead run to a mark left to port: E in the zone, D clear ahead and outside it, as in Case 59. E gybes onto starboard.
    const M = mark('p', false);
    const E = boat('E', { at: [-5, 20], heading: 180 }), D = boat('D', { at: [-30, 8], heading: 180 });
    const p = pair(D, E, [M]);
    p.at(100); // (D owes E mark-room, 18.2(a))
    E.lastTackT = 100.5; moveTo(E, [-5, 18], 190); // E gybes (a change of tack downwind, not head to wind)
    expect(p.at(101)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' }); // (the engine: 18.2(a) ended by the gybe: finding 3)
  });

  it('Case 81: entitled to mark-room as the boat clear ahead, she tacks to round and the boat astern hits her: hers is the foul (13); her mark-room ended when she passed head to wind', () => {
    // Starboard, close-hauled (315°), mark left to starboard. A clear ahead, in the zone; B astern and outside it.
    const M = mark('s', true);
    const A = boat('A', { at: [12, -12], heading: 315 }), B = boat('B', { at: [21, -17], heading: 315 });
    const p = pair(A, B, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'B', rule: '18.2(a)' });
    A.tacking = true; A.lastTackT = 101; moveTo(A, [12, -12], 20); A.tack = 'P'; // A tacks where she is
    moveTo(B, off([21, -17], 315, 5.5)); // and B, sailing on at a Folkboat's speed (2.75 m/s), runs into her
    expect(p.at(102).foul).toMatchObject({ by: 'A', rule: '13' });
  });

  // Windward mark left to port. W tacks from port to starboard in the zone, above the layline; L on starboard, fetching,
  // directly astern of her. L bears away to overlap to leeward and luffs straight into W.
  const case93 = () => {
    const M = mark('p', true);
    const W = boat('W', { at: [6.9, -0.9], heading: 45 }), L = boat('L', { at: [14, -8], heading: 315 });
    const p = pair(W, L, [M]);
    const before = p.at(44);
    W.lastTackT = 45.5; moveTo(W, [6.9, -0.9], 315); // W has tacked onto starboard in the zone
    const tacked = p.at(46);
    moveTo(L, off([6.9, -0.9], 315, -2, -3), 315); // overlapped to leeward from clear astern
    p.at(48);
    moveTo(L, off([6.9, -0.9], 315, -1.5, -1.6), 345, 315); // and luffs at once into W
    return { before, tacked, contact: p.at(48.5) };
  };
  it('Case 93 (the setup): W on port gives way, then has tacked in the zone with L clear astern of her', () => {
    const r = case93();
    expect(r.before).toMatchObject({ keepsClear: 'W', rule: '10' });
    expect(r.tacked).toMatchObject({ keepsClear: 'L', rule: '12' });
    expect(r.contact.foul).toMatchObject({ by: 'W', rule: '18.3' }); // what the engine says today: finding 1
  });
  it.fails('Case 93: after a boat tacks in the zone, one that gets a leeward overlap from clear astern and luffs at once into her breaks 15 and 16.1; the boat that tacked gave mark-room (18.3)', () => {
    expect(case93().contact.foul).toMatchObject({ by: 'L', rule: expect.stringMatching(/^(15|16\.1)$/) });
  });
});

describe('Rules 10–17 · Section A and B', () => {
  it('Case 6: starboard tacks after port has borne away to pass astern of her: past head to wind, starboard keeps clear (13)', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [4, -10], heading: 70 }); // P bearing away to duck
    const p = pair(S, P);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    S.tacking = true; S.lastTackT = 51; moveTo(S, [-0.5, 0.5], 10); S.tack = 'P'; // past head to wind
    expect(p.at(51.5)).toMatchObject({ keepsClear: 'S', rule: '13', foul: null });
  });

  it('Case 7: a boat overlapped to leeward from clear astern within two lengths, sailing no higher than her proper course: the windward boat that touches her broke 11', () => {
    const W = boat('W', { at: [0, 0], heading: 315 }), L = boat('L', { at: off([0, 0], 315, -12, -1), heading: 315 });
    const p = pair(W, L);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'L', rule: '12' });
    moveTo(L, off([0, 0], 315, -1, -6)); // overlapped to leeward, within two lengths
    expect(p.at(51)).toMatchObject({ keepsClear: 'W', rule: '11', foul: null });
    moveTo(W, off([0, 0], 315, 4, -3.5)); moveTo(L, off([0, 0], 315, 4, -5.6)); // W's boom touches L later (L not above her proper course)
    expect(p.at(60).foul).toMatchObject({ by: 'W', rule: '11' });
  });

  it('Case 13: before the start, a leeward boat with an overlap from astern may luff to close-hauled (no proper course, so no rule 17): the windward boat touched broke 11', () => {
    const W = boat('W', { at: [0, 0], heading: 280, started: false }), L = boat('L', { at: off([0, 0], 280, -12, -1), heading: 280, started: false });
    const p = pair(W, L);
    expect(clean(p, -40)).toMatchObject({ keepsClear: 'L', rule: '12' });
    moveTo(L, off([0, 0], 280, -1, -5)); p.at(-39); // leeward overlap from astern, within two lengths
    L.aboveProper = true; moveTo(L, off([0, 0], 280, 2, -4), 315, 315); // she has luffed to close-hauled
    moveTo(W, off([0, 0], 280, 2, -1.8)); // and W, slower, is touched
    expect(p.at(-30).foul).toMatchObject({ by: 'W', rule: '11' });
  });

  it('Case 43: port, close-hauled along a bank, meets a boat that has tacked onto starboard: port keeps clear (10); rule 19 doesn\'t apply on opposite tacks', () => {
    const bank = { obstacle: () => ({ d: 2, n: { x: -1, y: 0 }, continuing: true }) };
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [-7, -8], heading: 45 });
    const p = pair(S, P, [], bank);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    moveTo(P, [-2.5, -2.5]); // she sails on into S
    expect(p.at(52).foul).toMatchObject({ by: 'P', rule: '10' });
  });

  it('Case 92: on a beat, starboard keeps bearing away onto port, who is ducking her: starboard broke 16.2', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [-2, -10], heading: 60 });
    const p = pair(S, P);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    moveTo(S, [-1, -1], 265, 315); moveTo(P, [-2.5, -2.3], 80); // S bears away onto P as P bears away to pass astern
    expect(p.at(52).foul).toMatchObject({ by: 'S', rule: '16.2' });
  });

  // (partly covered: the part the engine models)
  it('Case 17 (partly): once she is on a close-hauled course (the physics sets `tacking` false), rule 13 is over however slow she is', () => {
    const A = boat('A', { at: [0, 0], heading: 315, speed: 0.1, lastTackT: 49.5 }), B = boat('B', { at: [8, -2], heading: 45 });
    expect(pair(A, B).at(50)).toMatchObject({ keepsClear: 'B', rule: '10' });
  });

  it('Case 24 (partly): contact the instant a boat from directly astern overlaps to leeward close to the other\'s stern is hers (15)', () => {
    const A = boat('A', { at: [0, 0], heading: 240 }), B = boat('B', { at: off([0, 0], 240, -10.5, 0), heading: 240 });
    const p = pair(A, B);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'B', rule: '12' });
    moveTo(B, off([0, 0], 240, -6.5, -2)); // overlapped to leeward, close to A's stern
    expect(p.at(51).foul).toMatchObject({ by: 'B', rule: '15' });
  });

  it('Case 87 (partly): a port-tack boat that makes no attempt to keep clear and strikes a starboard-tack boat amidships broke 10', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [-8, -8], heading: 45 });
    const p = pair(S, P);
    clean(p, 29);
    moveTo(P, [-2.8, -2.8]); // her bow into S's side
    expect(p.at(30).foul).toMatchObject({ by: 'P', rule: '10' });
  });

  const case27 = () => {
    // AS, clear ahead and a length to leeward of BP, both on port, tacks; BP, fast, runs into her while she is still turning.
    const AS = boat('AS', { at: [0, 0], heading: 45 }), BP = boat('BP', { at: off([0, 0], 45, -12, -7.6), heading: 45 });
    const p = pair(AS, BP);
    const before = clean(p, 50);
    AS.tacking = true; AS.lastTackT = 50.5; moveTo(AS, [0.3, 0.3], 350); AS.tack = 'S';
    moveTo(BP, [-2.6, -2.2]); // BP's bow into AS
    return { before, contact: p.at(51) };
  };
  it('Case 27: a boat that tacks close ahead of another on the same tack breaks 13 (and 15) when they collide; BP got right of way by AS\'s own action, so no rule 15 for BP', () => {
    expect(case27().contact.foul).toMatchObject({ by: 'AS', rule: expect.stringMatching(/^(13|15)$/) });
  });

  it('Case 27: once AS is close-hauled on starboard, having got right of way by her own tack, rule 15 binds her: BP hitting her then is AS\'s (15)', () => {
    const AS = boat('AS', { at: [0, 0], heading: 45 }), BP = boat('BP', { at: off([0, 0], 45, -12, -7.6), heading: 45 });
    const p = pair(AS, BP);
    clean(p, 50);
    AS.tacking = true; AS.lastTackT = 50.5; moveTo(AS, [0.3, 0.3], 350); AS.tack = 'S';
    moveTo(BP, off([0, 0], 45, -9, -7.6));
    expect(p.at(51)).toMatchObject({ keepsClear: 'AS', rule: '13', foul: null });
    AS.tacking = false; moveTo(AS, off([0.3, 0.3], 315, 3), 315); // close-hauled, 3 s past head to wind
    moveTo(BP, off([0, 0], 45, -6, -7.6));
    expect(p.at(53.5)).toMatchObject({ keepsClear: 'BP', rule: '10', foul: null });
    moveTo(BP, off([AS.x, AS.y], 45, -4.6)); // and BP, unable to keep clear in the time, hits her
    expect(p.at(54).foul).toMatchObject({ by: 'AS', rule: '15' });
  });

  const case53 = (swerve: boolean) => {
    const W = boat('W', { at: [0, 0], heading: 300, speed: 0.2, started: false }), L = boat('L', { at: off([0, 0], 300, -12, -1), heading: 300, started: false });
    const p = pair(W, L);
    clean(p, -30);
    moveTo(L, off([0, 0], 300, -2, -4)); // overlapped to leeward from astern
    const overlap = p.at(-29);
    moveTo(L, off([0, 0], 300, -1, -5.5), 270); // L bears away at once, as rule 15 asks while W responds
    return { overlap, after: p.at(-28.5, { swerve }) };
  };
  it('Case 53: a near-stationary windward boat overlapped to leeward from astern gets time to respond (15); L bearing away to give it breaks no rule', () => {
    expect(case53(true).after.foul).toBeNull();
  });

  it.fails('Case 105: running on opposite tacks side by side, starboard luffs and port doesn\'t respond though she had room (she could gybe): port broke 10; starboard didn\'t break 16.1', () => {
    const S = boat('S', { at: [0, 0], heading: 185 }), P = boat('P', { at: [-6, 0], heading: 175 });
    const p = pair(S, P);
    clean(p, 50);
    moveTo(S, [-1.5, -3], 205, 185); moveTo(P, [-4.2, -3]); // S luffs 20° toward P; P holds her course
    expect(p.at(53).foul).toMatchObject({ by: 'P', rule: '10' }); // (the engine: S, 16.1: finding 2)
  });
});

describe('Rules 19–24 · obstructions, room to tack, Section D', () => {
  it('Case 11: two port boats overlapped meet a starboard boat both must keep clear of: she is an obstruction, and the leeward boat holding her course gives the windward boat no room to pass astern of her: she broke 19.2(b)', () => {
    const S = boat('S', { at: [4, 14], heading: 270 });
    const PW = boat('PW', { at: [8, 9], heading: 45 }), PL = boat('PL', { at: [12, 6], heading: 45 });
    const p = pair(PL, PW, [], fleetCtx([S, PW, PL]));
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'PW', rule: '11' });
    moveTo(PW, [10.2, 8.3], 70); moveTo(PL, [12.2, 6.2]); // PW bears away to pass astern of S; PL holds her course
    expect(p.at(51).foul).toMatchObject({ by: 'PL', rule: '19', part: '19.2(b)' });
  });

  it('Case 23: running, a starboard boat passes between two port boats: they keep clear of her (10), and rule 19 doesn\'t come into it', () => {
    // port tack at 170°: the windward boat is the one to the east
    const S = boat('S', { at: [0, 0], heading: 190 }), PW = boat('PW', { at: [4, -1], heading: 170 }), PL = boat('PL', { at: [-4, -1], heading: 170 });
    const p = pair(S, PW, [], fleetCtx([S, PW, PL]));
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'PW', rule: '10' });
    moveTo(PW, [1.6, -1]); // the courses converge
    expect(p.at(52).foul).toMatchObject({ by: 'PW', rule: '10' });
  });

  const case101 = () => {
    // A, clear ahead and to leeward of B, both on starboard approaching the shore, hails; B replies "You tack"; A tacks onto port.
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: off([0, 0], 315, -9, 6), heading: 315 });
    const p = pair(A, B);
    clean(p, 50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    A.lastTackT = 51; moveTo(A, [0.5, 0.5], 45); // she has tacked onto port (close-hauled)
    return p.at(52);
  };
  it('Case 101: once she has tacked and had the time to bear away round the other\'s stern, contact is the hailing boat\'s (10)', () => {
    const b0 = off([0, 0], 315, -9, 6);
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: b0, heading: 315 });
    const p = pair(A, B);
    clean(p, 50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    A.lastTackT = 51; moveTo(A, [0.5, 0.5], 45);
    p.at(52);
    const b1 = off(b0, 315, 10); moveTo(B, b1); // B holds her course
    moveTo(A, off(b1, 315, 4.5), 45); // and A, four seconds after her tack, sails across B's bow
    expect(p.at(55).foul).toMatchObject({ by: 'A', rule: '10' });
  });
  it('Case 101: the boat that replied, bearing away to give the room she owes, is no swerve foul by the hailing boat or by her', () => {
    const b0 = off([0, 0], 315, -9, 6);
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: b0, heading: 315 });
    const p = pair(A, B);
    clean(p, 50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    A.tacking = true; A.lastTackT = 51; moveTo(A, [0.3, 0.3], 30);
    expect(p.at(51.5, { swerve: true }).foul).toBeNull();
  });
  it('Case 101: a hailing boat that, given room, sails into the stern of the boat that replied and held her course broke 13, not B 20', () => {
    const b0 = off([0, 0], 315, -9, 6);
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: b0, heading: 315 });
    const p = pair(A, B);
    clean(p, 50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    p.at(50.6);
    const b1 = off(b0, 315, 3); moveTo(B, b1); // B holds her course and speed
    A.tacking = true; A.lastTackT = 51; moveTo(A, off(b1, 315, -4.6, -0.5), 20); // A tacks up into B's stern
    expect(p.at(52).foul).toMatchObject({ by: 'A', rule: '13' });
  });
  it('Case 101: right of way doesn\'t pass to the boat entitled to room: after "You tack" and her tack onto port, the hailing boat must keep clear of the boat on starboard (10)', () => {
    expect(case101()).toMatchObject({ keepsClear: 'A', rule: '10' });
  });

  // (partly covered)
  it('Case 113 (partly): hailed with a boat to windward stopping her tacking, the middle boat passes the hail on (20.3) and isn\'t late while that boat has still to respond', () => {
    const L = boat('L', { at: [0, 0], heading: 315 }), M = boat('M', { at: [2, 9], heading: 315 }), W = boat('W', { at: [4, 18], heading: 315 });
    const rec = newPairRecord();
    rec.hail = { by: L.id, at: 50, kind: 'room', passedOn: { to: W.id, at: 50.5 } };
    expect(hailBreach(rec, L, M, 57)).toBeNull();
  });

  it('Case 127 (partly): a boat that has finished is racing until she has cleared the finishing line and marks', () => {
    const b = boat('F', { at: [0, 0], heading: 0, finished: true });
    b.cleared = false; expect(notRacing(b)).toBe(false);
    b.cleared = true; expect(notRacing(b)).toBe(true);
  });

  it('Case 149 (partly): a boat taking her penalty keeps clear of a boat on her proper course (21.2), and breaking off her turns to do so is no breach', () => {
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: [6, -9], heading: 45, penalty: 500 });
    const p = pair(A, B);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'B', rule: '21.2' });
    moveTo(B, [6.5, -8], 0); // she luffs to keep clear
    expect(p.at(51).foul).toBeNull();
  });
});
