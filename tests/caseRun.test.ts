// Sail it yourself (the Rules trainer): a World Sailing Case laid out on the water and sailed in the World, you helming
// one of its boats, the others on the Case's own track (src/sim/caseRun.ts).
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { n360, wrap } from '../src/core/math';
import { CASES } from '../src/rules/cases';
import { caseHelm, sailable } from '../src/sim/caseRun';

const caseWorld = (n: number) => new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', lesson: 'case', rulesCase: n, sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0 }, 3, { freeSail: true });
/** Sail it to the end, the helm steering `helm(Case time, her Case heading)`; incidents' pauses let go at once. */
function sail(w: World, helm: (ct: number, h: number) => number) {
  const R = w.caseRun!, u = w.user; let pen = 0;
  while (!R.result && w.t < 200) {
    u.h = n360(helm(R.t0 + w.t, R.pose(R.helm, w.t).h));
    w.step(DT); if (w.paused) w.paused = false;
    for (const b of w.boats) pen = Math.max(pen, b.isUser ? 0 : b.penalty);
  }
  return { result: R.result, fouls: R.fouls, aiPenalty: pen };
}

describe('Sail it yourself: a Case on the water', () => {
  it('laid out turned to the wind: each boat at her Case angle to it, you at the helm of the one it\'s about, the others named by their letters', () => {
    const w = caseWorld(7), R = w.caseRun!;
    expect(R.helm).toBe('W'); expect(w.user.name).toBe('W'); expect(w.boats.map(b => b.name).sort()).toEqual(['L', 'W']);
    for (const b of w.boats) {
      const f = R.pose(b.name, 0);
      expect(Math.abs(wrap(b.h - R.turn) - wrap(f.h - R.turn))).toBeLessThan(0.01);
      expect(Math.abs(wrap(b.h - R.turn))).toBeCloseTo(45, 0); // (Case 7: both close-hauled on starboard, 315° to a wind from 000°)
    }
    expect(w.lesson!.cue).toBe('You\'re W: sail it without breaking a rule');
  });

  it('the Case\'s boats sail its track (carried by the current, as you are), trimmed and heeled by her own wind', () => {
    const w = caseWorld(7), R = w.caseRun!, L = w.boats.find(b => b.name === 'L')!;
    for (let i = 0; i < 5 * 60; i++) w.step(DT);
    const q = R.pose('L', w.t);
    expect(Math.hypot(L.x - q.p.x, L.y - q.p.y)).toBeLessThan(0.5);
    expect(L.h).toBeCloseTo(q.h, 5);
    expect(L.sheets.main).toBeLessThan(20); // (close-hauled: the main in)
    expect(Math.abs(L.heel)).toBeGreaterThan(3);
  });

  it('Case 7: W held on her Case course breaks rule 11, as the Case says; W luffing clear of L sails it clear', () => {
    expect(sail(caseWorld(7), (_t, h) => h)).toMatchObject({ result: 'foul', fouls: ['11'] });
    expect(sail(caseWorld(7), (t, h) => t > 44 ? h + 25 : h)).toMatchObject({ result: 'clear', fouls: [] });
  });

  it('Case 105: P keeping clear of S\'s luff sails it clear; turning toward her doesn\'t', () => {
    expect(sail(caseWorld(105), (t, h) => t > 49 ? h - 25 : h).result).toBe('clear');
    expect(sail(caseWorld(105), (t, h) => t > 49 ? h + 25 : h).result).toBe('foul');
  });

  it('what happens between two of the Case\'s own boats is the Case\'s: no turns for them (Case 11, three boats)', () => {
    expect(sail(caseWorld(11), (_t, h) => h).aiPenalty).toBe(0);
  });

  it('sailable: taught Cases without marks or a bank; the helm is a boat of the Case', () => {
    const s = CASES.filter(sailable).map(c => c.case);
    expect(s).toEqual(expect.arrayContaining([7, 11, 13, 14, 23, 27, 53, 105]));
    for (const c of CASES.filter(c => c.marks?.length || c.bank)) expect(sailable(c)).toBe(false);
    for (const c of CASES) expect(c.boats.some(b => b.letter === caseHelm(c))).toBe(true);
  });
});
