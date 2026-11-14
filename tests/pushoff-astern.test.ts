// Shoved off astern (geo/marina.ts pushOffPlan's `astern`), the owner, 14 Nov 2026: "push offs are still completely
// pathetic. I never get enough clearance. and please evaluate the reversing physics to be sure the boat is steering when
// being pushed back with no sail." The crew's shove carries her well out into the fairway, with way enough to steer her
// stern first, and the tiller turns her the right way going astern.
import { describe, expect, it } from 'vitest';
import { ASTERN_ENOUGH, ASTERN_RUN, HARBORS, berthClear, slipsIn } from '../src/geo/marina';
import { asternCoast } from '../src/boat/physics';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { ASTERN_SHOVE, ASTERN_STEERAGE, DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { DAMAGE_V } from '../src/boat/damage';

/** Going astern faster than this, the rudder turns her about 1.3 deg/s and more (physics.ts): steerage way. An ESTIMATE. */
const STEERS = 0.3;
const wrap = (a: number) => ((a + 540) % 360) - 180;

describe('pushed off astern', () => {
  it('never gentler than steerage way', () => { expect(asternCoast(ASTERN_STEERAGE)).toBeGreaterThan(ASTERN_ENOUGH); });
  it('the shove: her walk-back pace and a last push, about 0.63 m/s, which glides her about as far as the planner looks', () => {
    expect(ASTERN_SHOVE).toBeGreaterThan(0.55); expect(ASTERN_SHOVE).toBeLessThan(0.7);
    expect(asternCoast(ASTERN_SHOVE)).toBeGreaterThan(ASTERN_RUN - 3); expect(asternCoast(ASTERN_SHOVE)).toBeLessThanOrEqual(ASTERN_RUN);
  });

  for (const kt of [12, 4, 0]) it(`in a ${kt} kt westerly, at every harbor, steered stern first as the plan says: well out of her slip, steerable for 10 s and more, touching nothing`, () => {
    const bad: string[] = []; let n = 0;
    for (const H of HARBORS) {
      const all = slipsIn(H.id).filter(s => s.kind === 'bow-in'); if (!all.length) continue;
      for (let i = 0; i < 12; i++) {
        const s = all[Math.floor(i * all.length / 12)];
        const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
        const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: Math.max(kt, 0.01), windDir: 270, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
        const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
        w.pushOff(); const plan = u.handled?.plan;
        if (plan?.kind !== 'astern') continue; n++;
        for (let k = 0; k < 60 * 60 && u.handled; k++) w.step(DT);
        // (her helmsman puts the tiller over as the plan says until her stern points down the fairway, then amidships)
        const h0 = u.h; let steer = 0, bump = false, went = 0, hard = 0;
        for (let t = 0; t < 60; t += DT) {
          u.tiller = plan.helm && Math.abs(wrap(u.h - h0)) < 85 ? plan.helm : 0;
          const v0 = u.astern ?? 0, x = u.x, y = u.y; w.step(DT); const v1 = u.astern ?? 0; went += Math.hypot(u.x - x, u.y - y);
          if (v1 > STEERS) steer += DT;
          // (her hull clear, as the planner sees it, wherever she goes in the water it found clear before her crew has sail on her)
          if (t <= 20 && went <= plan.coast && !berthClear(u, u.h, s)) bump = true;
          // (after that, steering her on down the fairway or getting sail on her is the helmsman's, as on a real boat (the
          // Coordinator, 14 Nov 2026); whatever she touches then, she touches at a crawl: under DAMAGE_V.scrape, 0.5 m/s, the
          // shared damage measure's scrape (an ESTIMATE, boat/damage.ts), so never more than a scrape)
          else if (t > 20 && !berthClear(u, u.h, s)) hard = Math.max(hard, Math.hypot(u.vx, u.vy));
          if (v0 > 0.2 && v1 < 0.3 * v0 && went <= plan.coast) bump = true; // (her way gone at once: against something)
        }
        const f = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) };
        // (her middle past her finger's end, and her nearest end, bow or stern, along the slip's line)
        const out = -((u.x - s.p.x) * f.x + (u.y - s.p.y) * f.y) - 0.45 * s.finger, end = out - 3.8 * Math.abs(Math.cos((u.h - s.heading) * Math.PI / 180));
        // (her whole hull 2 m clear of the slip and more, her middle 7.6 m out: half a fairway of 1.5–1.75 boat lengths,
        // the marina-design range found so far, unverified, 14 Nov 2026; steerable 10 s, everywhere; and in the water the plan
        // found clear, touching nothing: past it, she's the helmsman's to steer on down the fairway)
        if (plan.coast >= 8 && (out < 7.6 || end < 2)) bad.push(`${s.id}: only ${out.toFixed(1)} m out, her nearest end ${end.toFixed(1)} m`);
        if (steer < 10) bad.push(`${s.id}: steerable only ${steer.toFixed(1)} s`);
        if (bump) bad.push(`${s.id}: touched`);
        if (hard >= DAMAGE_V.scrape) bad.push(`${s.id}: touched at ${hard.toFixed(2)} m/s after 20 s`);
      }
    }
    expect(n).toBeGreaterThanOrEqual(kt ? 20 : 5); // (in a calm the crew can swing her out from most: few are shoved off astern)
    expect(bad).toEqual([]);
  }, 600_000);

  // (headings in a westerly: the wind abeam, and her bow within a beat of it, where a held tiller once counted as sculling: the physics review)
  for (const h0 of [0, 270, 300, 230]) for (const til of [1, -1]) it(`the tiller going astern at 0.5 m/s with no sail up, heading ${h0} in a westerly, pushed to ${til > 0 ? 'starboard' : 'port'}: her bow goes that way (the rudder works backwards), by 10 deg and more in 10 s`, () => {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 8, windDir: 270, mode: 'sail', tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let k = 0; k < 30; k++) w.step(DT);
    Object.assign(u, { docked: undefined, h: h0, v: 0, astern: 0.5, sway: 0, turnRate: 0, steer: 0, tiller: til, turnTarget: null });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    for (let t = 0; t < 10; t += DT) w.step(DT);
    expect(wrap(u.h - h0) * til).toBeGreaterThanOrEqual(10);
  });
});
