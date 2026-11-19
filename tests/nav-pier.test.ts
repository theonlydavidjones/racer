// On Nav the tiller pilot gets round the abandoned outer Berkeley Pier, a 3 km line of ruin, by the navigator's plan,
// not a local detour (the stability soak, 18 Nov 2026; Deep Physics' cases, tests/pilot-pier on branch soak). From off
// the Berkeley Marina toward off Emeryville in 14 kt, main wrecks her on it at 5.0 kn after 20 minutes; from other starts
// it circled beside it for up to 45 minutes. The way is through the 45 m gap at the usable deck's end, which sailors use
// and the owner has sailed in a Folkboat (geo/data/east-piers.json, the ruin's note), or round its west end. Sailed as
// the page sails it: the plan from the navigator when the helm asks (HelmFeed, worked out at once here), each frame a
// second of her clock. She must arrive (or be handed over off her harbor's mouth, bound for her slip), within half as
// long again as planned, never strike anything, and keep off the structures; the gap alarm doesn't pass a case. The
// fixes: the plan's corners and open legs at the helm (sim/helmPlan.ts), the pilot trusting an open leg
// (boat/autopilot.ts navHeading), her hand-over before a gap narrower than her turning room, and, engaged beside a pier,
// her way off it first (World.offPier, helmPlan.ts wayOff).
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
type Start = { h?: number; v?: number; wind?: Settings['windKind'] };
function passage(from: { x: number; y: number }, to: string | { x: number; y: number }, seed: number, mins = 60, o: Start = {}) {
  // (as the soak sailed it: her home slip in the Berkeley Marina, ships about)
  const boat = { ...DEFAULT_BOAT, slip: SLIPS.find(s => s.marina === 'berkeley')!.id };
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: to === 'slip' ? 'slip' : '', windKind: o.wind ?? 'west', windKt: 14, current: 'real', sea: 'real', tideDate: '2026-11-14', traffic: 1, fleet: 0, opponents: [], boats: [boat], boat, boatId: boat.id } as Settings;
  const w = new World(COURSES[0], S, seed, { freeSail: true }), u = w.user;
  w.step(DT); u.x = from.x; u.y = from.y;
  // (her heading and way on as she's engaged, where a case gives them: along a pier, or in irons beside its head)
  if (o.h != null) { u.h = o.h; const sp = o.v ?? u.v; u.v = sp; u.vx = Math.sin(o.h * Math.PI / 180) * sp; u.vy = Math.cos(o.h * Math.PI / 180) * sp; }
  w.step(DT);
  (w as unknown as { running: boolean }).running = true;
  if (to !== 'slip') applyCommand(w, { k: 'dest', p: typeof to === 'string' ? place(to) : to, name: typeof to === 'string' ? to : 'a spot' });
  applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' });
  const feed = new HelmFeed(v => passageNow(v as never)), first = passageNow(w as never);
  let hits = 0, last = u.lastHitT, near = Infinity, turned = 0, h0 = u.h, alarm = '', mouth = false, clear = false;
  const step = () => {
    w.step(DT); if (u.lastHitT !== last) { last = u.lastHitT; hits++; } turned += Math.abs(((u.h - h0 + 540) % 360) - 180); h0 = u.h;
    for (const e of w.drainEvents()) if (e.type === 'toast') { const m = (e as { msg: string }).msg; if (/too narrow|Too close alongside/.test(m)) alarm = m; if (/harbor mouth: she's yours/.test(m)) mouth = true; }
  };
  while (w.t < mins * 60 && !u.wrecked && w.arrivedT == null && w.pilot.mode !== 'off') {
    if (w.steps % 60 === 0) { const c = feed.tick(w as never); if (c) applyCommand(w, c as never); const r = wharfNearest(u, 200); if (!r || r.d >= 20) clear = true; if (r && clear) near = Math.min(near, r.d); }
    step();
  }
  // (handed over: she has sea room, sailing on ten seconds as she was without striking anything)
  if (w.pilot.mode === 'off' && w.arrivedT == null) for (let i = 0; i < 600 && !u.wrecked; i++) step();
  const min = w.t / 60;
  return { w, u, hits, near, alarm, mouth, turned, min, planned: first?.ok ? first.minutes : NaN, plans: feed.taken,
    where: `at ${u.x.toFixed(0)}, ${u.y.toFixed(0)} after ${min.toFixed(1)} min (planned ${first?.ok ? first.minutes.toFixed(0) : 'none'}), pilot ${w.pilot.mode}${alarm ? ' (' + alarm + ')' : ''}${u.wrecked ? ', wrecked: ' + u.wrecked.how : ''}, ${feed.taken} plans, nearest structure ${near.toFixed(0)} m, turned ${turned.toFixed(0)}°` };
}

describe('Nav gets round the abandoned Berkeley Pier by the plan', () => {
  // (the least she keeps off the structures once she's first been clear of them: 10 m about the Berkeley Pier; 3 m in the
  // Wharf's piers, her half-beam and as much again, where a plan begun beside one may keep near it: router.ts clear)
  const cases: [string, { x: number; y: number }, string | { x: number; y: number }, number, number?, Start?][] = [
    ['off the Berkeley Marina to off Emeryville (the soak\'s wreck)', place('berkeley'), 'emeryville', 105],
    ['the same, another day', place('berkeley'), 'emeryville', 107],
    ['50 m south of the pier\'s west end, to the marina', { x: 7742, y: 4283 }, 'berkeley', 107],
    ['near its west end, to the marina', { x: 7593, y: 4249 }, 'berkeley', 107],
    ['further along it, to the marina', { x: 7917, y: 4383 }, 'berkeley', 107],
    ['Clipper Cove to north of Treasure Island', place('clipper'), 'ti-north', 107],
    ['the Bay Bridge to Clipper Cove', place('baybridge'), 'clipper', 107],
    ['home to her Berkeley slip from off Emeryville, south of the pier (the physics review)', place('emeryville'), 'slip', 107],
    ['from 8 m off Pier 45\'s head to off Alcatraz (the physics review)', { x: 1988, y: 78 }, 'alcatraz', 107, 3],
    // (the second review: starts a meter or two either way were wrecked or struck, and the gap on the plan's last leg)
    ['through the Berkeley gap on the last leg, south to north', { x: 10323, y: 5173 }, { x: 10083, y: 5725 }, 107],
    ['through it on the last leg, north to south', { x: 10083, y: 5725 }, { x: 10323, y: 5173 }, 107],
    // (engaged with way on beside Pier 45's head, a meter or two along or in from the one above: wrecked on it or struck
    // it, one with no plan from there at all, till the pilot took her off it first, ROADMAP 8q7)
    ['beside Pier 45\'s head, 2 m in', { x: 1986, y: 78 }, 'alcatraz', 107, 3],
    ['beside it, along it', { x: 1984, y: 80 }, 'alcatraz', 107, 3],
    // (the third review's: running along a pier's face at 3 m/s with the way on astern, the way off dead astern turned her
    // through the pier; and in irons by a pier head, a way off across the wind held her hard over till she went astern)
    ['running along a pier\'s face, the way on astern', { x: 3129, y: -113 }, 'alcatraz', 107, 3, { h: 164, v: 2.9 }],
    ['in irons by a pier head in a northerly', { x: 2646, y: -122 }, 'alcatraz', 107, 3, { h: 27, v: 0.1, wind: 'north' }]
  ];
  // (4 m off the pier's face converging on her at 4 kn: every turn closes it, held on she'd pass its corner a meter off her
  // side. No way off for a pilot: handed over at once with its alarm, and on as she was, ten seconds, she strikes nothing)
  it('beside it, 6 m out: handed over, too close alongside', () => {
    const r = passage({ x: 1994, y: 78 }, 'alcatraz', 107);
    console.log(`beside it, 6 m out: ${r.where}`);
    expect(r.u.wrecked, r.where).toBeUndefined(); expect(r.hits, r.where).toBe(0);
    expect(r.alarm, r.where).toMatch(/Too close alongside/); expect(r.min, r.where).toBeLessThan(0.5);
  }, 900_000);
  for (const [name, from, to, seed, keep = 10, start] of cases) it(name, () => {
    const r = passage(from, to, seed, 60, start);
    console.log(`${name}: ${r.where}`);
    expect(r.u.wrecked, r.where).toBeUndefined();
    expect(r.hits, `times she struck anything, ${r.where}`).toBe(0);
    // she gets there, or the pilot hands her over before a gap too narrow for it, with its alarm and sea room
    // (bound for her slip, arrived is the pilot's hand-over off the harbor's mouth: World.navTarget, you take her in)
    // (the gap alarm isn't a pass: none of these gaps is narrower than her turning room)
    expect(r.alarm, r.where).toBe('');
    expect(r.w.arrivedT != null || (to === 'slip' && r.mouth), `arrived or handed over at the mouth: ${r.where}`).toBe(true);
    if ((r.w.arrivedT != null || r.mouth) && r.planned === r.planned) expect(r.min, `no circling: within half as long again as planned, ${r.where}`).toBeLessThan(r.planned * 1.5 + 5);
    expect(r.near, `kept off the structures: ${r.where}`).toBeGreaterThan(keep);
  }, 900_000);
});
