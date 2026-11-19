// The fleet and a boat doing her penalty turns (the owner, v208, 19 Nov 2026: "Penalty pileups at the turns, unusable").
// A boat doing turns keeps clear (21.2), but a circling boat has no course anyone can read, and a fleet sailing on into her
// circle meets her whichever way she turns: the AI gives her a berth (ai.ts pastCircle). Two cases, over 20 Seaweed Soup
// starts and the owner's v208 race at the first mark: your boat dropped 14 m ahead of the fleet's most crowded boat,
// turning two turns on the spot as a sailor does (a called turn held 90° ahead of her heading: 3–10°/s at a knot or two);
// and that most crowded AI boat given two turns, taking them as the AI does. Every incident is counted.
// Measured (physics review, 19 Nov 2026), main's AI → with the berth:
//   21.2 calls on the boat turning: 7 → 5 (yours), 6 → 3 (the AI's): 13 → 8
//   every incident in the runs: 28 → 27, 16 → 10: 44 → 37 (16.1 on an AI boat: 2 → 2)
//   turns done within 150 s: 36 → 40 of 44
// (Excluded from test:fast: 44 fleet races, several minutes.)
import { describe, expect, it } from 'vitest';
import { World, startPenalty } from '../src/sim/world';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { courseFile } from '../src/courses/registry';
import { realRace, realStarters } from '../src/sim/realRaces';
import seaweed from '../src/courses/data/seaweed-soup-2026-course10.json';
import { V, markDist, n360 } from '../src/core/math';

type Boat = World['boats'][number];
interface Run { calls: number; incidents: number; done: boolean }

/** Sail to `at`, then the turning boat (yours, or with `aiTurns` the most crowded AI boat) owes two turns. */
function turnsIn(w: World, at: (w: World) => boolean, aiTurns: boolean, dir = 1): Run {
  while (!at(w) && w.t < 3600) w.step(1 / 60);
  const ai = w.boats.filter(b => !b.isUser && !b.finished);
  const crowd = (b: Boat) => ai.filter(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 40).length;
  const host = ai.reduce((m, b) => crowd(b) > crowd(m) ? b : m), u = w.user;
  if (!aiTurns) { const f = V(host.h); Object.assign(u, { x: host.x + f.x * 14, y: host.y + f.y * 14, h: host.h, v: host.v, vx: host.vx, vy: host.vy, started: true, ocs: false, leg: host.leg, tack: host.tack }); }
  const T = aiTurns ? host : u;
  startPenalty(T, 720);
  let calls = 0, incidents = 0;
  w.onIncident = (_A, _B, inc) => { incidents++; if (inc.fouler === T && inc.rule === '21.2') calls++; };
  const t0 = w.t;
  while (w.t < t0 + 150 && T.penalty > 0) {
    if (!aiTurns) { u.tiller = 0; u.steer = 0; u.turnDir = dir; u.turnTarget = n360(u.h + 90 * dir); }
    w.step(1 / 60);
  }
  return { calls, incidents, done: T.penalty <= 0 };
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
  it('the fleet gives her a berth: fewer 21.2 calls on her, and no more incidents about her', () => {
    const runs: Run[] = [];
    for (const aiTurns of [false, true]) {
      for (const kt of [12, 22]) for (let s = 1; s <= 10; s++) runs.push(turnsIn(seaweedRace(s, kt), w => w.t >= 60, aiTurns));
      for (const dir of [1, -1]) runs.push(turnsIn(ownersRace(), atFirstMark, aiTurns, dir));
    }
    const sum = (k: 'calls' | 'incidents') => runs.reduce((s, r) => s + r[k], 0);
    expect(runs.filter(r => r.done).length, 'the turns get done').toBeGreaterThanOrEqual(38);
    expect(sum('calls'), '21.2 calls on the boat turning').toBeLessThanOrEqual(10);
    expect(sum('incidents'), 'every incident').toBeLessThanOrEqual(42);
  }, 3_000_000);
});
