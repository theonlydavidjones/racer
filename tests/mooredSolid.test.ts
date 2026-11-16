// The boats lying in the slips are solid to a boat sailing free (8m2, the owner, 15 Nov 2026: "i keep getting pushed into
// other boats long before i have a chance to get out"): she's stopped against one and told, not sailed through it.
import { describe, expect, it } from 'vitest';
import { hitsMooredBoat, mooredIn, slipsIn } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

describe('the moored boats are solid', () => {
  it('driven stern first into the boat in a neighboring slip, at a walk: stopped against it and told, never through it', () => {
    const home = slipsIn('gashouse-cove')[40], boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 0.5, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let i = 0; i < 30; i++) w.step(DT);
    // (a boat lying in another slip of this harbor: her stern aimed at its middle from 12 m off, on its line)
    const o = mooredIn('gashouse-cove').find(m => m.slip !== home)!.slip, f = { x: Math.sin(o.heading * Math.PI / 180), y: Math.cos(o.heading * Math.PI / 180) };
    Object.assign(u, { docked: undefined, x: o.p.x - f.x * 12, y: o.p.y - f.y * 12, h: (o.heading + 180) % 360, v: 0, astern: 0.5, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    let told = false, through = false;
    for (let t = 0; t < 30; t += DT) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast' && /boat in the next slip/.test(e.msg)) told = true; if (hitsMooredBoat(u)) through = true; }
    expect(told).toBe(true); expect(through).toBe(false);
  });
});

// (walked out to the fairway and turned there by hand, 8m2: every such plan, over every berth in three winds, points down
// the fairway toward the way out, 60 degrees and more off the wind, with 10 m of clear water ahead of her)
import { SLIPS, berthClear, harborOf, pushOffPlan, pushOffPoses, toExit } from '../src/geo/marina';
describe('the walk-out to the fairway', () => {
  it('every one, in three winds: pointed toward the way out, 60 degrees and more off the wind, 10 m clear ahead, and clear all the way round', () => {
    const bad: string[] = []; let n = 0;
    for (const [from, kt] of [[270, 12], [225, 15], [0, 12]] as const) for (const s of SLIPS) {
      const p = pushOffPlan(s, from, kt); if (p.kind !== 'swing' || p.pivot !== 0) continue; n++;
      const togo = toExit(harborOf(s.marina)!), poses = pushOffPoses(s, p), e = poses[poses.length - 1], v = { x: Math.sin(p.h * Math.PI / 180), y: Math.cos(p.h * Math.PI / 180) };
      const toward = togo({ x: e.c.x - v.x * 12, y: e.c.y - v.y * 12 }) - togo({ x: e.c.x + v.x * 12, y: e.c.y + v.y * 12 }) > 0;
      const off = Math.abs(((from - p.h + 540) % 360) - 180) >= 60;
      const ahead = [2, 4, 6, 8, 10].every(d => berthClear({ x: e.c.x + v.x * d, y: e.c.y + v.y * d }, p.h, s));
      const round = poses.every(q => berthClear(q.c, q.h, s));
      if (!toward || !off || !ahead || !round) bad.push(`${s.id} from ${from}: ${toward ? '' : 'not toward the way out '}${off ? '' : 'near the wind '}${ahead ? '' : 'no room ahead '}${round ? '' : 'not clear round'}`);
    }
    expect(n).toBeGreaterThan(20); expect(bad).toEqual([]);
  }, 600_000);
});
