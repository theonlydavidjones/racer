import { describe, expect, it } from 'vitest';
import { newCrew } from '../src/boat/crewPhys';
import { polar } from '../src/boat/polar';
import { settleTrim } from '../src/boat/physics';
import { KT } from '../src/core/math';
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
});
