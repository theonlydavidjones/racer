import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

/**
 * A probe for Deep Physics (waves phase 2): stopped beam-on in the Gate's heaviest chop, sails struck, how much does she
 * roll? The wave slope across her goes into the heel balance (seaway.ts waveForces, physics.ts rollTo); her roll period
 * (~3.5 s, balance.ts ROLL) sits near the chop's, and at rest the damping is only ROLL.zetaRest (0.079), so the roll is
 * near resonance: 13° s.d. measured (13 Nov 2026), against 0 with the waves' roll off. Skipped until the bare-poles roll
 * damping (Ikeda's viscous and bilge terms) and the effective-slope factor for her keel are settled: then set the bound.
 */
describe('rolling at rest, beam-on, sails down (probe)', () => {
  it.skip('her roll in the Gate\'s ×2 chop, struck sails, lying as she will', () => {
    const run = (waves: boolean) => {
      const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'gate', sailTo: '', tideDate: '2026-11-14', windKt: 22, chop: 2, current: 'none', traffic: 0 } as unknown as Settings, 1, { freeSail: true });
      const u = w.user; u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false } as never;
      let h1 = 0, h2 = 0, n = 0, max = 0;
      for (let i = 0; i < 60 * 150; i++) {
        w.step(DT); if (!waves) u.waveRoll = 0;
        if (i > 60 * 50) { h1 += u.heel; h2 += u.heel * u.heel; n++; max = Math.max(max, Math.abs(u.heel)); }
      }
      const m = h1 / n; return { sd: Math.sqrt(h2 / n - m * m), max, hs: u.sea.hsW, hsS: u.sea.hsS };
    };
    const on = run(true), off = run(false);
    console.log(`roll at rest: s.d. ${on.sd.toFixed(1)}° (max ${on.max.toFixed(1)}°) with the waves, ${off.sd.toFixed(1)}° without; chop ${on.hs.toFixed(2)} m, swell ${on.hsS.toFixed(2)} m`);
    expect(on.sd).toBeLessThan(99); // (the bound to set once the damping is sourced)
  }, 120_000);
});
