// On Nav the tiller pilot gets round the abandoned outer Berkeley Pier, a 3 km line of ruin, by the navigator's plan,
// not a local detour (the stability soak, 18 Nov 2026; Deep Physics' cases, tests/pilot-pier on branch soak, and their
// review's ask: the plan's way round the land, replanned rather than re-picked). From off the Berkeley Marina toward off
// Emeryville in 14 kt, main wrecks her on it at 5.0 kn after 20 minutes; from other starts it circled beside it for up
// to 45 minutes. Sailed as the page sails it: the plan from the navigator when the helm asks (HelmFeed, worked out at
// once here), each frame a second of her clock. She must arrive, never be wrecked, and never strike anything (Deep
// Physics: not wrecked alone passed while she circled for 45 minutes). The fixes: the pier and its ruin one hazard
// (geo/data/east-piers.json), and the plan's corners at the helm kept 20 m off structures (sim/helmPlan.ts).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { PLACES } from '../src/sim/places';
import { SLIPS } from '../src/geo/marina';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { HelmFeed, passageNow } from '../src/sim/navigator';
import { shoreDist } from '../src/geo/shore';

const place = (id: string) => PLACES.find(p => p.id === id)!.p;
function passage(from: { x: number; y: number }, to: string, seed: number, mins = 60) {
  // (as the soak sailed it: her home slip in the Berkeley Marina, ships about)
  const boat = { ...DEFAULT_BOAT, slip: SLIPS.find(s => s.marina === 'berkeley')!.id };
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 14, current: 'real', sea: 'real', tideDate: '2026-11-14', traffic: 1, fleet: 0, opponents: [], boats: [boat], boat, boatId: boat.id } as Settings;
  const w = new World(COURSES[0], S, seed, { freeSail: true }), u = w.user;
  w.step(DT); u.x = from.x; u.y = from.y; w.step(DT);
  (w as unknown as { running: boolean }).running = true;
  applyCommand(w, { k: 'dest', p: place(to), name: to }); applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' });
  const feed = new HelmFeed(v => passageNow(v as never));
  let hits = 0, last = u.lastHitT, near = Infinity;
  while (w.t < mins * 60 && !u.wrecked && w.arrivedT == null && w.pilot.mode !== 'off') {
    if (w.steps % 60 === 0) { const c = feed.tick(w as never); if (c) applyCommand(w, c as never); near = Math.min(near, shoreDist(u)); }
    w.step(DT); if (u.lastHitT !== last) { last = u.lastHitT; hits++; }
  }
  return { w, u, hits, near, plans: feed.taken, where: `at ${u.x.toFixed(0)}, ${u.y.toFixed(0)} after ${(w.t / 60).toFixed(1)} min, pilot ${w.pilot.mode}${u.wrecked ? ', wrecked: ' + u.wrecked.how : ''}, ${feed.taken} plans, nearest land ${near.toFixed(0)} m` };
}

describe('Nav gets round the abandoned Berkeley Pier by the plan', () => {
  const cases: [string, { x: number; y: number }, string, number][] = [
    ['off the Berkeley Marina to off Emeryville (the soak\'s wreck)', place('berkeley'), 'emeryville', 105],
    ['the same, another day', place('berkeley'), 'emeryville', 107],
    ['50 m south of the pier\'s west end, to the marina', { x: 7742, y: 4283 }, 'berkeley', 107],
    ['near its west end, to the marina', { x: 7593, y: 4249 }, 'berkeley', 107],
    ['further along it, to the marina', { x: 7917, y: 4383 }, 'berkeley', 107],
    ['Clipper Cove to north of Treasure Island', place('clipper'), 'ti-north', 107],
    ['the Bay Bridge to Clipper Cove', place('baybridge'), 'clipper', 107]
  ];
  for (const [name, from, to, seed] of cases) it(name, () => {
    const r = passage(from, to, seed);
    console.log(`${name}: ${r.where}`);
    expect(r.u.wrecked, r.where).toBeUndefined();
    expect(r.hits, `times she struck anything, ${r.where}`).toBe(0);
    expect(r.w.arrivedT, `arrived: ${r.where}`).not.toBeNull();
  }, 600_000);
});
