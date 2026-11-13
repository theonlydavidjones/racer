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
import type { RulesMark } from '../src/rules';
import { boat, moveTo, pair } from './diagram';

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
