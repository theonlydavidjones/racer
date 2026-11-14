import { describe, expect, it } from 'vitest';
import { boat, pair, verdict } from './diagram';
import { explain, RULES } from '../src/rules/explain';

// RRS 22: "If possible, a boat shall avoid a boat that is capsized or has not regained control after capsizing, is
// anchored or aground, or is trying to help a person or vessel in danger." Part 2, Section D preamble: "When rule 21 or
// 22 applies between two boats, Section A rules do not." WS Case 5: an anchored boat is still racing.
// (Wind from 000°: 315 starboard close-hauled, 045 port.)
describe('Rule 22: anchored or aground', () => {
  it('an anchored boat on port, a boat under way on starboard: the starboard boat must avoid her (Section A off)', () => {
    const A = boat('A', { at: [0, 0], heading: 45, speed: 0 }), S = boat('S', { at: [-20, -20], heading: 315 });
    A.anchored = true;
    expect(verdict(A, S)).toEqual({ keepsClear: 'S', rule: '22' });
    expect(verdict(S, A)).toEqual({ keepsClear: 'S', rule: '22' });
  });
  it('aground, the same', () => {
    const G = boat('G', { at: [0, 0], heading: 45, speed: 0 }), S = boat('S', { at: [-20, -20], heading: 315 });
    G.aground = true;
    expect(verdict(G, S)).toEqual({ keepsClear: 'S', rule: '22' });
  });
  it('and over a boat doing turns too: rule 22 before rule 21', () => {
    const A = boat('A', { at: [0, 0], heading: 45, speed: 0, penalty: 360 }), T = boat('T', { at: [-20, -20], heading: 315, penalty: 360 });
    A.anchored = true; T.penalty = 360;
    expect(verdict(A, T)).toEqual({ keepsClear: 'T', rule: '22' });
  });
  it('two boats both anchored: the ordinary rules between them', () => {
    const A = boat('A', { at: [0, 0], heading: 45, speed: 0 }), B = boat('B', { at: [-20, -20], heading: 315, speed: 0 });
    A.anchored = B.anchored = true;
    expect(verdict(A, B)).toEqual({ keepsClear: 'A', rule: '10' });
  });
  it('sailing into an anchored boat: the boat under way breaks rule 22', () => {
    const A = boat('A', { at: [0, 0], heading: 45, speed: 0 }), S = boat('S', { at: [-1, -1], heading: 315 });
    A.anchored = true;
    const p = pair(A, S);
    expect(p.at(10).foul).toMatchObject({ by: 'S', rule: '22', kind: 'contact' });
  });
  it('the incident card and the hint say so', () => {
    expect(RULES['22'][0]).toBe('Rule 22 · Anchored or aground');
    expect(explain({ youFouled: true, other: 'B', userTack: 'S', rule: '22', kind: 'contact', byWhy: null }).what).toContain('anchored or aground');
  });
});
