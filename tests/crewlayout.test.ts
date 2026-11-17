import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { CourseFile } from '../src/courses/course';
import { JIB_WINCH_Z } from '../src/render/hull';
import { newCrew } from '../src/boat/crewPhys';
import { polar, beatAngle } from '../src/boat/polar';
import { settleTrim } from '../src/boat/physics';
import { KT, n360 } from '../src/core/math';
import { testBoat, sail } from './helpers/testBoat';

// The bow hand to the mast downwind without the pole (crewPhys.ts chooseLayout): judged at the speed she sails in the
// wind and at the angle there's been over the last minute, not at her own speed (a slow start read a breeze as light
// air) nor at this moment's angle (deep in a gybe, at 180, the jib's blanketed and the polar's slowest).
const P = { h: 1.78, w: 80, skill: 0.9 };
const spec = (n: number) => ({ helm: P, crew: Array.from({ length: n }, () => P) }) as any;
const layouts = (kt: number, windKt: number, secs: number, steer: (t: number) => number, n = 2) => {
  const b = testBoat({ heading: steer(0), kt, windKt }); b.crew = newCrew(spec(n), 'S'); settleTrim(b, b.ww.from, b.ww.kt);
  const seen = new Set<string>(); let mastS = 0;
  sail(b, secs, t => { b.h = steer(t); const l = b.crew!.layout ?? 'cockpit'; seen.add(l); if (l === 'mast') mastS += 1 / 30; });
  return { seen, mastS, last: b.crew!.layout ?? 'cockpit' };
};
// gybe every 70 s, 160 to 200 and back, at 5 degrees a second
const gybing = (t: number) => { const ph = Math.floor(t / 70), s = t - ph * 70, from = ph % 2 ? 200 : 160; return from + (ph % 2 ? -1 : 1) * Math.min(40, s * 5); };

describe('The bow hand to the mast, without the pole (crewPhys.ts chooseLayout)', () => {
  it('gybing in 12 kt, they stay in the cockpit', () => {
    for (const W of [12, 14]) expect([...layouts(polar(W, 160, 'jib') / KT, W, 600, gybing).seen], `${W} kt`).toEqual(['cockpit']);
  }, 300_000);
  it('a slow start in 12 kt is not light air: they stay in the cockpit', () => {
    for (const kt of [4, 0.5]) expect([...layouts(kt, 12, 200, () => 160).seen], `from ${kt} kt`).toEqual(['cockpit']);
  }, 300_000);
  it('in light air on a run, the bow hand goes to the mast', () => {
    const r = layouts(polar(6, 160, 'jib') / KT, 6, 200, () => 160);
    expect(r.last).toBe('mast');
    expect(r.mastS).toBeGreaterThan(120);
  }, 300_000);
  it('with the bow hand gone to the mast, the sheets are still trimmed: the helm takes them (crewWork.ts ownerOf)', () => {
    // (bearing away from a beat to a run in 6 kt: as the bow hand went forward holding the mainsheet, the helm on the
    // jib, neither sheet was trimmed again: 58/64 for minutes, against 70/68 with two crew)
    const sheets = (n: number) => {
      const W = 6, bt = beatAngle(W), b = testBoat({ heading: n360(bt), kt: 3, windKt: W }); b.crew = newCrew(spec(n), 'S'); settleTrim(b, b.ww.from, b.ww.kt);
      sail(b, 200, t => { b.h = n360(t < 60 ? bt : Math.min(160, bt + (t - 60) * 8)); });
      return { layout: b.crew!.layout, main: b.sheets.main, jib: b.sheets.jib };
    };
    const one = sheets(1), two = sheets(2);
    expect(one.layout).toBe('mast');
    expect(Math.abs(one.main - two.main), 'main').toBeLessThan(3);
    expect(Math.abs(one.jib - two.jib), 'jib').toBeLessThan(3);
  }, 300_000);
  it('whoever trims the jib is at its winch (the Coordinator: the sheet goes to whoever is beside it): a crew member within reach of it fore and aft, the helm only with nobody else in the cockpit', () => {
    // (a race in light air, where both go forward of the winch and the bow hand to the mast, and in a breeze; and a beat
    // with them placed forward of the winch)
    const bad: string[] = [];
    const check = (b: ReturnType<typeof testBoat>, t: number) => {
      const c = b.crew!; c.people.forEach((a, i) => {
        if (a.job?.line !== 'jibsheet' || a.job.reach > 0) return;
        const inCockpit = c.layout !== 'foredeck' && c.spec.crew.length > 0;
        if (i === 0 ? inCockpit : Math.abs(a.z - JIB_WINCH_Z) > 0.5) bad.push(`t${t.toFixed(0)} p${i} at z ${a.z.toFixed(2)}, layout ${c.layout}, fore ${c.fore01}`);
      });
    };
    for (const kt of [6, 14]) {
      const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as never, 1);
      const ai = w.boats.filter(b => !b.isUser);
      while (w.t < 600) { w.step(DT); if (w.t > 0) for (const b of ai) check(b, w.t); }
    }
    const kt = 5, twa = beatAngle(kt), b = testBoat({ heading: 360 - twa, kt: 3, windKt: kt }); b.crew = newCrew(spec(2), 'S'); b.crew.place = { across: null, fore: 'fwd' };
    sail(b, 240, t => { b.h = 360 - twa; check(b, t); });
    expect(bad.slice(0, 5)).toEqual([]);
  }, 600_000);
});
