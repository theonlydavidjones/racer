// Sail it yourself (the Rules trainer): a World Sailing Case laid out on the water and sailed in the World, you helming
// one of its boats, the others on the Case's own track (src/sim/caseRun.ts).
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { n360, wrap } from '../src/core/math';
import { CASES } from '../src/rules/cases';
import { caseHelm, sailable } from '../src/sim/caseRun';
import { CONTACT_GAP, hullGap } from '../src/rules';

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
    const ah = { x: L.x + Math.sin(L.h * Math.PI / 180) * 40, y: L.y + Math.cos(L.h * Math.PI / 180) * 40 }, h0 = L.h, tack0 = L.tack;
    let gap = Infinity;
    let tacked = false;
    for (let i = 0; i < 30 * 60; i++) {
      Object.assign(u, { x: ah.x, y: ah.y, h: h0, desired: h0, v: 0, vx: 0, vy: 0 });
      w.step(DT); if (w.paused) w.paused = false;
      gap = Math.min(gap, hullGap(u, L)); tacked ||= !!L.tacking;
    }
    expect(gap).toBeGreaterThan(8); expect(tacked).toBe(false); expect(L.tack).toBe(tack0); // (round you without tacking: Rule 13) // (well round you: held on her course, she'd pass about 4 m off, a length's turn too late)
  });

  it('freed with right of way, she bears off from a boat closing on her alongside (Rule 14), and doesn\'t luff back into her (16.1)', () => {
    // (Cases 14 and 23, you on the Case's course after the contact, three seeds: held on her heading, the hulls were in
    // contact, CONTACT_GAP, for 1222–1256 and 1819–2439 of the 3600 steps of the minute after)
    for (const n of [14, 23]) for (const seed of [3, 1, 7]) {
      const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', lesson: 'case', rulesCase: n, sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0 }, seed, { freeSail: true });
      const R = w.caseRun!, u = w.user;
      let freed = -1, touching = 0, tacks = 0;
      const was = new Map<number, boolean>();
      while (w.t < 200 && (freed < 0 || w.t < freed + 60)) {
        u.h = n360(R.pose(R.helm, w.t).h); w.step(DT); if (w.paused) w.paused = false;
        if (freed < 0 && R.free.length) freed = w.t;
        if (freed >= 0) for (const b of w.boats) if (b.script && R.free.includes(b.script)) {
          if (hullGap(u, b) < CONTACT_GAP) touching++;
          if (b.tacking && !was.get(b.id)) tacks++; was.set(b.id, !!b.tacking);
        }
      }
      (globalThis as unknown as { process: { stderr: { write(s: string): void } } }).process.stderr.write(`FREE case ${n} seed ${seed} touching ${touching} tacks ${tacks}\n`);
      expect(freed).toBeGreaterThan(0); expect(touching).toBeLessThan(400); expect(tacks).toBe(0);
    }
  }, 120_000);

  // Known (Coordinator, 14 Nov 2026: landed as it is, these pinned till they're fixed): the freed boat's helm in two
  // geometries it doesn't yet sail clear. Case 23, seed 1: running on starboard with you on port closing on her windward
  // quarter, her only way clear is a jibe, at 2.6 m, after which she's the boat that must keep clear and is called under
  // rule 11. Case 27: freed 3.8 m off at 1 m/s, already ducking, she can't turn in time and the hulls touch.
  const freedRun = (n: number, seed: number) => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', lesson: 'case', rulesCase: n, sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0 }, seed, { freeSail: true });
    const R = w.caseRun!, u = w.user;
    let freed = -1, touching = 0, hers = 0, seen: World['userIncident'] = null;
    while (w.t < 200 && (freed < 0 || w.t < freed + 60)) {
      u.h = n360(R.pose(R.helm, w.t).h); w.step(DT); if (w.paused) w.paused = false;
      if (freed < 0 && R.free.length) { freed = w.t; seen = w.userIncident; }
      const ui = w.userIncident; if (freed >= 0 && ui && ui !== seen) { seen = ui; if (ui.fouler !== u.id) hers++; } // (the World's calls, after she's freed)
      if (freed >= 0 && w.t > freed + 0.5) for (const b of w.boats) if (b.script && R.free.includes(b.script) && hullGap(u, b) < CONTACT_GAP) touching++;
    }
    return { freed, touching, hers };
  };
  it.fails('known: Case 23 (seed 1), freed and running, no foul of hers after (her only way clear is a jibe that makes her keep clear)', () => {
    const r = freedRun(23, 1); expect(r.freed).toBeGreaterThan(0); expect(r.hers).toBe(0);
  }, 60_000);
  it.fails('known: Case 27, freed 3.8 m off at 1 m/s, the hulls don\'t touch after', () => {
    const r = freedRun(27, 3); expect(r.freed).toBeGreaterThan(0); expect(r.touching).toBe(0);
  }, 60_000);

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
