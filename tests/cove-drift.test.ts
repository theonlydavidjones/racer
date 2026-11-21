// Leaving a Gashouse Cove slip under bare poles with the wind on the beam (the owner, 13 Nov 2026: "she seems to just
// drift to windward"): on the real tide, pushed off with no sails up and the tiller amidships, she must go to leeward.
// The stream ran inside the basin (0.30-0.35 kt setting 085 on 14 Nov 2026, as much as her leeway under bare poles),
// so with the wind from the east it cancelled her drift or beat it. The basin's still water (environment/current.ts
// basinCalm) takes it to a few hundredths of a knot. (Repro: Deep Physics.)
import { describe, expect, it } from 'vitest';
import { SLIPS } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { KT, n360 } from '../src/core/math';

describe('pushed off from a Gashouse Cove slip under bare poles, on the real tide', () => {
  it('with the wind on either beam she drifts to leeward, never to windward, and the stream in the basin is next to nothing', () => {
    const slips = SLIPS.filter(s => s.marina === 'gashouse-cove' && s.kind === 'bow-in').filter((_, i) => i % 23 === 5).slice(0, 6);
    expect(slips.length).toBeGreaterThan(3);
    let freed = 0;
    for (const s of slips) for (const beam of [-90, 90]) {
      const from = n360(s.heading + beam), boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
      const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, windDir: from, windTurn: 0, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14' } as Settings;
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
      u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
      w.pushOff();
      // until her crew have let her go (a slip she's swung head to wind from and held is not this test's)
      let i = 0; for (; i < 60 * 60 && (u.handled || u.docked); i++) { u.steer = 0; u.tiller = 0; w.step(DT); }
      if (u.handled || u.docked) continue;
      freed++;
      expect(Math.hypot(u.cur.x, u.cur.y) / KT, `${s.id}: the stream at her in the basin (kt)`).toBeLessThan(0.1);
      const x0 = u.x, y0 = u.y; let down = 0, worst = 0;
      for (let k = 0; k < 60 * 60; k++) {
        u.steer = 0; u.tiller = 0; w.step(DT);
        const a = u.ww.from * Math.PI / 180; // (the wind on the water at her: it blows toward −(sin, cos) of where it's from)
        down = -((u.x - x0) * Math.sin(a) + (u.y - y0) * Math.cos(a)); worst = Math.min(worst, down);
      }
      expect(worst, `${s.id}, wind from ${from.toFixed(0)}: never to windward`).toBeGreaterThan(-0.3);
      expect(down, `${s.id}, wind from ${from.toFixed(0)}: to leeward a minute on (m)`).toBeGreaterThan(3);
    }
    expect(freed).toBeGreaterThan(4);
  }, 300_000);
});
