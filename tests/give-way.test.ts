import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { segPt } from '../src/core/math';
import { GIVES_WAY, SERVICES, Traffic, VESSEL, vesselHull, type Moving, type Vessel } from '../src/sim/traffic';
import { landAt } from '../src/environment/sea';
import { bow, stern } from '../src/boat/boat';

/**
 * The small vessels give way to a sailing boat (Inland Rules, 33 CFR 83.18(a)(iv); Rule 8), and the ships in the lanes
 * don't (Rule 9). The owner's race, 18 Nov 2026: Course 2 (Seaweed Soup, 7 Nov 2026 at 13:35), making half a knot over
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
const LEG_E = LL(37.8128, -122.4140), LEG_W = LL(37.8128, -122.4300);
function tourOnLeg(tr: Traffic, fromT: number): { T: number; i: number } {
  for (let T = fromT; T < fromT + 4 * 3600; T += 1) {
    const vs = tr.vessels(T);
    for (let i = 0; i < vs.length; i++) { const v = vs[i]; if (v.kind === 'tour' && v.moving && Math.abs(v.h - 270) < 1 && Math.abs(v.x - LEG_E.x) < 8 && Math.abs(v.y - LEG_E.y) < 8) return { T, i }; }
  }
  throw new Error('no tour boat on the leg');
}
const land = (p: { x: number; y: number }) => !!landAt(p);
/**
 * One boat sailing straight at constant velocity (nobody steering clear) against the give-way vessel `i` from time T,
 * for `dur` s at 60 Hz: the closest her hull came to the boat's middle (m), the most her heading changed in a step
 * (deg, on this straight leg the timetable's own heading doesn't change), and how far off her route she was when the
 * boat was first within `near` m.
 */
function drive(tr: Traffic, i: number, T: number, boat: Moving, dur: number, near = 600, skip?: (b: Moving) => boolean) {
  let least = Infinity, maxTurn = 0, offAtNear = NaN, h0 = NaN;
  const b = { ...boat };
  for (let t = T; t < T + dur; t += DT) {
    const v = tr.vessels(t, [b], DT, land, skip)[i];
    const hv = vesselHull(v); least = Math.min(least, segPt(b, hv.a, hv.b) - hv.r);
    if (!isNaN(h0)) maxTurn = Math.max(maxTurn, Math.abs(((v.h - h0 + 540) % 360) - 180)); h0 = v.h;
    if (isNaN(offAtNear) && Math.hypot(b.x - v.x, b.y - v.y) < near) offAtNear = Math.abs(v.y - LEG_E.y);
    b.x += b.vx * DT; b.y += b.vy * DT;
  }
  return { least, maxTurn, offAtNear };
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
  it('a boat stopped dead 900 m ahead on the straight leg: she stands off early and steadily, not in a jump a step (8(a), 8(b))', () => {
    const tr = new Traffic(true, SEED), { T, i } = tourOnLeg(tr, 21 * 3600), v = tr.vessels(T)[i];
    const r = drive(tr, i, T, { x: v.x - 900, y: v.y, vx: 0, vy: 0 }, 200);
    // (before, 18 Nov 2026, the review: she hunted between giving way and coming back each step, her heading jumping
    // 25–35° in a step, and was first 3 m off her route at 224 m)
    expect(r.offAtNear, 'off her route when the boat was 600 m away, m').toBeGreaterThan(20);
    expect(r.maxTurn, 'the most her heading changed in a step, deg').toBeLessThan(1);
    expect(r.least).toBeGreaterThan(40);
  }, 60_000);
  it('boats crossing ahead of her, from either side, at 3 and 5 kt, on a collision course or passing ahead: she passes astern of them, well clear (8, 16)', () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600);
    const out: string[] = [];
    for (const kt of [3, 5]) for (const c of [0, 180, 30, 330, 150, 210, 60, 120]) for (const ahead of [0, 60, 120]) {
      const tr = new Traffic(true, SEED); tr.vessels(T);
      const r = drive(tr, i, T, crosser(T, tr, i, kt, c, ahead), 240);
      if (r.least < 30) out.push(`${kt} kt on ${c}°, ${ahead} m ahead: ${r.least.toFixed(1)} m`);
    }
    // (before, the review: a 3 kt boat that would have crossed 120 m ahead was hit (−6 m; +19.7 m with no giving way),
    // she having stood off the way the boat was going; 30° off the reciprocal, −3.3 m)
    expect(out, 'hull gaps under 30 m').toEqual([]);
  }, 300_000);
  it('a boat lying 15, 30 or 45 m off her route by the corner at mark 6: she keeps to one side of it, clear', () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600);
    for (const n of [15, 30, 45, -15, -30, -45]) {
      const tr = new Traffic(true, SEED);
      const r = drive(tr, i, T, { x: LEG_W.x + 100, y: LEG_W.y + n, vx: 0, vy: 0 }, 400);
      expect(r.least, `${n} m north of the route`).toBeGreaterThan(30);
    }
  }, 120_000);
  it('never in a jump: alongside her berth with a stand-off still in hand, she closes it under way, every give-way service', () => {
    const tr = new Traffic(true, SEED); let worst = 0, who = '';
    const T0 = 20 * 3600, last = new Map<number, Vessel>();
    // (a boat lying on each route in turn, 400 m along it from wherever the vessel is when it's put there: she stands off,
    // and some of the time she's still off her route as she reaches her berth)
    let boats: Moving[] = [];
    for (let t = T0; t < T0 + 3 * 3600; t += DT) {
      if (Math.round((t - T0) / DT) % (60 * 90) === 0) boats = tr.vessels(t).filter(v => GIVES_WAY[v.kind] && v.moving).map(v => ({ x: v.x + Math.sin(v.h * Math.PI / 180) * 400, y: v.y + Math.cos(v.h * Math.PI / 180) * 400, vx: 0, vy: 0 }));
      const vs = tr.vessels(t, boats, DT, land);
      vs.forEach((v, k) => {
        const p = last.get(k); last.set(k, v); if (!p || !GIVES_WAY[v.kind]) return;
        const jump = Math.hypot(v.x - p.x, v.y - p.y) - VESSEL[v.kind].kt * KT * DT * 1.01;
        if (jump > worst) { worst = jump; who = `${v.kind} at ${t.toFixed(0)}`; }
      });
    }
    // (a route's own turn at a berth is the timetable's, which turns her round there in a step: over 3 s of moving its
    // length would show; a jump is metres in a step)
    expect(worst, `the most she moved in a step beyond her speed, m (${who})`).toBeLessThan(0.5);
  }, 600_000);
  it("a boat overtaking her (Rule 13) keeps clear: she doesn't give way to it; nor to a boat she's told not to (in her slip, in harbor)", () => {
    const tr0 = new Traffic(true, SEED), { T, i } = tourOnLeg(tr0, 21 * 3600), v = tr0.vessels(T)[i];
    const tr = new Traffic(true, SEED);
    drive(tr, i, T, { x: v.x + 150, y: v.y + 5, vx: -8, vy: 0 }, 40); // (coming up from astern at 15.5 kt)
    expect(tr.givingWay()).toBeUndefined();
    const tr2 = new Traffic(true, SEED);
    drive(tr2, i, T, { x: v.x - 500, y: v.y, vx: 0, vy: 0 }, 60, 600, () => true);
    expect(tr2.givingWay()).toBeUndefined();
  }, 60_000);
});
