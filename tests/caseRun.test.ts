// Sail it yourself (the Rules trainer): a World Sailing Case laid out on the water and sailed in the World, you helming
// one of its boats, the others on the Case's own track (src/sim/caseRun.ts).
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { n360, wrap } from '../src/core/math';
import { CASES } from '../src/rules/cases';
import { caseHelm, sailable } from '../src/sim/caseRun';
import { hullGap } from '../src/rules';

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
    expect(sail(caseWorld(7), (_t, h) => h)).toMatchObject({ result: 'foul', fouls: [{ rule: '11' }] });
    expect(sail(caseWorld(7), (t, h) => t > 44 ? h + 25 : h)).toMatchObject({ result: 'clear', fouls: [] });
  });

  it('touched, the Case\'s boat is a boat, not a pinned wall: she sails free from the contact, and it\'s said so', () => {
    const w = caseWorld(7), R = w.caseRun!, u = w.user;
    let touched = -1;
    while (!R.result && w.t < 200) {
      u.h = n360(R.pose(R.helm, w.t).h); w.step(DT); if (w.paused) w.paused = false;
      if (touched < 0 && R.free.length) touched = w.t;
    }
    expect(R.free).toEqual(['L']);
    const L = w.boats.find(b => b.name === 'L')!, q = R.pose('L', w.t);
    expect(Math.hypot(L.x - q.p.x, L.y - q.p.y)).toBeGreaterThan(1); // (off the Case's track: where the contact and her own way took her)
    const msgs = w.events.flatMap(e => e.type === 'toast' ? [e.msg] : []);
    expect(msgs.some(m => m.startsWith(`L (${L.no}) sails on free`))).toBe(true);
    expect(w.lesson!.cue).toBe('Foul: Rule 11 · Same tack, overlapped');
  });

  it('freed, she keeps the rules as the race AI does: clear astern of you stopped on her course, she keeps clear (rule 12)', () => {
    const w = caseWorld(7), R = w.caseRun!, u = w.user, L = w.boats.find(b => b.name === 'L')!;
    while (!R.free.length && w.t < 200) { u.h = n360(R.pose(R.helm, w.t).h); w.step(DT); if (w.paused) w.paused = false; }
    expect(R.free).toEqual(['L']);
    for (let i = 0; i < 5 * 60; i++) { w.step(DT); if (w.paused) w.paused = false; } // (apart again)
    // you, stopped 40 m dead ahead of her on her heading: she's clear astern, and must keep clear
    const ah = { x: L.x + Math.sin(L.h * Math.PI / 180) * 40, y: L.y + Math.cos(L.h * Math.PI / 180) * 40 }, h0 = L.h;
    let gap = Infinity;
    for (let i = 0; i < 30 * 60; i++) {
      Object.assign(u, { x: ah.x, y: ah.y, h: h0, desired: h0, v: 0, vx: 0, vy: 0 });
      w.step(DT); if (w.paused) w.paused = false;
      gap = Math.min(gap, hullGap(u, L));
    }
    expect(gap).toBeGreaterThan(8); // (well round you: held on her course, she'd pass about 4 m off, a length's turn too late)
  });

  it('a Case\'s boat on its track, not steered, that breaks a rule: the card says so, and she owes no penalty', () => {
    const w = caseWorld(7), R = w.caseRun!, u = w.user, L = w.boats.find(b => b.name === 'L')!;
    for (let i = 0; i < 60; i++) w.step(DT);
    // (you stopped dead ahead of L, on her track: she comes up from clear astern, rule 12, and can't keep clear)
    const q = R.pose('L', w.t), ahead = { x: q.p.x + Math.sin(q.h * Math.PI / 180) * 9, y: q.p.y + Math.cos(q.h * Math.PI / 180) * 9 };
    let inc: { scripted?: boolean; fouler: { id: number }; rule: string } | null = null;
    for (let i = 0; i < 20 * 60 && !inc; i++) {
      Object.assign(u, { x: ahead.x, y: ahead.y, h: q.h, desired: q.h, v: 0.2 });
      w.step(DT); if (w.paused) w.paused = false;
      for (const e of w.drainEvents()) if (e.type === 'incident') inc = e.incident;
    }
    expect(inc?.fouler.id).toBe(L.id); expect(inc?.rule).toBe('12');
    expect(inc?.scripted).toBe(true);
    expect(L.penalty).toBe(0);
  });

  it('what happens between two of the Case\'s own boats is the Case\'s: no turns for them (Case 11, three boats)', () => {
    expect(sail(caseWorld(11), (_t, h) => h).aiPenalty).toBe(0);
  });

  it('sailable: taught Cases without marks or a bank that come out as the Case does; the helm is a boat of the Case', () => {
    expect(CASES.filter(sailable).map(c => c.case).sort((a, b) => a - b)).toEqual([7, 14, 23, 27, 53]);
    for (const c of CASES.filter(c => c.marks?.length || c.bank)) expect(sailable(c)).toBe(false);
    for (const c of CASES) expect(c.boats.some(b => b.letter === caseHelm(c))).toBe(true);
  });

  it('each sailable Case, sailed as drawn (the helm on her Case course), comes out as the Case does: her foul, under its rule, or clear', () => {
    for (const c of CASES.filter(sailable)) for (const seed of [3, 7]) {
      const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', lesson: 'case', rulesCase: c.case, sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0 }, seed, { freeSail: true });
      const r = sail(w, (_t, h) => h), f = r.fouls[0], got = f ? f.part ?? f.rule : 'clear';
      // (Case 27: tacking too close, she's called while still tacking, 13, or just done, 15, by how her own speed times it:
      // the Case's point, AS keeps clear, either way)
      const want = c.answer.who === 'neither' ? ['clear'] : c.case === 27 ? ['13', '15'] : [c.answer.rule];
      expect(want, `Case ${c.case}, seed ${seed}`).toContain(got);
    }
  });
});
