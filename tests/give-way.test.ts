import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { segPt } from '../src/core/math';
import { GIVES_WAY, SERVICES, Traffic, vesselHull, type Vessel } from '../src/sim/traffic';
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
});
