import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { segPt } from '../src/core/math';
import { GIVES_WAY, ROUTES, SERVICES, Traffic, VESSEL, vesselHull, type Moving, type Vessel } from '../src/sim/traffic';
import { bow, stern } from '../src/boat/boat';

/**
 * The small vessels give way to a sailing boat (Inland Rules, 33 CFR 83.18(a)(iv)), on their routes, by slowing or
 * stopping (Rule 8(e)), and the ships in the lanes don't (Rule 9). The owner's race, 18 Nov 2026: Course 2 (Seaweed Soup, 7 Nov 2026 at 13:35), making half a knot over
 * the ground into the ebb, run down by the Bay cruise boat, whose route runs west straight down the course from mark 6
 * (sim/traffic.ts) and which, its place a function of the clock, never altered course for anyone: wrecked, RET.
 */
const SEED = 2434542977;
const KT = 0.5144;
const mark6 = LL(37.811667, -122.43);
/** The first time (s since midnight UTC) from `fromT` that a Bay cruise boat is heading west past mark 6, on its route along the course. */
function tourAtMark6(fromT: number): number {
  const tr = new Traffic(true, SEED);
  for (let T = fromT; T < fromT + 4 * 3600; T += 2) {
    for (const v of tr.vessels(T)) if (v.kind === 'tour' && v.moving && v.h > 240 && v.h < 300 && Math.abs(v.x - mark6.x) < 15 && Math.abs(v.y - mark6.y) < 200) return T;
  }
  throw new Error('no tour boat past mark 6');
}
const hullGap = (b: { x: number; y: number; h: number }, v: Vessel) => {
  const hv = vesselHull(v);
  return Math.min(segPt(bow(b as any), hv.a, hv.b), segPt(stern(b as any), hv.a, hv.b), segPt(b, hv.a, hv.b)) - hv.r;
};
/**
 * A race on Course 2 on the owner's day, started so that a Bay cruise boat comes west past mark 6 a few minutes in; your
 * boat held 500 m ahead of it on its route, heading east into the ebb at `kt` over the ground (the owner's half knot), or
 * stopped. Returns the closest the cruise boat's hull came to hers, and whether she was hit.
 */
function encounter(kt: number) {
  const T = tourAtMark6(13 * 3600 + 35 * 60 + 8 * 3600); // (13:35 PST is 21:35 UTC)
  const startMin = Math.floor((T - 600) / 60) - 8 * 60; // (the start ten minutes before she's at mark 6, local time)
  const tideTime = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
  const s = { ...DEFAULT_SETTINGS, course: 'ss2', tideDate: '2026-11-07', tideTime, windKind: 'west', windKt: 7, current: 'real', traffic: 1, opponents: ['stock:1'], fleet: 1 } as Settings;
  const w = new World(ss2 as unknown as CourseFile, s, SEED);
  const tour = () => w.vessels.filter(v => v.kind === 'tour').sort((a, b) => Math.hypot(a.x - mark6.x, a.y - mark6.y) - Math.hypot(b.x - mark6.x, b.y - mark6.y))[0];
  while (w.trafficT < T - 100) w.step(DT);
  const u = w.user, v0 = tour(), ux = Math.sin(v0.h * Math.PI / 180), uy = Math.cos(v0.h * Math.PI / 180);
  const p = { x: v0.x + ux * 500, y: v0.y + uy * 500 }, h = 81, vx = Math.sin(h * Math.PI / 180) * kt * KT, vy = Math.cos(h * Math.PI / 180) * kt * KT;
  let least = Infinity, gave = false;
  for (let i = 0; i < 60 * 240; i++) {
    // (held where she is, making `kt` over the ground on 081: all the sim's other steps go on round her)
    u.x = p.x; u.y = p.y; u.h = h; u.vx = vx; u.vy = vy; u.v = kt * KT; u.turnRate = 0; u.desired = h;
    w.step(DT); p.x += vx * DT; p.y += vy * DT;
    least = Math.min(least, hullGap(u, tour()));
    if (w.traffic.givingWay()) gave = true;
  }
  return { least, gave, wrecked: !!u.wrecked, w };
}

/** The westbound Bay cruise boat on the straight leg east of mark 6 (route 37.8128 N, 122.4140 → 122.4300 W, 270°). */
const LEG_E = LL(37.8128, -122.4140);
function tourOnLeg(tr: Traffic, fromT: number): { T: number; i: number } {
  for (let T = fromT; T < fromT + 4 * 3600; T += 1) {
    const vs = tr.vessels(T);
    for (let i = 0; i < vs.length; i++) { const v = vs[i]; if (v.kind === 'tour' && v.moving && Math.abs(v.h - 270) < 1 && Math.abs(v.x - LEG_E.x) < 8 && Math.abs(v.y - LEG_E.y) < 8) return { T, i }; }
  }
  throw new Error('no tour boat on the leg');
}
/**
 * One boat (nobody steering clear for the vessel: straight on, or as `steer` turns her) against the give-way vessel `i`
 * from time T, for `dur` s at 60 Hz: the closest her hull came to the boat's middle (m), and her slowest speed (a share
 * of her service speed).
 */
function drive(tr: Traffic, i: number, T: number, boat: Moving, dur: number, skip?: (b: Moving) => boolean, steer?: (b: Moving, t: number) => void) {
  let least = Infinity, minK = 1;
  const b = { ...boat };
  for (let t = T; t < T + dur; t += DT) {
    steer?.(b, t - T);
    const v = tr.vessels(t, [b], DT, skip)[i];
    const hv = vesselHull(v); least = Math.min(least, segPt(b, hv.a, hv.b) - hv.r);
    minK = Math.min(minK, tr.give[i].k);
    b.x += b.vx * DT; b.y += b.vy * DT;
  }
  return { least, minK };
}
/** A boat at `kt` on course `c` (deg) that would be `ahead` m ahead of the vessel on her track when she reaches the
 * point `at` s on along it (0: a collision course), the vessel at her service speed. */
function crosser(T: number, tr: Traffic, i: number, kt: number, c: number, ahead: number, at = 120): Moving {
  const v = tr.vessels(T)[i], V = VESSEL[v.kind].kt * KT, ux = Math.sin(v.h * Math.PI / 180), uy = Math.cos(v.h * Math.PI / 180);
  const bx = Math.sin(c * Math.PI / 180) * kt * KT, by = Math.cos(c * Math.PI / 180) * kt * KT;
  const mx = v.x + ux * (V * at + ahead), my = v.y + uy * (V * at + ahead);
  return { x: mx - bx * at, y: my - by * at, vx: bx, vy: by };
}

describe('the small vessels give way to a sailing boat (Rule 18); the ships in the lanes keep their course (Rule 9)', () => {
  it('the owner\'s case: the Bay cruise boat on Course 2 meets a Folkboat making half a knot into the ebb on its route, gives way, and doesn\'t hit her', () => {
    const r = encounter(0.5);
    // (before, 18 Nov 2026: straight through her, a wreck)
    expect(r.wrecked, 'run down').toBe(false); expect(r.gave).toBe(true);
    expect(r.least, 'the closest her hull came to the Folkboat\'s, m').toBeGreaterThan(30);
    // (recorded in the race track, for the replays: the frames while she's off her timetable)
    expect(r.w.track.some(f => f.v?.length)).toBe(true);
  }, 300_000);
  it('a boat stopped dead on her route: the same', () => {
    const r = encounter(0);
    expect(r.wrecked).toBe(false); expect(r.least).toBeGreaterThan(30);
  }, 300_000);
  it('the ships in the deep-water route never give way, and with nobody near her the cruise boat keeps her timetable', () => {
    const tr = new Traffic(true, SEED), far = [{ x: 1e6, y: 1e6, vx: 0, vy: 0 }];
    const T = tourAtMark6(21 * 3600);
    for (let t = T - 300; t < T + 300; t += DT) tr.vessels(t, far, DT);
    expect(tr.givingWay()).toBeUndefined();
    expect(SERVICES.filter(s => GIVES_WAY[s.kind]).map(s => s.kind).sort()).toEqual(['alcatraz', 'coastguard', 'ferry', 'tour', 'tour']);
    // (a boat right on the ship channel's route: the container ship and the tanker hold on)
    const tr2 = new Traffic(true, SEED); let shipOff = 0;
    for (let t = T - 3600; t < T + 3600; t += 0.5) {
      const vs = tr2.vessels(t);
      const boats = vs.filter(v => v.kind === 'container' || v.kind === 'tanker').map(v => ({ x: v.x + Math.sin(v.h * Math.PI / 180) * 300, y: v.y + Math.cos(v.h * Math.PI / 180) * 300, vx: 0, vy: 0 }));
      tr2.vessels(t, boats, 0.5);
      for (const [i] of tr2.givingWay() ?? []) if (!GIVES_WAY[SERVICES[i].kind]) shipOff++;
    }
    expect(shipOff).toBe(0);
  }, 120_000);
  it('deterministic: the same race twice, the cruise boat in the same place to the millimeter', () => {
    const a = encounter(0.5), b = encounter(0.5);
    const va = a.w.vessels.map(v => [v.x, v.y, v.h]), vb = b.w.vessels.map(v => [v.x, v.y, v.h]);
    expect(vb).toEqual(va);
  }, 600_000);
  it('a boat stopped dead 900 m ahead on her route: she stops for it, clear (8(e)), and goes on once it\'s out of her way', () => {
    const tr = new Traffic(true, SEED), { T, i } = tourOnLeg(tr, 21 * 3600), v = tr.vessels(T)[i];
    const r = drive(tr, i, T, { x: v.x - 900, y: v.y, vx: 0, vy: 0 }, 600); // (she slows by stages, and stops when she must)
    expect(r.minK, 'she took all way off').toBe(0);
    expect(r.least).toBeGreaterThan(40);
    // (the boat gone, she picks up again: 4 minutes later she's back to her service speed)
    const far = [{ x: 1e6, y: 1e6, vx: 0, vy: 0 }]; for (let t = T + 600; t < T + 840; t += DT) tr.vessels(t, far, DT);
    expect(tr.give[i].k).toBe(1);
  }, 60_000);
  it('boats crossing ahead of her, from either side, at 3 and 5 kt, on a collision course or passing ahead: she slows and lets them across, well clear', () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600);
    const out: string[] = [];
    for (const kt of [3, 5]) for (const c of [0, 180, 30, 330, 150, 210, 60, 120]) for (const ahead of [0, 60, 120]) {
      const tr = new Traffic(true, SEED); tr.vessels(T);
      const r = drive(tr, i, T, crosser(T, tr, i, kt, c, ahead), 240);
      if (r.least < 30) out.push(`${kt} kt on ${c}°, ${ahead} m ahead: ${r.least.toFixed(1)} m`);
    }
    expect(out, 'hull gaps under 30 m').toEqual([]);
  }, 300_000);
  it('a boat short-tacking or jibing across her route: never closer than her timetable alone would have taken her (the second review: the stand-off model turned toward such boats and hit them)', () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600), v0 = tr0.vessels(T)[i];
    const worse: string[] = [];
    for (const start of [500, 700, 900]) for (const lat of [-150, -75, 0, 75, 150]) for (const every of [40, 70, 110]) for (const base of [225, 135]) {
      // (a boat beating or running at 4.5 kt, tacking or jibing through 90° every `every` s)
      const boat = { x: v0.x - start, y: v0.y + lat, vx: 0, vy: 0 };
      const steer = (b: Moving, t: number) => { const c = (Math.floor(t / every) % 2 ? base + 90 : base) * Math.PI / 180; b.vx = Math.sin(c) * 4.5 * KT; b.vy = Math.cos(c) * 4.5 * KT; };
      const a = drive(new Traffic(true, SEED), i, T, boat, 240, undefined, steer), none = drive(new Traffic(true, SEED), i, T, boat, 240, () => true, steer);
      if (a.least < Math.min(none.least, 30) - 1) worse.push(`${start} m ahead, ${lat} m off, every ${every} s on ${base}°: ${a.least.toFixed(1)} m (timetable ${none.least.toFixed(1)})`);
    }
    expect(worse).toEqual([]);
  }, 600_000);
  it('two boats, one on her route and one 160 m off it: she stops for both, clear of both', () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600), v0 = tr0.vessels(T)[i];
    const tr = new Traffic(true, SEED), boats = [{ x: v0.x - 700, y: v0.y, vx: 0, vy: 0 }, { x: v0.x - 800, y: v0.y - 160, vx: 0.3, vy: 0.3 }];
    let least = Infinity;
    for (let t = T; t < T + 300; t += DT) {
      const v = tr.vessels(t, boats, DT)[i], hv = vesselHull(v);
      for (const b of boats) { least = Math.min(least, segPt(b, hv.a, hv.b) - hv.r); b.x += b.vx * DT; b.y += b.vy * DT; }
    }
    expect(least).toBeGreaterThan(30);
  }, 60_000);
  it("a boat overtaking her (Rule 13) keeps clear: she doesn't slow for it; nor for a boat she's told not to (in her slip, in harbor)", () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600), v = tr0.vessels(T)[i];
    const tr = new Traffic(true, SEED);
    drive(tr, i, T, { x: v.x + 150, y: v.y + 5, vx: -8, vy: 0 }, 40); // (coming up from astern at 15.5 kt)
    expect(tr.givingWay()).toBeUndefined();
    const tr2 = new Traffic(true, SEED);
    drive(tr2, i, T, { x: v.x - 500, y: v.y, vx: 0, vy: 0 }, 60, () => true);
    expect(tr2.givingWay()).toBeUndefined();
  }, 60_000);
  // (the second review, 19 Nov 2026: each case below was a contact or a vessel stuck for good in the version it reviewed)
  /** The first time from T0 that service i is under way within 10 m of her route's corner `wp`, coming to it. */
  const atCorner = (i: number, wp: number, T0 = 20 * 3600) => {
    const tr = new Traffic(true, SEED), c = ROUTES[SERVICES[i].route][wp];
    for (let T = T0; T < T0 + 8 * 3600; T += 0.5) { const v = tr.vessels(T)[i]; if (v.moving && Math.hypot(v.x - c.x, v.y - c.y) < 10) return T; }
    return NaN;
  };
  const gives = SERVICES.map((_, i) => i).filter(i => GIVES_WAY[SERVICES[i].kind]);
  it('a boat stopped just past a bend in her route, or just off her berth: she sees it round the bend, and leaves her berth looking, and stops clear', () => {
    const out: string[] = [];
    for (const i of gives) {
      const R = ROUTES[SERVICES[i].route];
      for (let wp = 1; wp < R.length - 1; wp++) {
        const T = atCorner(i, wp); if (isNaN(T)) continue;
        const a = R[wp], b = R[wp + 1], L = Math.hypot(b.x - a.x, b.y - a.y), V = VESSEL[SERVICES[i].kind].kt * KT;
        for (const past of [90, 150, 200]) {
          if (past > L - 20) continue;
          const boat = { x: a.x + (b.x - a.x) / L * past, y: a.y + (b.y - a.y) / L * past, vx: 0, vy: 0 };
          const r = drive(new Traffic(true, SEED), i, T - 600 / V, boat, 240);
          if (r.least < 4) out.push(`${SERVICES[i].kind}#${i} corner ${wp}, ${past} m past: ${r.least.toFixed(1)} m`);
        }
      }
      // (her berth: the route's first point, a boat 40–200 m along her way out, as she lies alongside)
      const T = atCorner(i, 0) ; if (isNaN(T)) continue;
      const a = R[0], b = R[1], L = Math.hypot(b.x - a.x, b.y - a.y);
      for (const out_ of [40, 100, 200]) {
        const boat = { x: a.x + (b.x - a.x) / L * out_, y: a.y + (b.y - a.y) / L * out_, vx: 0, vy: 0 };
        const r = drive(new Traffic(true, SEED), i, T - 60, boat, 300);
        if (r.least < 4) out.push(`${SERVICES[i].kind}#${i} leaving her berth, a boat ${out_} m out: ${r.least.toFixed(1)} m`);
      }
    }
    expect(out).toEqual([]);
  }, 600_000);
  it('a boat on the opposite course 100–130 m off her route that tacks toward it as she comes: never a contact where her timetable alone would have missed', () => {
    const out: string[] = [];
    for (const i of gives) {
      const R = ROUTES[SERVICES[i].route];
      // (her longest straight leg)
      let wp = 0, best = 0; for (let k = 0; k < R.length - 1; k++) { const l = Math.hypot(R[k + 1].x - R[k].x, R[k + 1].y - R[k].y); if (l > best) { best = l; wp = k; } }
      const T = atCorner(i, wp); if (isNaN(T)) continue;
      const tr0 = new Traffic(true, SEED), V = VESSEL[SERVICES[i].kind].kt * KT;
      const T1 = T + 100 / V, v0 = tr0.vessels(T1)[i], ux = Math.sin(v0.h * Math.PI / 180), uy = Math.cos(v0.h * Math.PI / 180);
      for (const off of [100, 130, -100, -130]) for (const at of [100, 200, 350, 500]) for (const turn of [45, 90]) {
        const start = { x: v0.x + ux * 1000 + uy * off, y: v0.y + uy * 1000 - ux * off, vx: -ux * 2.3, vy: -uy * 2.3 };
        let tacked = false;
        const steer = (b: Moving, t: number) => {
          // (she tacks toward the route once the vessel is `at` m off)
          const v = tr0.vessels(T1 + t)[i]; if (tacked || Math.hypot(b.x - v.x, b.y - v.y) > at) return; tacked = true;
          const c = Math.atan2(b.vx, b.vy) + (off > 0 ? 1 : -1) * turn * Math.PI / 180; b.vx = Math.sin(c) * 2.3; b.vy = Math.cos(c) * 2.3;
        };
        const a = drive(new Traffic(true, SEED), i, T1, start, 300, undefined, (b, t) => { steer(b, t); }); tacked = false;
        const none = drive(new Traffic(true, SEED), i, T1, start, 300, () => true, (b, t) => { steer(b, t); });
        if (a.least < 4 && none.least >= 4) out.push(`${SERVICES[i].kind}#${i}: ${off} m off, tacks ${turn}° at ${at} m: ${a.least.toFixed(1)} m (timetable ${none.least.toFixed(1)})`);
      }
    }
    expect(out).toEqual([]);
  }, 900_000);
  it('a boat lying still close beside her, that she\'s already passing: it doesn\'t hold her up', () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600), v = tr0.vessels(T)[i];
    for (const [ahead, abeam] of [[-60, 50], [0, 80], [30, 90]]) {
      const tr = new Traffic(true, SEED), b = { x: v.x - ahead, y: v.y + abeam, vx: 0, vy: 0 };
      for (let t = T; t < T + 120; t += DT) tr.vessels(t, [b], DT);
      expect(tr.give[i].lag, `a boat ${ahead} m ahead, ${abeam} m abeam: she lost no more than a minute`).toBeLessThan(60);
    }
  }, 120_000);
  it('an AI boat running down past a cruise boat lying stopped: her dodge takes her past the vessel\'s side, clear, not down her length', () => {
    // (the second review, 19 Nov 2026: aiming astern of a vessel lying still brought a boat coming from ahead onto her:
    // 0.8 m at 14 and 18 m off her line)
    for (const side of [14, 18, 25, -14]) {
      const w: any = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, course: 'ss2', tideDate: '2026-11-07', tideTime: '13:35', windKind: 'west', windKt: 12, current: 'none', traffic: 1, opponents: ['stock:1'], fleet: 1 } as Settings, 3);
      for (let k = 0; k < 60; k++) w.step(DT);
      const b = w.boats.find((q: any) => !q.isUser), u = w.user;
      const v = { id: 4, kind: 'tour', x: b.x + 800, y: b.y + 900, h: 270, v: 0, moving: true };
      w.traffic = { on: true, vessels: () => [{ ...v }], wakeAt: () => null, givingWay: () => undefined };
      const orig = w.keepClearOfShips.bind(w);
      w.keepClearOfShips = (q: any) => { q.desired = 90; q.luff = false; orig(q); }; // (she wants to run 090; the dodge has its say)
      b.x = v.x - 400; b.y = v.y + side; b.h = 90; b.v = 3; b.vx = 3; b.vy = 0;
      let least = Infinity;
      for (let k = 0; k < 60 * 200; k++) {
        u.x = v.x + 3000; u.y = v.y + 3000; w.step(DT);
        const hv = vesselHull(v as Vessel); least = Math.min(least, Math.min(segPt(bow(b), hv.a, hv.b), segPt(stern(b), hv.a, hv.b), segPt(b, hv.a, hv.b)) - hv.r);
      }
      expect(least, `${side} m off her line`).toBeGreaterThan(10);
    }
  }, 300_000);
});
