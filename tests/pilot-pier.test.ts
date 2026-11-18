// The tiller pilot's Nav never steers her onto land (the stability soak and its physics review, 18 Nov 2026). From off
// the Berkeley Marina toward off Emeryville in 14 kt, the abandoned outer Berkeley Pier between (3 km of it), the pilot
// found no way round close to it and steered straight on, through it, and she was wrecked at 5.4 kt; started near the
// pier's west end bound for the marina, she struck it from the course she could lay within 50° of the wind, where no
// way round is sought; and the same from Clipper Cove to north of Treasure Island, aground on the island. Now the
// course she can lay is checked for land within her look ahead: round it where there's a clear way, and where there
// isn't, the alarm, and the tiller handed back. Arriving isn't asked: a pilot that gives her back is doing its job.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { PLACES } from '../src/sim/places';
import { SLIPS } from '../src/geo/marina';
import { DEFAULT_BOAT } from '../src/boat/spec';

const place = (id: string) => PLACES.find(p => p.id === id)!.p;
function passage(from: { x: number; y: number }, to: string, seed: number, mins = 45) {
  // (as the soak sailed it: her home slip in the Berkeley Marina, ships about)
  const boat = { ...DEFAULT_BOAT, slip: SLIPS.find(s => s.marina === 'berkeley')!.id };
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 14, current: 'real', sea: 'real', tideDate: '2026-11-14', traffic: 1, fleet: 0, opponents: [], boats: [boat], boat, boatId: boat.id } as Settings;
  const w = new World(COURSES[0], S, seed, { freeSail: true }), u = w.user;
  w.step(DT); u.x = from.x; u.y = from.y; w.step(DT);
  applyCommand(w, { k: 'dest', p: place(to), name: to }); applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' });
  let hits = 0, last = u.lastHitT;
  while (w.t < mins * 60 && !u.wrecked && w.arrivedT == null && w.pilot.mode !== 'off') { w.step(DT); if (u.lastHitT !== last) { last = u.lastHitT; hits++; } }
  return { w, u, hits, where: `at ${u.x.toFixed(0)}, ${u.y.toFixed(0)} after ${(w.t / 60).toFixed(1)} min, pilot ${w.pilot.mode}${u.wrecked ? ', wrecked: ' + u.wrecked.how : ''}` };
}

describe('the tiller pilot on Nav never steers her onto land', () => {
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
    expect(r.u.wrecked, r.where).toBeUndefined();
    expect(r.hits, `times she struck anything, ${r.where}`).toBe(0);
  }, 300_000);
});
