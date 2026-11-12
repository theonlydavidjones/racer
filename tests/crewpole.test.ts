import { describe, expect, it } from 'vitest';
import { crewPoleCall } from '../src/ai/ai';
import { settleTrim } from '../src/boat/physics';
import { n360 } from '../src/core/math';
import { allToCrew } from '../src/boat/physics';
import { World } from '../src/sim/world';
import { DEFAULT_SETTINGS } from '../src/settings';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { testBoat } from './helpers/testBoat';

// The crew's call on the whisker pole (ai.ts crewPoleCall): theirs on the AI boats, and on yours until you take it
// (the sail controls band's Pole tab), back with Auto-trim (owner, 12 Nov 2026).
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
  it('your crew sets it in a race, unless the pole is yours (World.step)', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS }, 1), u = w.user;
    w.t = 60; u.twa = 170; u.poleMine = false; w.step(0.05); expect(u.poleWant).toBe(true);
    u.poleWant = false; u.poleMine = true; w.t = 60; w.step(0.05); expect(u.poleWant).toBe(false);
  });
  it('Auto-trim hands the pole back to the crew', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    b.poleMine = true; allToCrew(b); expect(b.poleMine).toBe(false);
  });
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
      expect(r.dm).toBeLessThan(2 + 9.5 * Math.abs(r.trav)); // (less the traveller the crew's plan sets on the first step)
      expect(r.dj).toBeLessThan(2);
    }
  });
  it('cruising on a reach in a breeze and a strong tide: trimmed to her own wind, not the course wind', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, mode: 'sail', windKt: 16, current: 'real' }, 3, { freeSail: true });
    const u = w.user; u.h = n360(u.ww.from + 90); settleTrim(u, u.ww.from, u.ww.kt);
    const lee = u.tack === 'S' ? 'P' : 'S', ins0 = u.ctl.car[lee].ins; const [r] = firstStep(w);
    // (less what the crew's plan does on the first step: the traveller, and the leeward car's lead, 1.25° a pin: controls.ts carLead)
    expect(r.dm).toBeLessThan(2 + 9.5 * Math.abs(r.trav)); expect(r.dj).toBeLessThan(2 + 1.25 * Math.abs(u.ctl.car[lee].ins - ins0));
  });
});
