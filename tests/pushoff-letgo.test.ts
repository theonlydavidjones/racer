// Every West Harbor slip where, in a 14 kt westerly, she's held head to wind for the main and then let go: hands off,
// the main alone, she must gather way clear of the docks. Kept out of test:fast (it sails every one).
import { describe, expect, it } from 'vitest';
import { SLIPS, pushOffPlan } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

describe('let go with the main alone, hands off (Marinas, #78)', () => {
  it('from every West Harbor slip held head to wind in 14 kt from 270, she sails her first 18 m without touching anything', () => {
    const held = SLIPS.filter(s => s.marina === 'west-harbor' && (() => { const p = pushOffPlan(s, 270, 14); return p?.kind === 'swing' && !!p.hold; })());
    // (16 today, 14 Nov 2026, from over 20: a hold is now taken only where she's clear across the whole 20 degrees she may
    // follow the wind while held, and has room ahead let go from either end of it (marina.ts releaseClear, letGoClear: the
    // physics review). No fewer than that)
    expect(held.length).toBeGreaterThanOrEqual(16);
    const bumps: string[] = [];
    for (const s of held) {
      const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
      const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, windDir: 270, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
      w.pushOff();
      for (let i = 0; i < 60 * 150 && !u.handled?.held; i++) w.step(DT);
      if (!u.handled?.held) { bumps.push(`${s.id}: never held head to wind`); continue; }
      w.setSail('main', true); for (let i = 0; i < 60 * 40; i++) w.step(DT);
      w.pushOff();
      // (a bump: her way gone at once, as travel() stops her against a dock)
      let run = 0;
      for (let i = 0; i < 60 * 60 && run < 18; i++) {
        const v0 = u.v; w.step(DT); run += Math.hypot(u.v, u.sway ?? 0) * DT;
        if (v0 > 0.3 && u.v < 0.4 * v0) { bumps.push(`${s.id}: touched after ${run.toFixed(1)} m`); break; }
      }
    }
    expect(bumps).toEqual([]);
  }, 300_000);
});
