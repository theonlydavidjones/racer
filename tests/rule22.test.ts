import { describe, expect, it } from 'vitest';
import { boat, moveTo, pair, verdict } from './diagram';
import { explain, RULES } from '../src/rules/explain';
import { RULE15_GRACE } from '../src/rules/pairs';

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
    A.anchored = true;
    expect(verdict(A, T)).toEqual({ keepsClear: 'T', rule: '22' });
  });

  // (A anchored from t = 5, S sailing up to her: in contact at `t`)
  const hit = (t: number, o: { swerve?: boolean; gap?: number; leg?: number; penalty?: number } = {}) => {
    const A = boat('A', { at: [0, 0], heading: 0, speed: 0, aboveProper: true }), S = boat('S', { at: [-30, -30], heading: 45, leg: o.leg ?? 0, penalty: o.penalty });
    A.anchored = true;
    const p = pair(A, S); p.at(5);
    moveTo(S, [-(o.gap ?? 1), -(o.gap ?? 1)], 45);
    return p.at(t, { swerve: o.swerve });
  };
  it('sailing into an anchored boat: the boat under way breaks rule 22', () => {
    expect(hit(10).foul).toMatchObject({ by: 'S', rule: '22', kind: 'contact' });
  });
  it('but not if the hook went down too late for her to respond ("if possible")', () => {
    expect(hit(5 + RULE15_GRACE - 0.5).foul).toBeNull();
  });
  it('passing close without touching is avoiding her: no swerve incident under rule 22', () => {
    expect(hit(10, { swerve: true, gap: 6 }).foul).toBeNull();
  });
  it('an anchored boat lying head to wind isn\'t interfering (23.2) with a boat on another leg, or doing turns, that hits her', () => {
    expect(hit(10, { leg: 1 }).foul).toMatchObject({ by: 'S', rule: '22' });
    expect(hit(10, { penalty: 360 }).foul).toMatchObject({ by: 'S', rule: '22' });
  });
  it('two boats both held (swinging together at anchor): neither can avoid the other, no incident', () => {
    const A = boat('A', { at: [0, 0], heading: 45, speed: 0 }), B = boat('B', { at: [0.2, 0], heading: 315, speed: 0 });
    A.anchored = true; B.aground = true;
    const p = pair(A, B); p.at(5);
    const r = p.at(20);
    expect(r.rule).toBe('22'); expect(r.foul).toBeNull();
  });
  it('anchoring just after a tack gives no rule 15 grace: she acquires no right of way', () => {
    const A = boat('A', { at: [0, 0], heading: 45, lastTackT: 4 }), S = boat('S', { at: [-30, -30], heading: 315 });
    const p = pair(A, S); p.at(4);
    A.anchored = true; p.at(5);
    moveTo(S, [-1, -1], 315);
    expect(p.at(7).foul).toBeNull(); // (not hers under 15; and S hadn't time to respond, so not S's under 22 either)
  });
  it('weighing anchor, she acquires right of way by her own action: rule 15, she gives the other room to keep clear', () => {
    // (A on starboard, anchored; P passing close on port. A weighs: P must keep clear under 10, but first A owes her room)
    const A = boat('A', { at: [0, 0], heading: 315, speed: 0 }), P = boat('P', { at: [-30, -30], heading: 45 });
    A.anchored = true;
    const p = pair(A, P); p.at(5); p.at(9);
    A.anchored = false; p.at(10);
    moveTo(P, [-1, -1], 45);
    expect(p.at(10.5).foul).toMatchObject({ by: 'A', rule: '15', why: 'weighed' });
  });
  it('the incident card and the hint say so', () => {
    expect(RULES['22'][0]).toBe('Rule 22 · Anchored or aground');
    expect(explain({ youFouled: true, other: 'B', userTack: 'S', rule: '22', kind: 'contact', byWhy: null }).what).toContain('anchored or aground');
    expect(explain({ youFouled: true, other: 'B', userTack: 'S', rule: '15', kind: 'contact', byWhy: 'weighed' }).what).toContain('under way again');
  });
});
