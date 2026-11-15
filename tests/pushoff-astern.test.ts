// Shoved off astern (geo/marina.ts pushOffPlan's `astern`), the owner, 14 Nov 2026: "push offs are still completely
// pathetic. I never get enough clearance. and please evaluate the reversing physics to be sure the boat is steering when
// being pushed back with no sail." The crew's shove carries her well out into the fairway, with way enough to steer her
// stern first, and the tiller turns her the right way going astern.
import { describe, expect, it } from 'vitest';
import { ASTERN_ENOUGH, ASTERN_RUN, HARBORS, ASTERN_GLIDE_S, COAST_SHORT, NO_ASTERN, NO_ASTERN_WEST, NO_WAY_OUT, pushOffPlan, SLIPS, berthClear, slipById, slipsIn } from '../src/geo/marina';
import { asternCoast, asternGlide } from '../src/boat/physics';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { ASTERN_SHOVE, DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { DAMAGE_V } from '../src/boat/damage';

/** Going astern faster than this, the rudder turns her about 1.3 deg/s and more (physics.ts): steerage way. An ESTIMATE. */
const STEERS = 0.3;
const wrap = (a: number) => ((a + 540) % 360) - 180;

describe('pushed off astern', () => {
  it('a save naming a berth since taken out of use (NO_WAY_OUT) finds her the nearest berth kept on the same dock', () => {
    for (const id of NO_WAY_OUT) { const s = slipById(id); expect(s, id).toBeTruthy(); expect(SLIPS).toContain(s); expect(s!.marina).toBe(id.split(':')[0]); }
  });
  it('in still air the full shove steers her 13 s and more, and glides her past ASTERN_ENOUGH', () => { const g = asternGlide(ASTERN_SHOVE, 0, 0, 0, ASTERN_GLIDE_S); expect(g.steerable).toBeGreaterThanOrEqual(13); expect(g.dist).toBeGreaterThan(ASTERN_ENOUGH); });
  it('the shove: her walk-back pace and a last push, about 0.64 m/s, which glides her about as far as the planner looks', () => {
    expect(ASTERN_SHOVE).toBeGreaterThan(0.55); expect(ASTERN_SHOVE).toBeLessThan(0.7);
    expect(asternCoast(ASTERN_SHOVE)).toBeGreaterThan(ASTERN_RUN - 3); expect(asternCoast(ASTERN_SHOVE)).toBeLessThanOrEqual(ASTERN_RUN);
  });

  for (const kt of [12, 4, 0]) it(`in a ${kt} kt westerly (270°), at every harbor, steered stern first as the plan says: well out of her slip, steerable for 10 s and more, touching nothing`, () => {
    const bad: string[] = []; let n = 0;
    for (const H of HARBORS) {
      const all = slipsIn(H.id).filter(s => s.kind === 'bow-in'); if (!all.length) continue;
      const k = Math.min(20, all.length); // (each berth once: no repeats in a small harbor; and the twelve kept from a shove astern, every run)
      const pick = [...new Set([...Array.from({ length: k }, (_, i) => all[Math.floor(i * all.length / k)]), ...all.filter(s => NO_ASTERN.includes(s.id) || NO_ASTERN_WEST.includes(s.id))])];
      for (const s of pick) {
        const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
        const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: Math.max(kt, 0.01), windDir: 270, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
        const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
        w.pushOff(); const plan = u.handled?.plan;
        if (plan?.kind !== 'astern') continue; n++;
        for (let k = 0; k < 60 * 60 && u.handled; k++) w.step(DT);
        // (her helmsman puts the tiller over as the plan says until her stern points down the fairway, then amidships)
        const h0 = u.h, f = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) };
        let steer = 0, went = 0, inside = '', hard = 0, best = -Infinity, bestEnd = -Infinity, touched = false;
        for (let t = 0; t < 60; t += DT) {
          u.tiller = plan.helm && Math.abs(wrap(u.h - h0)) < 85 ? plan.helm : 0;
          // (how far she's gone along her own line, stern first: not her drift to leeward)
          const x = u.x, y = u.y, s0 = Math.hypot(u.vx, u.vy), hu = { x: Math.sin(u.h * Math.PI / 180), y: Math.cos(u.h * Math.PI / 180) };
          w.step(DT); went += Math.max(0, -((u.x - x) * hu.x + (u.y - y) * hu.y)); // (stern first only: not drifting back ahead)
          // (a touch the sim stopped her for: a bump or collision told, or her way gone in one step, as travel() stops her against a dock)
          const bumped = w.drainEvents().some(e => e.type === 'toast' && /Bump|Collision|hit |touched|piles/.test(e.msg)) || (s0 > 0.1 && Math.hypot(u.vx, u.vy) < 0.3 * s0);
          if ((u.astern ?? 0) > STEERS) steer += DT;
          // (her middle past her finger's end, and her nearest end, bow or stern, along the slip's line: the furthest she gets
          // before she touches anything)
          const out = -((u.x - s.p.x) * f.x + (u.y - s.p.y) * f.y) - 0.45 * s.finger, end = out - 3.8 * Math.abs(Math.cos((u.h - s.heading) * Math.PI / 180));
          const clear = berthClear(u, u.h, s) && !bumped;
          if (!clear) {
            // (in the water the plan found clear, nothing, ever; past it, steering her on down the fairway or getting sail on her is
            // the helmsman's, as on a real boat (the Coordinator, 14 Nov 2026), and whatever she touches she touches at a crawl:
            // under DAMAGE_V.scrape, 0.5 m/s, the shared damage measure's scrape, an ESTIMATE (boat/damage.ts): never more than a scrape)
            if (went <= plan.coast) inside ||= `${t.toFixed(1)} s, ${went.toFixed(1)} m of ${plan.coast} clear`;
            else hard = Math.max(hard, bumped ? s0 : Math.hypot(u.vx, u.vy)); // (a bump: her speed the step before)
            touched = true;
          }
          if (!touched && out > best) { best = out; bestEnd = end; }
        }
        // (her whole hull 2 m clear of the slip and more, her middle 7.6 m out: half the narrowest fairway California's
        // marina guidelines allow, 1.75 berth lengths (DBW, Layout and Design Guidelines for Marina Berthing Facilities, 2005, Table
        // B-2; https://demo2.parks.ca.gov/pages/28702/files/Guide05.pdf): 6.7 m for her 7.64 m, with a margin. Every berth; and
        // steerable 10 s, every berth)
        if (best < 7.6 || bestEnd < 2) bad.push(`${s.id}: only ${best.toFixed(1)} m out, her nearest end ${bestEnd.toFixed(1)} m`);
        if (steer < 10) bad.push(`${s.id}: steerable only ${steer.toFixed(1)} s`);
        if (inside) bad.push(`${s.id}: touched in the water the plan found clear, at ${inside}`);
        if (hard >= DAMAGE_V.scrape) bad.push(`${s.id}: touched at ${hard.toFixed(2)} m/s past it`);
      }
    }
    expect(n).toBeGreaterThanOrEqual(kt ? 20 : 5); // (in a calm the crew can swing her out from most: few are shoved off astern)
    expect(bad).toEqual([]);
  }, 600_000);


  // (the berths she can't be shoved off astern from in a westerly, kept: the owner, 14 Nov 2026)
  const sail = (id: string, from: number, kt: number) => {
    const s = slipById(id)!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: from, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    return new World(COURSES[0], S, 1, { freeSail: true });
  };
  it('the twelve kept from a shove astern: each a berth a save loads her in; kept fast where the plan would shove her off astern (all twelve in a 12 kt westerly, the six in a northerly too), and got out otherwise', () => {
    expect(NO_ASTERN).toHaveLength(6); expect(NO_ASTERN_WEST).toHaveLength(6);
    const tryIt = (id: string, from: number, kt: number) => {
      const w = sail(id, from, kt), u = w.user; for (let k = 0; k < 30; k++) w.step(DT); w.drainEvents();
      expect(u.docked?.slip, `${id}: a save naming it puts her there`).toBe(id);
      const ww = (w as unknown as { windHere: (a: unknown, b: unknown, c: boolean) => { from: number; kt: number } }).windHere(u, u, false);
      const astern = pushOffPlan(slipById(id)!, ww.from, ww.kt).kind === 'astern', went = w.pushOff(), msgs = w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg);
      return { astern, went, docked: !!u.docked, told: msgs.some(m => /^No room to push her off from this berth in this wind/.test(m)) };
    };
    for (const id of [...NO_ASTERN, ...NO_ASTERN_WEST]) {
      expect(SLIPS.some(s => s.id === id), id).toBe(true); expect(slipById(id)?.id).toBe(id);
      const r = tryIt(id, 270, 12); // (every one of them planned astern there: the sweep)
      expect(r.astern, `${id}: astern in a 12 kt westerly`).toBe(true); expect(r.went, id).toBe(false); expect(r.docked, id).toBe(true); expect(r.told, id).toBe(true);
    }
    // (the edges of the westerly's band, and the six in a northerly: kept fast where the plan's astern, got out where it isn't)
    for (const [ids, from, kt] of [[NO_ASTERN_WEST, 225, 12], [NO_ASTERN_WEST, 315, 12], [NO_ASTERN, 0, 12]] as const) for (const id of ids) {
      const r = tryIt(id, from, kt); expect(r.went, `${id} from ${from}`).toBe(!r.astern); if (r.astern) expect(r.told, id).toBe(true);
    }
    // (the westerly's six, in light air and in a northerly: shoved off as from any berth, where they're planned astern)
    let out = 0;
    for (const [from, kt] of [[270, 4], [0, 12]] as const) for (const id of NO_ASTERN_WEST) { const r = tryIt(id, from, kt); expect(r.went, `${id} from ${from} at ${kt} kt`).toBe(true); if (r.went) out++; }
    expect(out).toBe(12);
  }, 300_000);
  it('a fresh breeze on her bow carries her on whatever the crew do: she\'s let go with the way she has, their walk, never dead in the water', () => {
    // (the physics review, 15 Nov 2026: gauged to her room, the shove came to nothing from 14 kt on her bow, and she lay
    // at the finger's end with no steerage for 10–40 s)
    let n = 0;
    for (const s of SLIPS) {
      if (n >= 4) break;
      if (Math.abs(((s.heading - 270 + 540) % 360) - 180) <= 60) continue; // (not the westerly's flagged berths)
      const w = sail(s.id, s.heading, 18), u = w.user; for (let k = 0; k < 30; k++) w.step(DT);
      if (!w.pushOff() || u.handled?.plan.kind !== 'astern') continue;
      for (let k = 0; k < 60 * 60 && u.handled; k++) w.step(DT);
      expect(u.handled, s.id).toBeFalsy(); expect(u.astern ?? 0, `${s.id}: her way as she's let go`).toBeGreaterThan(0.43); n++;
    }
    expect(n).toBeGreaterThanOrEqual(2);
  }, 120_000);
  it('kept fast with a motor on the bracket, the one line says to motor out', () => {
    const id = [...NO_ASTERN, ...NO_ASTERN_WEST].find(i => { const w = sail(i, 270, 12); for (let k = 0; k < 30; k++) w.step(DT); return !w.pushOff(); })!;
    expect(id, 'a berth she is kept fast in').toBeTruthy();
    const w = sail(id, 270, 12), u = w.user; for (let k = 0; k < 30; k++) w.step(DT); w.drainEvents();
    u.motor = { hp: 3.5, down: false, running: false, gear: 'N', throttle: 0 };
    expect(w.pushOff()).toBe(false);
    const msgs = w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg);
    expect(msgs).toHaveLength(1); expect(msgs[0]).toBe('No room to push her off from this berth in this wind: motor out, or wait for the wind to change.');
  });
  // (the planner's and the shove's glide, from physics.ts asternGlide, against what she sails: a breeze along her line)
  /** One berth's glide in 20 kt from `from`: null if she isn't shoved astern or is stopped by a dock or a boat (no glide to compare); else how far she sailed and how far the plan meant, m. */
  const glideAt = (s: (typeof SLIPS)[number], from: number): { went: number; want: number } | null => {
    const w = sail(s.id, from, 20), u = w.user;
    w.pushOff(); const plan = u.handled?.plan; if (plan?.kind !== 'astern') return null;
    for (let j = 0; j < 60 * 60 && u.handled; j++) w.step(DT);
    const v0 = u.astern ?? 0, h = u.h, ww = (w as unknown as { windHere: (a: unknown, b: unknown, c: boolean) => { from: number; kt: number } }).windHere(u, u, false);
    // (gauged to stop COAST_SHORT short of the plan's clear water, unless the steerage floor is more: then that floor's glide)
    const gauged = Math.max(plan.coast - COAST_SHORT, 0), floored = asternGlide(v0, h, ww.from, ww.kt, ASTERN_GLIDE_S).dist > gauged + 0.5;
    const want = floored ? asternGlide(v0, h, ww.from, ww.kt, ASTERN_GLIDE_S).dist : gauged; let went = 0;
    for (let t = 0; t < ASTERN_GLIDE_S; t += DT) { u.tiller = 0; u.h = h; const x = u.x, y = u.y; w.step(DT); const hu = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) }; went += Math.max(0, -((u.x - x) * hu.x + (u.y - y) * hu.y)); if (!berthClear(u, u.h, s)) return null; }
    return { went, want };
  };
  /** The one run known to be off (the Coordinator, 15 Nov 2026): held as a failing case of its own, below, not let through. */
  const LEE_EDGE = { id: 'horseshoe-bay:A27', from: 90 };
  for (const [from, name] of [[0, 'northerly'], [90, 'easterly']] as const) it(`in a 20 kt ${name}, she stops where the plan meant her to (a meter short of its clear water, or her steerage floor's glide): within 15%, stern first, the helm amidships`, () => {
    const bad: string[] = []; let n = 0;
    for (const H of HARBORS) {
      const all = slipsIn(H.id).filter(s => s.kind === 'bow-in'); if (!all.length) continue;
      const k = Math.min(6, all.length);
      for (let i = 0; i < k; i++) {
        const s = all[Math.floor(i * all.length / k)]; if (s.id === LEE_EDGE.id && from === LEE_EDGE.from) continue;
        const g = glideAt(s, from); if (!g) continue;
        n++; if (Math.abs(g.went - g.want) > 0.15 * g.want) bad.push(`${s.id}: sailed ${g.went.toFixed(1)} m against ${g.want.toFixed(1)}`);
      }
    }
    expect(n).toBeGreaterThanOrEqual(3); expect(bad).toEqual([]);
  }, 600_000);
  // (a known failure, to come right when the planner allows for the lee's edge, ROADMAP: she's let go in 5 kt in the
  // harbor's lee and drifts out of it into 9 kt within 20 s; the end of her planned line is still in the lee. 15.0 m
  // sailed against 13.0. it.fails: it errors the day it passes, and then joins the sweep above)
  it('Horseshoe Bay A27 in a 20 kt easterly: the known case is still the case (shoved astern, gliding free, 15–25% further than planned)', () => {
    // (so the it.fails below can't go green for another reason: no astern plan, a touch, the berth gone)
    const g = glideAt(slipById(LEE_EDGE.id)!, LEE_EDGE.from); expect(g, 'she is shoved astern and glides free').toBeTruthy();
    const over = (g!.went - g!.want) / g!.want; expect(over).toBeGreaterThan(0.15); expect(over).toBeLessThan(0.25);
  }, 120_000);
  it.fails('Horseshoe Bay A27 in a 20 kt easterly stops where the plan meant her to, within 15%: the wind she drifts into off the harbor\'s lee isn\'t the wind she was let go in', () => {
    const s = slipById(LEE_EDGE.id)!; expect(s.id).toBe(LEE_EDGE.id);
    const g = glideAt(s, LEE_EDGE.from); expect(g, 'she is shoved astern and glides free').toBeTruthy();
    expect(Math.abs(g!.went - g!.want)).toBeLessThanOrEqual(0.15 * g!.want);
  }, 120_000);
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
