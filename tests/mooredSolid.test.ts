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
import { SLIPS, berthClear, harborOf, pushOffPlan, pushOffPoses, pushOffReplans, toExit } from '../src/geo/marina';
/** Let go 60 degrees and more off the real wind, where a sail fills as it goes up. */
const offWind = (from: number, h: number) => Math.abs(((from - h + 540) % 360) - 180) >= 60;
describe('the walk-out to the fairway', () => {
  it('through the planner: in winds not on a round 10 degrees, near the bound and across north, every let-go 60 degrees and more off the real wind, and the plan made again to the degree where the rounded one fell short', () => {
    // (a let-go off the crew's push alone: swung on her bow line and not held for the main, walked out, or shoved off astern
    // and let go where her coast ends; held for the main, she's let go with it drawing)
    const letGoH = (s: (typeof SLIPS)[0], p: ReturnType<typeof pushOffPlan>) => p.kind === 'swing' ? (p.hold ? null : p.h) : p.kind === 'astern' ? (p.noRoom ? null : pushOffPoses(s, p).at(-1)!.h) : null;
    let n = 0; const r0 = pushOffReplans.n, bad: string[] = [];
    for (const s of SLIPS.filter(x => x.kind === 'bow-in').filter((_, i) => i % 9 === 0)) for (const from of [4, 356, 224, 226, 94, 186, 266, 276]) {
      const p = pushOffPlan(s, from, 12), h = letGoH(s, p); if (h == null) continue; n++;
      if (!offWind(from, h)) bad.push(`${s.id} from ${from}: let go heading ${Math.round(h)}`);
    }
    expect(bad).toEqual([]); expect(n).toBeGreaterThan(100);
    expect(pushOffReplans.n - r0).toBeGreaterThan(0); // (and some made again to the degree: the rounded plan would have been let go nearer than 60)
  }, 600_000);
  it('pointed toward the way out means it: where there is no telling (both ends beyond the water the way out reaches), no walk-out (Richmond YC F2 from the north, 16 Nov 2026)', () => {
    const s = SLIPS.find(q => q.id === 'richmond-yc:F2')!, togo = toExit(harborOf(s.marina)!);
    for (const kt of [8, 12, 14]) {
      const p = pushOffPlan(s, 0, kt); if (p.kind !== 'swing' || !p.walk) continue;
      const e = pushOffPoses(s, p).at(-1)!, v = { x: Math.sin(p.h * Math.PI / 180), y: Math.cos(p.h * Math.PI / 180) };
      const gain = togo({ x: e.c.x - v.x * 12, y: e.c.y - v.y * 12 }) - togo({ x: e.c.x + v.x * 12, y: e.c.y + v.y * 12 });
      expect(Number.isFinite(gain) && gain > 0, `${kt} kt: gain ${gain}`).toBe(true);
    }
  }, 120_000);
  it('the bar itself: let go 55 degrees off the real wind fails it, 60 passes (the planner, through pushOffPlan, above)', () => {
    expect(offWind(225, 225 - 55)).toBe(false); expect(offWind(225, 225 + 55)).toBe(false); expect(offWind(225, 225 - 60)).toBe(true); expect(offWind(5, 300)).toBe(true); expect(offWind(5, 310)).toBe(false);
  });
  it('every one, in three winds: pointed toward the way out, 60 degrees and more off the wind, 10 m clear ahead, and clear all the way round', () => {
    const bad: string[] = []; let n = 0;
    for (const [from, kt] of [[270, 12], [225, 15], [0, 12]] as const) for (const s of SLIPS) {
      const p = pushOffPlan(s, from, kt); if (p.kind !== 'swing' || !p.walk) continue; n++;
      const togo = toExit(harborOf(s.marina)!), poses = pushOffPoses(s, p), e = poses[poses.length - 1], v = { x: Math.sin(p.h * Math.PI / 180), y: Math.cos(p.h * Math.PI / 180) };
      const toward = togo({ x: e.c.x - v.x * 12, y: e.c.y - v.y * 12 }) - togo({ x: e.c.x + v.x * 12, y: e.c.y + v.y * 12 }) > 0;
      const off = offWind(from, p.h); // (against the real wind: the sea doesn't round it)
      const ahead = [2, 4, 6, 8, 10].every(d => berthClear({ x: e.c.x + v.x * d, y: e.c.y + v.y * d }, p.h, s));
      const round = poses.every(q => berthClear(q.c, q.h, s));
      if (!toward || !off || !ahead || !round) bad.push(`${s.id} from ${from}: ${toward ? '' : 'not toward the way out '}${off ? '' : 'near the wind '}${ahead ? '' : 'no room ahead '}${round ? '' : 'not clear round'}`);
    }
    expect(n).toBeGreaterThan(20); expect(bad).toEqual([]);
  }, 600_000);
});

// (West Harbor 507, in a 12 kt northwesterly: swung on her bow line, the crew let her go heading 262, only 53 degrees off
// the wind, beside the boat in the next slip, and with the jib up she was set onto it inside 15 s; found once the moored
// boats were solid, 15 Nov 2026. Now (8m3) a let-go has to be 60 degrees and more off the wind, with clear water for her
// first 15 m: geo/marina.ts clearRun. There she's walked out to the fairway and turned there instead.)
function swingOut(id: string, from: number, kt: number) {
  const s = SLIPS.find(q => q.id === id)!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: from, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings, 1, { freeSail: true }), u = w.user;
  for (let k = 0; k < 30; k++) w.step(DT); w.drainEvents();
  const went = w.pushOff(), P = (u.handled as { plan?: { kind: string; pivot?: number; walk?: true } } | undefined)?.plan, hits: string[] = [];
  const seen = () => { for (const e of w.drainEvents()) if (e.type === 'toast' && /next slip/.test((e as { msg: string }).msg)) hits.push((e as { msg: string }).msg); };
  for (let k = 0; k < 60 * 150 && (u.handled || u.pushing); k++) { w.step(DT); if (u.handled?.held) w.pushOff(); seen(); }
  const swung = hits.length, hLet = u.h;
  w.setSail('jib', true); const x0 = u.x, y0 = u.y;
  for (let k = 0; k < 60 * 60 && Math.hypot(u.x - x0, u.y - y0) < 15; k++) { w.step(DT); seen(); }
  return { went, bowLine: P?.kind === 'swing' && !P.walk, walked: P?.kind === 'swing' && !!P.walk, hits, swung, off: Math.abs(((from - hLet + 540) % 360) - 180) };
}
describe('West Harbor 507 in a 12 kt northwesterly (8m3)', () => {
  it('walked out to the fairway and let go 60 degrees and more off the wind; hands off with the jib up, 15 m touching no boat', () => {
    const r = swingOut('west-harbor:507', 315, 12);
    expect(r.went).toBe(true); expect(r.walked).toBe(true); expect(r.swung).toBe(0);
    expect(r.off).toBeGreaterThanOrEqual(60); expect(r.hits).toEqual([]);
  }, 120_000);
});
