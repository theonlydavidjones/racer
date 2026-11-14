// Shoved off astern (geo/marina.ts pushOffPlan's `astern`), the owner, 14 Nov 2026: "push offs are still completely
// pathetic. I never get enough clearance. and please evaluate the reversing physics to be sure the boat is steering when
// being pushed back with no sail." The crew's shove carries her well out into the fairway, with way enough to steer her
// stern first, and the tiller turns her the right way going astern.
import { describe, expect, it } from 'vitest';
import { ASTERN_RUN, HARBORS, slipsIn } from '../src/geo/marina';
import { asternCoast } from '../src/boat/physics';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { ASTERN_SHOVE, DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

/** Going astern faster than this, the rudder turns her about 1.3 deg/s and more (physics.ts): steerage way. An ESTIMATE. */
const STEERS = 0.3;
const wrap = (a: number) => ((a + 540) % 360) - 180;

describe('pushed off astern', () => {
  it('the shove: her walk-back pace and a last push, about 0.63 m/s, which coasts her about the run the planner clears', () => {
    expect(ASTERN_SHOVE).toBeGreaterThan(0.55); expect(ASTERN_SHOVE).toBeLessThan(0.7);
    expect(asternCoast(ASTERN_SHOVE)).toBeGreaterThan(ASTERN_RUN - 3); expect(asternCoast(ASTERN_SHOVE)).toBeLessThanOrEqual(ASTERN_RUN);
  });

  for (const kt of [12, 4]) it(`in a ${kt} kt westerly, at every harbor, steered stern first as the plan says: well out of her slip, steerable for 10 s and more, touching nothing`, () => {
    const bad: string[] = []; let n = 0;
    for (const H of HARBORS) {
      const all = slipsIn(H.id).filter(s => s.kind === 'bow-in'); if (!all.length) continue;
      for (let i = 0; i < 6; i++) {
        const s = all[Math.floor(i * all.length / 6)];
        const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
        const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: 270, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
        const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
        w.pushOff(); const plan = u.handled?.plan;
        if (plan?.kind !== 'astern') continue; n++;
        for (let k = 0; k < 60 * 60 && u.handled; k++) w.step(DT);
        // (her helmsman puts the tiller over as the plan says until her stern points down the fairway, then amidships)
        const h0 = u.h; let steer = 0, bump = false;
        for (let t = 0; t < 60; t += DT) {
          u.tiller = plan.helm && Math.abs(wrap(u.h - h0)) < 85 ? plan.helm : 0;
          const v0 = u.astern ?? 0; w.step(DT); const v1 = u.astern ?? 0;
          if (v1 > STEERS) steer += DT;
          if (v0 > 0.2 && v1 < 0.3 * v0) bump = true; // (her way gone at once: against something)
        }
        const f = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) };
        const out = -((u.x - s.p.x) * f.x + (u.y - s.p.y) * f.y) - 0.45 * s.finger; // (her middle past her finger's end)
        // (her hull clear of the slip by half a length and more, her middle 7.6 m out: half a fairway of 1.5–1.75 boat lengths,
        // the marina-design range found so far, unverified, 14 Nov 2026; and where there's the room for the full shove, steerable 10 s)
        if (out < 7.6) bad.push(`${s.id}: only ${out.toFixed(1)} m out`);
        if (plan.coast >= ASTERN_RUN && steer < 10) bad.push(`${s.id}: steerable only ${steer.toFixed(1)} s`);
        if (bump) bad.push(`${s.id}: touched`);
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
    expect(bad).toEqual([]);
  }, 600_000);

  for (const til of [1, -1]) it(`the tiller going astern at 0.5 m/s with no sail up, pushed to ${til > 0 ? 'starboard' : 'port'}: her bow goes that way (the rudder works backwards), by 10 deg and more in 10 s`, () => {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 0.5, mode: 'sail', tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let k = 0; k < 30; k++) w.step(DT);
    Object.assign(u, { docked: undefined, h: 0, v: 0, astern: 0.5, sway: 0, turnRate: 0, steer: 0, tiller: til, turnTarget: null });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    for (let t = 0; t < 10; t += DT) w.step(DT);
    expect(wrap(u.h) * til).toBeGreaterThanOrEqual(10);
  });
});
