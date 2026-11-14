import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { worthTogether } from '../src/boat/controls';
import { beatAngle } from '../src/boat/polar';
import { testBoat, sail } from './helpers/testBoat';

// The cabin-top lines worth a trip together, though none is alone (controls.ts worthTogether): a placed crew's lull,
// where six lines each worth 0.02 to 0.2% were left though together they mattered (the physics review).
describe('Lines worth moving together (controls.ts worthTogether)', () => {
  it('only cabin-top lines, each worth something but not a trip alone, and together a trip at least; and there are some', () => {
    const skill = 0.6, minGain = 0.001 + 0.003 * (1 - skill), TOP = ['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard'];
    const crew = { helm: { ...DEFAULT_CREW.helm, skill }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill })) };
    const b = testBoat({ heading: 360 - beatAngle(20), kt: 5, windKt: 20 }); b.crew = newCrew(crew, 'S');
    sail(b, 60); b.crew.place = { across: 'hike', fore: null }; b.ww.kt = 7;
    const bad: string[] = []; let sets = 0, seen: object | undefined;
    sail(b, 90, t => {
      const W = b.crewWorth as Record<string, number> | undefined; if (!W || W === seen) return; seen = W;
      const set = worthTogether(W); if (!set.size) return; sets++;
      let sum = 0;
      for (const k of set) { const w = W[k]; sum += w; if (!TOP.includes(k) || !(w > 0 && w < minGain)) bad.push(`t${t.toFixed(0)} ${k} ${w}`); }
      if (sum < minGain) bad.push(`t${t.toFixed(0)} the set's own worth ${sum.toFixed(4)} under ${minGain}`);
    });
    expect(bad.slice(0, 5)).toEqual([]);
    expect(sets).toBeGreaterThan(0);
  }, 120_000);
});
