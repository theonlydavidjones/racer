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
import { wharfNearest } from '../src/geo/shore';

const place = (id: string) => PLACES.find(p => p.id === id)!.p;
function passage(from: { x: number; y: number }, to: string, seed: number, mins = 60) {
  // (as the soak sailed it: her home slip in the Berkeley Marina, ships about)
  const boat = { ...DEFAULT_BOAT, slip: SLIPS.find(s => s.marina === 'berkeley')!.id };
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: to === 'slip' ? 'slip' : '', windKind: 'west', windKt: 14, current: 'real', sea: 'real', tideDate: '2026-11-14', traffic: 1, fleet: 0, opponents: [], boats: [boat], boat, boatId: boat.id } as Settings;
  const w = new World(COURSES[0], S, seed, { freeSail: true }), u = w.user;
  w.step(DT); u.x = from.x; u.y = from.y; w.step(DT);
  (w as unknown as { running: boolean }).running = true;
  if (to !== 'slip') applyCommand(w, { k: 'dest', p: place(to), name: to });
  applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' });
  const feed = new HelmFeed(v => passageNow(v as never)), first = passageNow(w as never);
  let hits = 0, last = u.lastHitT, near = Infinity, turned = 0, h0 = u.h, alarm = '';
  const step = () => { w.step(DT); if (u.lastHitT !== last) { last = u.lastHitT; hits++; } turned += Math.abs(((u.h - h0 + 540) % 360) - 180); h0 = u.h; for (const e of w.drainEvents()) if (e.type === 'toast' && /too narrow/.test((e as { msg: string }).msg)) alarm = (e as { msg: string }).msg; };
  while (w.t < mins * 60 && !u.wrecked && w.arrivedT == null && w.pilot.mode !== 'off') {
    if (w.steps % 60 === 0) { const c = feed.tick(w as never); if (c) applyCommand(w, c as never); const r = wharfNearest(u, 200); if (r) near = Math.min(near, r.d); }
    step();
  }
  // (handed over: she has sea room, sailing on ten seconds as she was without striking anything)
  if (w.pilot.mode === 'off' && w.arrivedT == null) for (let i = 0; i < 600 && !u.wrecked; i++) step();
  const min = w.t / 60;
  return { w, u, hits, near, alarm, turned, min, planned: first?.ok ? first.minutes : NaN, plans: feed.taken,
    where: `at ${u.x.toFixed(0)}, ${u.y.toFixed(0)} after ${min.toFixed(1)} min (planned ${first?.ok ? first.minutes.toFixed(0) : 'none'}), pilot ${w.pilot.mode}${alarm ? ' (' + alarm + ')' : ''}${u.wrecked ? ', wrecked: ' + u.wrecked.how : ''}, ${feed.taken} plans, nearest structure ${near.toFixed(0)} m, turned ${turned.toFixed(0)}°` };
}

describe('Nav gets round the abandoned Berkeley Pier by the plan', () => {
  const cases: [string, { x: number; y: number }, string, number][] = [
    ['off the Berkeley Marina to off Emeryville (the soak\'s wreck)', place('berkeley'), 'emeryville', 105],
    ['the same, another day', place('berkeley'), 'emeryville', 107],
    ['50 m south of the pier\'s west end, to the marina', { x: 7742, y: 4283 }, 'berkeley', 107],
    ['near its west end, to the marina', { x: 7593, y: 4249 }, 'berkeley', 107],
    ['further along it, to the marina', { x: 7917, y: 4383 }, 'berkeley', 107],
    ['Clipper Cove to north of Treasure Island', place('clipper'), 'ti-north', 107],
    ['the Bay Bridge to Clipper Cove', place('baybridge'), 'clipper', 107],
    ['home to her Berkeley slip from off Emeryville, south of the pier (the physics review)', place('emeryville'), 'slip', 107],
    ['from 8 m off Pier 45\'s head to off Alcatraz (the physics review)', { x: 1988, y: 78 }, 'alcatraz', 107]
  ];
  for (const [name, from, to, seed] of cases) it(name, () => {
    const r = passage(from, to, seed);
    console.log(`${name}: ${r.where}`);
    expect(r.u.wrecked, r.where).toBeUndefined();
    expect(r.hits, `times she struck anything, ${r.where}`).toBe(0);
    // she gets there, or the pilot hands her over before a gap too narrow for it, with its alarm and sea room
    expect(r.w.arrivedT != null || !!r.alarm, `arrived or handed over: ${r.where}`).toBe(true);
    if (r.w.arrivedT != null && r.planned === r.planned) expect(r.min, `no circling: within half as long again as planned, ${r.where}`).toBeLessThan(r.planned * 1.5 + 5);
    expect(r.near, `kept off the structures: ${r.where}`).toBeGreaterThan(5);
  }, 900_000);
});
