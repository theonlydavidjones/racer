import { TRAVELLER_SWING } from '../src/boat/controls';
import { describe, expect, it } from 'vitest';
import { crewPoleCall, poleMustCome, poleRefused } from '../src/ai/ai';
import { settleTrim } from '../src/boat/physics';
import { n360 } from '../src/core/math';
import { allToCrew } from '../src/boat/physics';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { SLIPS, inBasin } from '../src/geo/marina';
import { applyCommand } from '../src/sim/commands';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { testBoat } from './helpers/testBoat';

// The crew's call on the whisker pole (ai.ts crewPoleCall): theirs on the AI boats only; yours is your call (below).
const world = (t = 60) => ({ t, nextMark: () => null }) as unknown as World;

describe('The crew calls the whisker pole', () => {
  it('out running deep, in on a reach, with a gap between so they do not set and stow it over and over', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.twa = 165; crewPoleCall(world(), b); expect(b.poleWant).toBe(true);
    b.twa = 153; crewPoleCall(world(), b); expect(b.poleWant).toBe(true); // (inside the gap: stays as it was)
    b.twa = 148; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
    b.twa = 155; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
    b.twa = 160; crewPoleCall(world(), b); expect(b.poleWant).toBe(true);
  });
  it('in for penalty turns: no crew spins circles with the pole out', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.twa = 170; crewPoleCall(world(), b); expect(b.poleWant).toBe(true);
    b.penalty = 720; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
  });
  it('never before the start, nor with the jib down', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.twa = 170; crewPoleCall(world(-30), b); expect(b.poleWant).toBe(false);
    b.rig = { main: 1, jib: 0, mainUp: true, jibUp: false }; crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
  });
  it('an AI crew never sets it inside a harbor\'s basin', () => {
    const b = testBoat({ heading: 0, kt: 4 }); b.twa = 170; Object.assign(b, SLIPS[0].p);
    crewPoleCall(world(), b); expect(b.poleWant).toBe(false);
  });
});

// Your boat's pole goes out only on your call (the owner, 13 Nov 2026: "pole-out should only ever be on my command"):
// your crew never sets it, on Auto or Auto-trim, deep downwind or in a marina; they stow it only when it must come in.
describe('your pole: your call only', () => {
  /** Your boat cruising, the wind west 12 kt, everything on Auto, held `twa` off the wind for `secs`. */
  function deep(twa: number, secs: number, at?: { x: number; y: number }) {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack' } as Settings, 3, { freeSail: true }), u = w.user;
    w.step(DT); allToCrew(u); if (u.crew) u.crew.place = undefined;
    if (at) { u.x = at.x; u.y = at.y; }
    let ever = false;
    for (let i = 0; i < secs * 60; i++) { u.h = n360(u.ww.from + twa); w.step(DT); if (u.poleWant || u.pole !== 'down') ever = true; }
    return { w, u, ever };
  }
  it('a long run in open water on Auto: the crew never set it; then you call it, and it goes out', () => {
    const { w, u, ever } = deep(170, 120);
    expect(ever).toBe(false);
    applyCommand(w, { k: 'pole', want: true });
    for (let i = 0; i < 40 * 60; i++) { u.h = n360(u.ww.from + 170); w.step(DT); }
    expect(u.pole).toBe('set');
    // (Auto-trim leaves it yours: out it stays)
    allToCrew(u); for (let i = 0; i < 10 * 60; i++) { u.h = n360(u.ww.from + 170); w.step(DT); }
    expect(u.poleWant).toBe(true); expect(u.pole).toBe('set');
  }, 60_000);
  it('inside a marina\'s basin, running: never set, and a call there refused, saying why', () => {
    const { w, u, ever } = deep(170, 30, SLIPS[0].p);
    expect(ever).toBe(false);
    // (held where only the basin stops it: running deep, the jib up, no penalty, not at the dock)
    Object.assign(u, SLIPS[0].p); u.h = n360(u.ww.from + 170); u.twa = 170; u.penalty = 0; u.docked = undefined;
    expect(inBasin(u)).toBe(true); expect(u.rig?.jib ?? 1).toBe(1);
    // (the call is refused: the page says why before it sends it, app.ts togglePole, and the race refuses it too)
    expect(poleRefused(u)).toMatch(/harbor/);
    applyCommand(w, { k: 'pole', want: true }); w.step(DT);
    expect(u.poleWant).toBe(false);
    // (out already, she sails into the basin: the crew bring it straight in, saying why)
    u.poleWant = true; u.pole = 'set'; w.drainEvents(); w.step(DT);
    expect(u.poleWant).toBe(false);
    expect(w.drainEvents().some(e => e.type === 'toast' && /harbor/.test(e.msg))).toBe(true);
  }, 60_000);
  it('out at 150 true, where the old crew call stowed it, it stays out: your call; at 140, aback, the crew bring it in', () => {
    const { w, u } = deep(170, 5);
    applyCommand(w, { k: 'pole', want: true });
    for (let i = 0; i < 40 * 60; i++) { u.h = n360(u.ww.from + 170); w.step(DT); }
    expect(u.pole).toBe('set');
    for (let i = 0; i < 30 * 60; i++) { u.h = n360(u.ww.from + 150); w.step(DT); }
    expect(u.poleWant).toBe(true); expect(u.pole).toBe('set');
    for (let i = 0; i < 30 * 60; i++) { u.h = n360(u.ww.from + 140); w.step(DT); }
    expect(u.poleWant).toBe(false); expect(u.pole).toBe('down');
  }, 60_000);
  // (the owner, v184: "pole out button isn't working": the tab showed from 140° true, where the crew refused it)
  it('the Pole tab\'s call on a deep run, either gybe: the crew set it', () => {
    for (const side of [1, -1]) {
      const { w, u } = deep(0, 0); for (let i = 0; i < 5 * 60; i++) { u.h = n360(u.ww.from + side * 165); w.step(DT); }
      expect(poleRefused(u)).toBeNull();
      applyCommand(w, { k: 'pole', want: true });
      for (let i = 0; i < 40 * 60; i++) { u.h = n360(u.ww.from + side * 165); w.step(DT); }
      expect(u.pole, `side ${side}`).toBe('set');
    }
  }, 60_000);
  it('where the crew would refuse it, the tab isn\'t offered, and a call there sets nothing (and the page says why)', () => {
    const { w, u } = deep(142, 5);
    expect(poleRefused(u)).toMatch(/too high/);
    applyCommand(w, { k: 'pole', want: true }); expect(u.poleWant).toBe(false);
    for (let i = 0; i < 10 * 60; i++) { u.h = n360(u.ww.from + 142); w.step(DT); }
    expect(u.pole).toBe('down');
    // (the rest of the rules refuse a new call too: here the jib down)
    u.twa = 170; expect(poleRefused(u)).toBeNull(); u.rig = { main: 1, jib: 0, mainUp: true, jibUp: false }; expect(poleRefused(u)).toMatch(/jib is down/);
  }, 60_000);
  it('out, a shift of a few seconds up to 143° doesn\'t bring it in; staying there does, and coming up past 135° at once', () => {
    const { w, u } = deep(170, 5);
    applyCommand(w, { k: 'pole', want: true });
    for (let i = 0; i < 40 * 60; i++) { u.h = n360(u.ww.from + 170); w.step(DT); }
    expect(u.pole).toBe('set');
    for (let i = 0; i < 2 * 60; i++) { u.h = n360(u.ww.from + 143); w.step(DT); }
    for (let i = 0; i < 5 * 60; i++) { u.h = n360(u.ww.from + 165); w.step(DT); }
    expect(u.poleWant).toBe(true);
    for (let i = 0; i < 4 * 60; i++) { u.h = n360(u.ww.from + 143); w.step(DT); }
    expect(u.poleWant).toBe(false);
    expect(poleMustCome(u, 0)).toBeNull(); u.twa = 130; expect(poleMustCome(u, 0)).toMatch(/too high/);
  }, 60_000);
});

describe('Boats start trimmed for their heading (UI session, 12 Nov 2026)', () => {
  // the first step must find her sheets where it would put them: nothing visibly eases or trims as the sequence starts
  const firstStep = (w: World) => {
    const before = w.boats.map(b => ({ m: b.sheets.main, j: b.sheets.jib, tack: b.tack }));
    w.step();
    return w.boats.map((b, i) => ({ id: b.id, dm: Math.abs(b.sheets.main - before[i].m), dj: Math.abs(b.sheets.jib - before[i].j), tack: before[i].tack === b.tack, trav: b.ctl.traveller }));
  };
  it('a race fleet: the main and jib barely move on the first step, and no phantom tack', () => {
    for (const r of firstStep(new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'real' }, 1))) {
      expect(r.tack).toBe(true);
      expect(r.dm).toBeLessThan(2 + TRAVELLER_SWING * Math.abs(r.trav)); // (less the traveller the crew's plan sets on the first step)
      expect(r.dj).toBeLessThan(2);
    }
  });
  it('cruising on a reach in a breeze and a strong tide: trimmed to her own wind, not the course wind', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, mode: 'sail', windKt: 16, current: 'real' }, 3, { freeSail: true });
    const u = w.user; u.h = n360(u.ww.from + 90); settleTrim(u, u.ww.from, u.ww.kt);
    const lee = u.tack === 'S' ? 'P' : 'S', ins0 = u.ctl.car[lee].ins; const [r] = firstStep(w);
    // (less what the crew's plan does on the first step: the traveller, and the leeward car's lead, 1.25° a pin: controls.ts carLead)
    expect(r.dm).toBeLessThan(2 + TRAVELLER_SWING * Math.abs(r.trav)); expect(r.dj).toBeLessThan(2 + 1.25 * Math.abs(u.ctl.car[lee].ins - ins0));
  });
});
