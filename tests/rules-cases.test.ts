// World Sailing Cases (The Case Book for 2025–2028, v2025-07) set up as diagrams and checked against the Case's answer.
// One `it` per Case, named by its number (the Cases kept as data for the Rules trainer, src/rules/cases.ts, are sailed
// in tests/rules-cases-data.test.ts instead); docs/RULES-CASES.md has the coverage table and the findings. A Case the engine
// doesn't yet answer the same way is written as `it.fails`, with the Case's answer as the expectation: the test stays green
// while the finding stands, and fails (prompting it to be turned back into a plain `it`) once the engine is fixed.
// Source: https://media.sailing.org/sailing/wp-content/uploads/2025/07/31104846/WS-Case-Book-2025-2028-v2025-07.pdf
//
// The diagrams (tests/diagram.ts): wind from the top of the page (000°), x east, y north, metres; 315 = starboard
// close-hauled, 045 = port close-hauled, 180 = a dead run. A Folkboat is 7.64 m; the zone is 3 lengths (22.9 m).
import { describe, expect, it } from 'vitest';
import { V } from '../src/core/math';
import { duckingAstern } from '../src/rules/pairs';
import { hailBreach, newPairRecord, notRacing, rightOfWay, type RulesBoat, type RulesContext, type RulesMark } from '../src/rules';
import { boat, ctx, moveTo, pair } from './diagram';

/** The first look at a diagram: the boats must start apart (an opening contact would start the 6 s incident cooldown and hide
 * the contact the Case is about). */
const clean = (p: ReturnType<typeof pair>, t: number) => { const r = p.at(t); expect(r.foul, 'the diagram starts with the boats in contact').toBeNull(); return r; };
/** The fleet and who keeps clear of whom, for a boat as an obstruction (as the World supplies them). */
const fleetCtx = (boats: RulesBoat[], t = 50): Partial<RulesContext> => ({ fleet: boats, keepsClearOf: (a, c) => rightOfWay(a, c, ctx(t)).kc.id === a.id });

// (sailed through in 0.1 s steps, as the World looks at a pair: each boat's heading as a function of time)
const sailOn = (p: ReturnType<typeof pair>, boats: [ReturnType<typeof boat>, (t: number) => number, number][], t0: number, t1: number, extra?: (b: ReturnType<typeof boat>, t: number) => void) => {
  for (let t = t0; t <= t1 + 1e-9; t += 0.1) {
    for (const [b, hOf, v] of boats) {
      const h = hOf(t), u = V(h);
      b.h = h; b.headingAgo = hOf(t - 3); b.v = v; b.vx = u.x * v; b.vy = u.y * v; b.x += u.x * v * 0.1; b.y += u.y * v * 0.1;
      extra?.(b, t);
    }
    const r = p.at(t);
    if (r.foul) return r.foul;
  }
  return null;
};

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
    // (A's bow 0.1 m short of B's transom: B still clear ahead, the hulls touching)
    moveTo(B, off([0, 0], 120, -6, -2)); moveTo(A, off([0, 0], 120, -13.74, -2));
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

  it('Case 59: a boat clear ahead but outside the zone when the boat astern reaches it owes that boat mark-room, even after she becomes overlapped inside', () => {
    // A dead run (180°: port tack in these diagrams), mark left to port. E, 20 m from the mark, is in the zone; D is 12 m ahead but 31 m out.
    const M = mark('p', false);
    const E = boat('E', { at: [-5, 20], heading: 180 }), D = boat('D', { at: [-30, 8], heading: 180 });
    const p = pair(D, E, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' });
    moveTo(D, [-12, -2], 120); moveTo(E, [-5, 4], 150); // D turns to round outside, E overlapped inside her
    expect(p.at(104)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' });
  });

  it('Case 2, with the gybes: the boat entitled to mark-room under 18.2(a) gybes in the zone: 18.2(a) still applies (18.2(b) ends it only when she passes head to wind or leaves the zone)', () => {
    // A dead run to a mark left to port: E in the zone, D clear ahead and outside it, as in Case 59. E gybes onto starboard.
    const M = mark('p', false);
    const E = boat('E', { at: [-5, 20], heading: 180 }), D = boat('D', { at: [-30, 8], heading: 180 });
    const p = pair(D, E, [M]);
    p.at(100); // (D owes E mark-room, 18.2(a))
    E.lastTackT = 100.5; moveTo(E, [-5, 18], 190); // E gybes (a change of tack downwind, not head to wind)
    expect(p.at(101)).toMatchObject({ keepsClear: 'D', rule: '18.2(a)' }); // (a gybe passes the wind astern, not head to wind: 18.2(a) holds)
  });

  it('Case 81: entitled to mark-room as the boat clear ahead, she tacks to round and the boat astern hits her: hers is the foul (13); her mark-room ended when she passed head to wind', () => {
    // Starboard, close-hauled (315°), mark left to starboard. A clear ahead, in the zone; B astern and outside it.
    const M = mark('s', true);
    const A = boat('A', { at: [12, -12], heading: 315 }), B = boat('B', { at: [20, -16], heading: 315 });
    const p = pair(A, B, [M]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'B', rule: '18.2(a)' });
    A.tacking = true; A.lastTackT = 101; A.headToWindT = 101; moveTo(A, [12, -12], 20); A.tack = 'P'; // A tacks where she is
    moveTo(B, off([20, -16], 315, 5.5)); // and B, sailing on at a Folkboat's speed (2.75 m/s), runs into her
    expect(p.at(102).foul).toMatchObject({ by: 'A', rule: '13' });
  });

  // Windward mark left to port. W tacks from port to starboard in the zone, above the layline; L on starboard, fetching,
  // directly astern of her. L bears away to overlap to leeward and luffs straight into W.
  const case93 = () => {
    const M = mark('p', true);
    const W = boat('W', { at: [6.9, -0.9], heading: 45 }), L = boat('L', { at: [14, -8], heading: 315 });
    const p = pair(W, L, [M]);
    const before = p.at(44);
    W.lastTackT = 45.5; W.headToWindT = 45.5; moveTo(W, [6.9, -0.9], 315); // W has tacked onto starboard in the zone
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
  });
  it('Case 93: after a boat tacks in the zone, one that gets a leeward overlap from clear astern and luffs at once into her breaks 15 and 16.1; the boat that tacked gave mark-room (18.3)', () => {
    expect(case93().contact.foul).toMatchObject({ by: 'L', rule: expect.stringMatching(/^(15|16\.1)$/) });
  });
});

describe('Rule 18.3 · the boat that tacked, with the fetching boat inside her', () => {
  it('Case 95: Jagga tacks in the zone to windward of Freebird, fetching on starboard, then luffs so her swinging stern makes Freebird swerve: Jagga broke 11 (and 18.3(b))', () => {
    const M = mark('p', true), fb: [number, number] = [14, -12];
    const F = boat('Freebird', { at: fb, heading: 315 }), J = boat('Jagga', { at: off(fb, 315, 2, 8), heading: 45 });
    const p = pair(J, F, [M]);
    clean(p, 100); // Jagga on port, coming in, crossing ahead of her
    J.tacking = true; J.lastTackT = J.headToWindT = 100.8; J.tack = 'S'; moveTo(J, off(fb, 315, 1.5, 6), 0);
    p.at(101);
    J.tacking = false; moveTo(J, off(fb, 315, 1.5, 4), 315); // tacked: overlapped to windward of Freebird
    expect(p.at(102)).toMatchObject({ keepsClear: 'Jagga', rule: '11', foul: null }); // (Freebird inside: no '18.3' right of way, rule 11)
    expect(p.rec.r183).toMatchObject({ tacker: J.id, binds: true });
    moveTo(J, off(fb, 315, 2, 3.6), 335, 315); // Jagga luffs; her stern swings down at Freebird
    expect(p.at(103, { swerve: true }).foul).toMatchObject({ by: 'Jagga', rule: '11', kind: 'swerve' });
  });

  it('18.3(b): L gets the inside overlap from clear astern and holds her course to the mark; contact in her rule 15 time is W\'s (11): L, within her mark-room, is exonerated for 15 (43.1(b))', () => {
    const M = mark('p', true);
    const W = boat('W', { at: [6.9, -0.9], heading: 45 }), L = boat('L', { at: [14, -8], heading: 315 });
    const p = pair(W, L, [M]);
    p.at(44);
    W.lastTackT = 45.5; W.headToWindT = 45.5; moveTo(W, [6.9, -0.9], 315);
    p.at(46);
    moveTo(L, off([6.9, -0.9], 315, -2, -3), 315); // overlapped to leeward from clear astern, holding her course
    p.at(48);
    expect(p.rec.r183).toMatchObject({ tacker: W.id, binds: true });
    moveTo(L, off([6.9, -0.9], 315, -1.6, -1.8), 315, 315); // still on her course; the gap closes
    expect(p.at(48.5).foul).toMatchObject({ by: 'W', rule: '11' });
  });

  it('Case 93 (the other half): L, overlapped inside, holds her course; W sags down onto her: W broke 11 (she still owes room, 18.3(b))', () => {
    const M = mark('p', true);
    const W = boat('W', { at: [6.9, -0.9], heading: 45 }), L = boat('L', { at: [14, -8], heading: 315 });
    const p = pair(W, L, [M]);
    p.at(44);
    W.lastTackT = 45.5; W.headToWindT = 45.5; moveTo(W, [6.9, -0.9], 315);
    p.at(46);
    moveTo(L, off([6.9, -0.9], 315, -2, -3), 315);
    p.at(48);
    expect(p.at(52)).toMatchObject({ keepsClear: 'W', rule: '11', foul: null }); // past L's rule 15 time
    expect(p.rec.r183).not.toBeNull();
    moveTo(W, off([6.9, -0.9], 315, 1, -1.8), 300, 315); moveTo(L, off([6.9, -0.9], 315, 1, -3.2)); // W bears away onto L
    expect(p.at(53).foul).toMatchObject({ by: 'W', rule: '11' });
  });
});

describe('Rules 10–17 · Section A and B', () => {
  it('Case 6: starboard tacks after port has borne away to pass astern of her: past head to wind, starboard keeps clear (13)', () => {
    const S = boat('S', { at: [0, 0], heading: 315 }), P = boat('P', { at: [4, -10], heading: 70 }); // P bearing away to duck
    const p = pair(S, P);
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'P', rule: '10' });
    S.tacking = true; S.lastTackT = 51; S.headToWindT = 51; moveTo(S, [-0.5, 0.5], 10); S.tack = 'P'; // past head to wind
    expect(p.at(51.5)).toMatchObject({ keepsClear: 'S', rule: '13', foul: null });
  });

  it('Case 14 (the counterpart): the same luff above her proper course is L\'s (17)', () => {
    const W = boat('W', { at: [0, 0], heading: 200 }), L = boat('L', { at: off([0, 0], 200, -12, -6), heading: 200 });
    const p = pair(W, L);
    clean(p, 40); moveTo(L, off([0, 0], 200, -1, -6)); p.at(41);
    L.aboveProper = true;
    expect(sailOn(p, [[L, t => 200 + Math.min(40, Math.max(0, (t - 50) * 4)), 2.5], [W, () => 200, 2.5]], 45, 80)).toMatchObject({ by: 'L', rule: '17' });
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
    moveTo(B, off([0, 0], 240, -6.5, -1.2)); // overlapped to leeward, her bow against A's stern quarter
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
    AS.tacking = true; AS.lastTackT = 50.5; AS.headToWindT = 50.5; moveTo(AS, [0.3, 0.3], 350); AS.tack = 'S';
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
    AS.tacking = true; AS.lastTackT = 50.5; AS.headToWindT = 50.5; moveTo(AS, [0.3, 0.3], 350); AS.tack = 'S';
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

  const case105 = (luffRate: number, apart: number, cur?: { x: number; y: number }) => {
    // running south on opposite tacks, side by side; S luffs toward P (30° at luffRate°/s), then holds; P holds on
    const S = boat('S', { at: [0, 0], heading: 181 }), P = boat('P', { at: [-apart, 0], heading: 179 });
    const p = pair(S, P);
    const hS = (t: number) => 181 + Math.min(30, Math.max(0, (t - 50) * luffRate));
    return sailOn(p, [[S, hS, 2.5], [P, () => 179, 2.5]], 48, 70, cur ? (b, t) => { b.cur = cur; b.x += cur.x * 0.1; b.y += cur.y * 0.1; b.vx += cur.x; b.vy += cur.y; void t; } : undefined);
  };
  it('Case 105: running on opposite tacks side by side, starboard luffs and port doesn\'t respond though she had room (she could gybe): port broke 10; starboard didn\'t break 16.1', () => {
    expect(case105(6, 9)).toMatchObject({ by: 'P', rule: '10' }); // a 30° luff over 5 s, from 9 m apart, over before they touch
  });
  it('Case 105, the other way: a luff so quick and close that no prompt turn could clear her is starboard\'s 16.1', () => {
    expect(case105(30, 4)).toMatchObject({ by: 'S', rule: '16.1' });
  });
  it('Case 105 in a current: the 1.5 m/s ebb both boats are in changes nothing between them', () => {
    for (const cur of [{ x: 1.5, y: 0 }, { x: 0, y: 1.5 }, { x: 0, y: -1.5 }, { x: -1.1, y: 1.1 }]) {
      expect(case105(6, 9, cur), JSON.stringify(cur)).toMatchObject({ by: 'P', rule: '10' });
      expect(case105(30, 4, cur), JSON.stringify(cur)).toMatchObject({ by: 'S', rule: '16.1' });
    }
  });
  it('16.2 is only for a port boat ducking (2025–2028: "keeping clear by sailing to pass to leeward"), and only after the start', () => {
    const S = boat('S', { at: [0, 0], heading: 315 });
    const ducking = boat('P', { at: [-6, -14], heading: 45 }); // her course meets S's track behind S
    const crossing = boat('P', { at: [-16, -4], heading: 45 }); // hers meets it ahead of S
    expect(duckingAstern(ducking, S, ctx(50))).toBe(true);
    expect(duckingAstern(crossing, S, ctx(50))).toBe(false);
    expect(duckingAstern(ducking, S, ctx(-30))).toBe(false); // (before the start: no beat to windward yet, WS Case 132)
  });

  it('Case 105 late in a race, the two boats in currents 0.05 m/s apart: the same answers as in still water', () => {
    const run = (luffRate: number, apart: number) => {
      const S = boat('S', { at: [0, 0], heading: 181 }), P = boat('P', { at: [-apart, 0], heading: 179 });
      const p = pair(S, P), T = 1500;
      const hS = (t: number) => 181 + Math.min(30, Math.max(0, (t - T - 2) * luffRate));
      const curOf = (b: typeof S) => b === S ? { x: 0.8, y: -0.6 } : { x: 0.85, y: -0.62 };
      return sailOn(p, [[S, hS, 2.5], [P, () => 179, 2.5]], T, T + 22, b => { const c = curOf(b); b.cur = c; b.x += c.x * 0.1; b.y += c.y * 0.1; b.vx += c.x; b.vy += c.y; });
    };
    expect(run(6, 9)).toMatchObject({ by: 'P', rule: '10' });
    expect(run(30, 4)).toMatchObject({ by: 'S', rule: '16.1' });
  });

  it('Case 105 in a seaway: the yaw of each wave doesn\'t hide when her luff began', () => {
    const S = boat('S', { at: [0, 0], heading: 181 }), P = boat('P', { at: [-9, 0], heading: 179 });
    const p = pair(S, P);
    const yaw = (t: number) => 1.5 * Math.sin(t * 2 * Math.PI / 3.2); // ±1.5° on a 3.2 s encounter period
    const hS = (t: number) => 181 + Math.min(30, Math.max(0, (t - 50) * 6)) + yaw(t);
    expect(sailOn(p, [[S, hS, 2.5], [P, t => 179 + yaw(t + 1), 2.5]], 48, 70)).toMatchObject({ by: 'P', rule: '10' });
  });
});

describe('Rules 19–24 · obstructions, room to tack, Section D', () => {
  it('Case 125: three port boats overlapped meet a starboard boat crossing ahead; PW and PM bear away to pass astern, PL holds her course into PM: PL broke 19.2(b) (her room must let both inside boats keep clear)', () => {
    // S close-hauled on starboard, on a collision course with PW; PM and PL could pass astern of her as they are
    const S = boat('S', { at: [16, 15], heading: 315 });
    const PW = boat('PW', { at: [4, 6], heading: 45 }), PM = boat('PM', { at: [7, 3.5], heading: 45 }), PL = boat('PL', { at: [10, 1], heading: 45 });
    const p = pair(PL, PM, [], fleetCtx([S, PW, PM, PL]));
    expect(clean(p, 50)).toMatchObject({ keepsClear: 'PM', rule: '11' });
    // a second on: S on her way (2.5 m/s at 315); PW and PM bear away to 75° to pass astern of her; PL holds on
    moveTo(S, off([16, 15], 315, 2.5)); moveTo(PW, off([4, 6], 75, 2.5), 75); moveTo(PM, off([7, 3.5], 75, 2.5), 75); moveTo(PL, off([10, 1], 45, 2.5));
    const r = p.at(51);
    expect(r.foul ?? r, 'contact as PM bears away into PL').not.toBeNull();
    expect(r.foul).toMatchObject({ by: 'PL', rule: '19', part: '19.2(b)' });
  });

  const case117 = (dObstruction: boolean) => {
    // before the start: D holding station below the line; L overlapped 5 m to leeward of her; W, clear astern of D,
    // overlapped 2.5 m to windward of L, heading into the gap between them
    const D = boat('D', { at: [0, 0], heading: 315, speed: 0.3, started: false });
    const L = boat('L', { at: off([0, 0], 315, -2, -5), heading: 315, speed: 1.5, started: false }), W = boat('W', { at: off([0, 0], 315, -8, -2.5), heading: 315, speed: 1, started: false });
    const fleet = fleetCtx([D, L, W], -15);
    const p = pair(L, W, [], dObstruction ? { ...fleet, keepsClearOf: () => true } : fleet);
    const before = clean(p, -15);
    // L luffs 10° (under rule 16.1's trigger) and closes up on W: squeezing her toward D, were D an obstruction
    moveTo(L, off([0, 0], 315, -0.6, -2.7), 325, 315);
    return { before, contact: p.at(-14) };
  };
  it('Case 117: before the start, L overlapped to leeward of D in a row of boats has right of way over her, so D is no obstruction between L and W: no 19.2(b), and W, to windward of L, keeps clear (11)', () => {
    const r = case117(false);
    expect(r.before).toMatchObject({ keepsClear: 'W', rule: '11' });
    expect(r.contact.foul).toMatchObject({ by: 'W', rule: '11' });
  });
  it('Case 117 (the counterpart): were D an obstruction to both, L would owe W room between them (19.2(b))', () => {
    expect(case117(true).contact.foul).toMatchObject({ by: 'L', rule: '19' });
  });

  const case101 = () => {
    // A, clear ahead and to leeward of B, both on starboard approaching the shore, hails; B replies "You tack"; A tacks onto port.
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: off([0, 0], 315, -9, 6), heading: 315 });
    const p = pair(A, B);
    clean(p, 50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    A.lastTackT = 51; A.headToWindT = 51; moveTo(A, [0.5, 0.5], 45); // she has tacked onto port (close-hauled)
    return p.at(52);
  };
  it('Case 101: once she has tacked and had the time to bear away round the other\'s stern, contact is the hailing boat\'s (10)', () => {
    const b0 = off([0, 0], 315, -9, 6);
    const A = boat('A', { at: [0, 0], heading: 315 }), B = boat('B', { at: b0, heading: 315 });
    const p = pair(A, B);
    clean(p, 50);
    p.rec.hail = { by: A.id, at: 50, kind: 'room', replyAt: 50.5 };
    A.lastTackT = 51; A.headToWindT = 51; moveTo(A, [0.5, 0.5], 45);
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
    A.tacking = true; A.lastTackT = 51; A.headToWindT = 51; moveTo(A, [0.3, 0.3], 30);
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
    A.tacking = true; A.lastTackT = 51; A.headToWindT = 51; moveTo(A, off(b1, 315, -4.6, -0.5), 20); // A tacks up into B's stern
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
