// The fleet and a boat doing her penalty turns (the owner, v208, 19 Nov 2026: "Penalty pileups at the turns, unusable").
// Your boat is dropped into a fleet race 14 m ahead of its most crowded boat, owing two turns, and turns them on the spot,
// as a sailor does: a called turn held 90° ahead of her heading, about 5–9°/s at a knot or two. Each rule 21.2 call on
// her (a contact, or a boat made to swerve) is counted. She keeps clear under 21.2, but a circling boat has no course
// anyone can read, and a fleet sailing on into her circle meets her whichever way she turns: the AI gives her a berth
// (ai.ts pastCircle). With the AI sailing on to its late rule-14 swerve (main before this), 7 calls in these 22 runs;
// with the berth, 3. (Excluded from test:fast: whole fleet races, a few minutes.)
import { describe, expect, it } from 'vitest';
import { World, startPenalty } from '../src/sim/world';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { courseFile } from '../src/courses/registry';
import { realRace, realStarters } from '../src/sim/realRaces';
import seaweed from '../src/courses/data/seaweed-soup-2026-course10.json';
import { V, markDist, n360 } from '../src/core/math';

type Boat = World['boats'][number];

function turnsIn(w: World, dir: number, at: (w: World) => boolean): { calls: number; done: boolean } {
  while (!at(w) && w.t < 3600) w.step(1 / 60);
  const ai = w.boats.filter(b => !b.isUser && !b.finished);
  const crowd = (b: Boat) => ai.filter(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 40).length;
  const host = ai.reduce((m, b) => crowd(b) > crowd(m) ? b : m), u = w.user, f = V(host.h);
  Object.assign(u, { x: host.x + f.x * 14, y: host.y + f.y * 14, h: host.h, v: host.v, vx: host.vx, vy: host.vy, started: true, ocs: false, leg: host.leg, tack: host.tack });
  startPenalty(u, 720);
  let calls = 0;
  w.onIncident = (A, B, inc) => { if ((A.isUser || B.isUser) && inc.fouler.isUser && inc.rule === '21.2') calls++; };
  const t0 = w.t;
  while (w.t < t0 + 150 && u.penalty > 0) { u.tiller = 0; u.steer = 0; u.turnDir = dir; u.turnTarget = n360(u.h + 90 * dir); w.step(1 / 60); }
  return { calls, done: u.penalty <= 0 };
}

/** Skipper Model's start gate (scripts/check/fouls-pair.mjs): Seaweed Soup course 10, seven opponents, 14 Nov 2026. */
const seaweedRace = (seed: number, kt: number) => new World(seaweed as never, { ...DEFAULT_SETTINGS, judging: 'umpired', tideDate: '2026-11-14', windKind: 'west', windKt: kt, current: 'real', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'], fleet: 7 }, seed);
/** The owner's race on v208 (the Coordinator, 19 Nov 2026): course ss2 short, the 7 Nov 2026 Seaweed Soup fleet, W 7 kt. */
function ownersRace(): World {
  const r = realRace('GGYC_T00227699-r1')!, ids = realStarters(r).map(b => `real:${r.id}:${b.key}`);
  const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: 'ss2', raceLength: 'short', tideDate: '2026-11-07', tideTime: '13:35', windKind: 'west', windKt: 7, current: 'real', realRace: r.id, opponents: ids, fleet: ids.length, penaltyTurns: 2, judging: 'protests' };
  return new World(courseFile('ss2'), S, 2434542977);
}
const atFirstMark = (w: World) => w.t > 0 && w.boats.some(b => !b.isUser && b.leg === 0 && markDist(b, w.C.marks[0]) < 25);

describe('a boat doing her turns in the fleet', () => {
  it('the fleet gives her a berth: few 21.2 calls on her (7 before the berth, 3 after, in these 22 runs)', () => {
    const runs = [
      ...[12, 22].flatMap(kt => Array.from({ length: 10 }, (_, i) => turnsIn(seaweedRace(i + 1, kt), 1, w => w.t >= 60))),
      ...[1, -1].map(dir => turnsIn(ownersRace(), dir, atFirstMark))
    ];
    expect(runs.filter(r => r.done).length, 'she turns her turns').toBeGreaterThanOrEqual(18);
    expect(runs.reduce((s, r) => s + r.calls, 0)).toBeLessThanOrEqual(4);
  }, 3_000_000);
});
