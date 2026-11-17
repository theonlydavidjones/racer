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
      // (and every berth planned a shove astern in this wind, up to three a harbor: on the sourced drag, 17 Nov 2026, even the
      // gentlest shove glides her 22 m in still air, and few berths have that much clear water astern; none of the spread
      // sample did)
      const shoved = all.filter(s => { const p = pushOffPlan(s, 270, kt); return p.kind === 'astern' && !p.noRoom; }).slice(0, 3);
      const pick = [...new Set([...Array.from({ length: k }, (_, i) => all[Math.floor(i * all.length / k)]), ...all.filter(s => NO_ASTERN.includes(s.id) || NO_ASTERN_WEST.includes(s.id)), ...shoved])];
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
    // (a property of every astern shove the plan makes, not a count of them: at least one case, so the test isn't empty. How
    // many berths get which plan is tests/pushoff-sweep.test.ts's to hold, exactly)
    expect(n).toBeGreaterThanOrEqual(1);
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
      const plan = pushOffPlan(slipById(id)!, ww.from, ww.kt), astern = plan.kind === 'astern', walked = plan.kind === 'swing' && !!plan.walk, went = w.pushOff(), msgs = w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg);
      // (walked out to the fairway instead: held to the bar any push-off is, the physics review, 15 Nov 2026: let go, the
      // jib up, touching nothing, her hull well out, with way on)
      let clean = '';
      if (went && walked) { // (walked out to the fairway, 8m2; a swing on the bow line is the older plan, its own tests')
        const sl = slipById(id)!, bumps: string[] = [], seen = (m: string) => { if (/Bump|Collision|hit /.test(m)) bumps.push(m); };
        for (let k = 0; k < 60 * 150 && (u.handled || u.pushing); k++) { w.step(DT); if (u.handled?.held) w.pushOff(); for (const e of w.drainEvents()) if (e.type === 'toast') seen(e.msg); }
        // (hands off, the jib up, over the first 15 m she sails from where she's let go: the clear run ahead of her the plan
        // promises, 10 m, and a little more; past it she's the helmsman's to steer on, as any boat leaving a slip)
        w.setSail('jib', true); let way = 9; const x0 = u.x, y0 = u.y;
        for (let k = 0; k < 60 * 60 && Math.hypot(u.x - x0, u.y - y0) < 15; k++) { w.step(DT); if (k > 60 * 5) way = Math.min(way, Math.hypot(u.vx, u.vy)); for (const e of w.drainEvents()) if (e.type === 'toast') seen(e.msg); }
        const out = Math.hypot(u.x - sl.p.x, u.y - sl.p.y);
        if (bumps.length || way <= 0.3 || out <= 12) clean = `${id} from ${from} at ${kt} kt: ${bumps[0] ?? ''} least way ${way.toFixed(2)} m/s, ${out.toFixed(0)} m out`;
      }
      return { astern, walked, went, noRoom: plan.kind === 'astern' && !!plan.noRoom, docked: !!u.docked, told: msgs.some(m => /^No room to push her off from this berth in this wind/.test(m)), clean };
    };
    // (each run, the berths kept fast and told, by name, and how many get out, exactly as today, 16 Nov 2026: a change to
    // the planner that moves a berth between them has to say why. Kept fast: planned astern and flagged, NO_ASTERN and
    // NO_ASTERN_WEST, or since 8m3 an astern shove whose coast would end with no clear water to sail off in. Got out:
    // walked out to the fairway, swung, or shoved off, and held to the bar any push-off is)
    const run = (ids: readonly string[], from: number, kt: number) => {
      const kept: string[] = []; let out = 0;
      for (const id of ids) {
        expect(SLIPS.some(s => s.id === id), id).toBe(true); expect(slipById(id)?.id).toBe(id);
        const r = tryIt(id, from, kt);
        if (!r.went) { expect(r.docked, id).toBe(true); expect(r.told, `${id} from ${from} at ${kt} kt: kept fast and told`).toBe(true); kept.push(id); }
        else { expect(r.astern && !r.noRoom ? true : !r.astern, id).toBe(true); expect(r.clean).toBe(''); out++; }
      }
      return { out, kept };
    };
    const twelve = [...NO_ASTERN, ...NO_ASTERN_WEST];
    const got = {
      west12: run(twelve, 270, 12), // (planned astern there, kept fast and told; or walked out to the fairway instead, 8m2, and got out)
      sw: run(NO_ASTERN_WEST, 225, 12), nw: run(NO_ASTERN_WEST, 315, 12), north: run(NO_ASTERN, 0, 12), // (the edges of the westerly's band, and the six in a northerly)
      light: run(NO_ASTERN_WEST, 270, 4), northWest: run(NO_ASTERN_WEST, 0, 12), // (the westerly's six, in light air and in a northerly: shoved off as from any berth where they're planned astern, or kept fast as any berth without clear water)
    };
    // (16 Nov 2026, with the walk-out turned by a hand on the dock (against the wind in about 8 kt and less), or on a slip line
    // round the cleat (held to 2 m of set in about 16 kt and less, set at her bare-rig drift beyond) as she comes round: the
    // physics review. Walked out to mid-fairway and turned there with nobody on the dock,
    // most of these got out before)
    expect(got).toEqual({
      west12: { out: 7, kept: ['south-beach:G88', 'richmond-yc:E31', 'richmond-yc:F2', 'horseshoe-bay:C22', 'west-harbor:507'] },
      sw: { out: 6, kept: [] }, nw: { out: 6, kept: [] },
      north: { out: 4, kept: ['south-beach:G88', 'richmond-yc:E31'] },
      light: { out: 5, kept: ['west-harbor:507'] }, northWest: { out: 6, kept: [] },
    });
  }, 300_000);
  it('a fresh breeze on her bow carries her on whatever the crew do: she\'s never shoved off astern into it (and were she, she\'d be let go with the way she has, their walk, never dead in the water)', () => {
    // (the physics review, 15 Nov 2026: gauged to her room, the shove came to nothing from 14 kt on her bow, and she lay
    // at the finger's end with no steerage for 10–40 s. Since the sourced sternway drag, 17 Nov 2026, an 18 kt breeze on
    // her bow carries even the gentlest shove 80 m and more, past any clear water astern, so no berth is shoved off astern
    // into it: walked out or kept fast instead (planPushOff, leastGlide). A tripwire on every tenth berth: should one come
    // back, it fails here, and it's still held to being let go with her way on)
    const shoved: string[] = [];
    for (const s of SLIPS.filter((_, i) => i % 10 === 0)) {
      if (Math.abs(((s.heading - 270 + 540) % 360) - 180) <= 60) continue; // (not the westerly's flagged berths)
      const p = pushOffPlan(s, s.heading, 18); if (p.kind !== 'astern' || p.noRoom) continue;
      shoved.push(s.id); if (shoved.length > 4) continue;
      const w = sail(s.id, s.heading, 18), u = w.user; for (let k = 0; k < 30; k++) w.step(DT);
      if (!w.pushOff() || u.handled?.plan.kind !== 'astern') continue;
      for (let k = 0; k < 60 * 60 && u.handled; k++) w.step(DT);
      expect(u.handled, s.id).toBeFalsy(); expect(u.astern ?? 0, `${s.id}: her way as she's let go`).toBeGreaterThan(0.43);
    }
    expect(shoved).toEqual([]);
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
  // (`back`: her heading swung round as the shove's glide begins, so she runs back into her own slip: the check that a shove
  // that collides is caught, not skipped)
  const glideAt = (s: (typeof SLIPS)[number], from: number, kt = 20, back = false): { went: number; want: number; hit: string } | null => {
    const w = sail(s.id, from, kt), u = w.user;
    w.pushOff(); const plan = u.handled?.plan; if (plan?.kind !== 'astern') return null;
    for (let j = 0; j < 60 * 60 && u.handled; j++) w.step(DT);
    if (back) u.h = (u.h + 180) % 360;
    const v0 = u.astern ?? 0, h = u.h, ww = (w as unknown as { windHere: (a: unknown, b: unknown, c: boolean) => { from: number; kt: number } }).windHere(u, u, false);
    // (gauged to stop COAST_SHORT short of the plan's clear water, unless the steerage floor is more: then that floor's glide)
    // (the glide in the wind along her line out, as the shove was gauged: World.windAstern)
    const meant = asternGlide(v0, h, ww.from, ww.kt, ASTERN_GLIDE_S, undefined, w.windAstern(u, h)).dist;
    const gauged = Math.max(plan.coast - COAST_SHORT, 0), floored = meant > gauged + 0.5;
    const want = floored ? meant : gauged; let went = 0;
    for (let t = 0; t < ASTERN_GLIDE_S; t += DT) { u.tiller = 0; u.h = h; const x = u.x, y = u.y; w.step(DT); const hu = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) }; went += Math.max(0, -((u.x - x) * hu.x + (u.y - y) * hu.y)); const hit = !berthClear(u, u.h, s) ? 'her hull on a dock or a moored boat' : (w.drainEvents().find(e => e.type === 'toast' && /Bump|Collision|hit /.test(e.msg)) as { msg: string } | undefined)?.msg; if (hit) return { went, want, hit: `${hit} at ${went.toFixed(1)} m` }; } // (stopped by a dock or a moored boat: a shove that collides, a failure, never skipped)
    return { went, want, hit: '' };
  };
  for (const [from, name, kt, wide] of [[0, 'northerly', 20, true], [90, 'easterly', 20, true], [0, 'northerly', 12, false]] as const) it(`in a ${kt} kt ${name}, she stops where the plan meant her to (a meter short of its clear water, or her steerage floor's glide): within 15%, stern first, the helm amidships`, () => {
    // (up to six berths a harbor, spread along its docks, as ever; in 20 kt, where since the walk-out and the shove are held
    // to the force a crew has and to clear water (16 Nov 2026) few are let go astern, every bow-in berth, for the cases there
    // are. Up to a dozen shoves she's let go from, only as a time limit. A property of every such shove: at least one case)
    const bad: string[] = []; let n = 0;
    const pick = wide ? SLIPS.filter(s => s.kind === 'bow-in' && [kt, kt - 4].some(k => { const p = pushOffPlan(s, from, k); return p.kind === 'astern' && !p.noRoom; }))
      : HARBORS.flatMap(H => { const all = slipsIn(H.id).filter(s => s.kind === 'bow-in'), k = Math.min(6, all.length); return Array.from({ length: k }, (_, i) => all[Math.floor(i * all.length / k)]); });
    for (const s of pick) {
      if (n >= 12) break;
      const g = glideAt(s, from, kt); if (!g) continue;
      n++; if (g.hit) bad.push(`${s.id}: shoved off astern into something: ${g.hit}`); else if (Math.abs(g.went - g.want) > 0.15 * g.want) bad.push(`${s.id}: sailed ${g.went.toFixed(1)} m against ${g.want.toFixed(1)}`);
    }
    // (in a 20 kt northerly, no berth anywhere has a shove she's let go from, 16 Nov 2026: one planned at the open wind's
    // lighter edge, and in the World's own wind at her slip she's walked out or kept fast instead. So the property can't be
    // tested there: none, exactly, a tripwire. The 12 kt northerly tests it in that wind. Should a 20 kt northerly shove
    // come back, this fails, and asks for it to be held to the glide as the rest are)
    // (17 Nov 2026, on the sourced sternway drag, Deep Physics: the planner looks along her whole glide, 30 m in still air
    // against 12, and four berths have a shove in a 20 kt northerly again: held to the glide as the rest are, as asked)
    expect(n).toBeGreaterThanOrEqual(1);
    expect(bad).toEqual([]);
  }, 600_000);
  it('a shove that collides fails the glide check, never skipped: her heading swung round, she runs back into her slip, and it says so', () => {
    // (the first berth of the 12 kt northerly's sample with a shove she's let go from)
    const pick = HARBORS.flatMap(H => { const all = slipsIn(H.id).filter(s => s.kind === 'bow-in'), k = Math.min(6, all.length); return Array.from({ length: k }, (_, i) => all[Math.floor(i * all.length / k)]); });
    let g: ReturnType<typeof glideAt> = null, id = '';
    for (const s of pick) { if (!glideAt(s, 0, 12)) continue; g = glideAt(s, 0, 12, true); id = s.id; break; }
    expect(g, 'a berth with a shove let go').not.toBeNull();
    expect(g!.hit, `${id}: run back into her slip`).not.toBe('');
  }, 600_000);
  // (Corinthian B16 in the northerly and Horseshoe Bay A27 in the easterly were each held apart for a time as known
  // failures: let go in a lee, the land's or the harbor's, and drifting out of it into more wind, B16 sailed 17.7 m
  // against a planned 14.0. The shove is now gauged to the wind along her line out and to leeward of it (World.windAstern),
  // and both are in the sweep above with the rest: B16 16.2 m against 16.0, A27 15.1 against 16.0)
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
