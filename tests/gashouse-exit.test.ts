import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { MOUTHS } from '../src/environment/harborMouth';
import { pilePierDist } from '../src/geo/shore';
import { bow, stern } from '../src/boat/boat';
import { brg, wrap } from '../src/core/math';

/**
 * Leaving Gashouse Cove (ROADMAP 8n; the owner: "one of the trickiest marina exits"): in the common westerly, on a
 * flood and on an ebb, a skilled exit is doable (speed built before the gap, held up to windward of Fort Mason's Pier 1,
 * out into the Bay) and a careless one (let go slow, the sails luffing, sagging off) is set onto the pier's piles.
 * Driven through the helm (the player's steering input, held on a heading), judged by outcomes: how near the piles she
 * comes, whether she has way on through the gap, whether she gets out (Deep Physics: these hold under any turning model).
 * She starts under way inside the cove, not from her slip (the push-off is changing).
 * In a westerly Pier 1 is to leeward on both tides, so the wind sets a careless boat down onto it either way. On the ebb
 * the stream does too, running across the gap (about 0.45 kt there in the piles' lee, 0.85 kt past the pier's head); on
 * the flood the gap is slack (the stream leaves the breakwater's knuckle: environment/harborMouth.ts) and it's the wind alone.
 */
const M = MOUTHS[0] as unknown as { a: { x: number; y: number }; b: { x: number; y: number }; into: { x: number; y: number }; along: { x: number; y: number } };
// a: Pier 1's corner (east, to leeward in a westerly); b: the breakwater's tip (west); `into`: into the cove (south)
const out = { x: -M.into.x, y: -M.into.y }, mid = { x: (M.a.x + M.b.x) / 2, y: (M.a.y + M.b.y) / 2 };
const at = (p: { x: number; y: number }, o: number, s = 0) => ({ x: p.x + out.x * o + M.along.x * s, y: p.y + out.y * o + M.along.y * s }); // (s + toward the breakwater, to windward)
const START = at(mid, -40);
const nearPiles = (u: { x: number; y: number; h: number }) => Math.min(pilePierDist(u), pilePierDist(bow(u as never)), pilePierDist(stern(u as never)));

function exit(current: 'flood' | 'ebb', how: 'skilled' | 'careless') {
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windKt: 14, windDir: 270, windTurn: 0, current, tideDate: '2026-11-14', traffic: 0 } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
  u.docked = undefined; u.handled = undefined; u.x = START.x; u.y = START.y; u.h = brg(out.x, out.y);
  u.v = how === 'skilled' ? 2.0 : 0.5;
  // skilled: out through the gap's windward half, then up to windward of the pier's head, then out into the Bay
  const legs = [at(mid, 0, 6), at(mid, 70, 25), at(mid, 200, 40)];
  let leg = 0, closest = Infinity, slowest = Infinity, wrecked = false, outAt: number | null = null;
  const trace: { across: number; kt: number; heel: number; v: number; cur: number; set: number }[] = [];
  for (let k = 0; k < 4 * 60 * 60 && outAt === null; k++) {
    if (how === 'skilled') {
      const q = legs[leg]; if (Math.hypot(q.x - u.x, q.y - u.y) < 12 && leg < legs.length - 1) leg++;
      u.steer = Math.max(-1, Math.min(1, wrap(brg(legs[leg].x - u.x, legs[leg].y - u.y) - u.h) / 15)); u.luff = false;
    } else { u.steer = 0; u.luff = true; } // (let go: the helm left and the sails flapping)
    w.step(DT);
    closest = Math.min(closest, nearPiles(u));
    const across = (u.x - mid.x) * out.x + (u.y - mid.y) * out.y; // (how far out of the mouth's line)
    if (Math.abs(across) < 10) slowest = Math.min(slowest, Math.hypot(u.vx, u.vy));
    // (what she feels: the wind over the water at her, her heel, her speed through the water, the stream and its push
    // across her heading)
    { const r = (u.h * Math.PI) / 180, ax = Math.cos(r), ay = -Math.sin(r); trace.push({ across, kt: u.ww.kt, heel: Math.abs(u.heel), v: u.v, cur: Math.hypot(u.cur.x, u.cur.y), set: Math.abs(u.cur.x * ax + u.cur.y * ay) }); }
    if (u.wrecked) wrecked = true;
    if (across > 150) outAt = w.t;
  }
  return { closest, slowest, wrecked, outAt, u, trace };
}

describe('leaving Gashouse Cove in a westerly', () => {
  for (const current of ['flood', 'ebb'] as const) {
    it(`on the ${current}: a skilled exit clears Pier 1's piles, with way on through the gap, and gets out`, () => {
      const r = exit(current, 'skilled');
      expect(r.wrecked).toBe(false);
      expect(r.closest, `closest to the piles (m)`).toBeGreaterThan(10); // (she starts 20 m off them; held up to windward, 19.9 m at her closest, both tides)
      expect(r.slowest, `slowest through the gap (m/s)`).toBeGreaterThan(2); // (2.65 m/s, both tides)
      expect(r.outAt, 'out 150 m past the mouth').not.toBeNull();
    }, 300_000);
    it(`on the ${current}: a careless exit, let go slow and luffing, is set onto the piles`, () => {
      const r = exit(current, 'careless');
      expect(r.closest, `closest to the piles (m)`).toBeLessThan(3); // (from 20 m off: down against the deck's edge, 1.9 m from the shed, both tides)
    }, 300_000);
  }
});

/**
 * Out of the shelter into the Bay (ROADMAP 8n.5; the owner: leaving Gashouse Cove the breeze and the stream should hit her
 * as she crosses out of the shelter: she heels, and she's set sideways). Just inside the mouth (20 m in to the mouth's
 * line) against just outside it (20–40 m out): within four boat lengths her heel about doubles and the stream's push
 * across her heading comes on. Her speed through the water rises only a little: near her hull speed a few more knots of
 * wind are worth little more speed, so she heels and drives, she doesn't leap (the drive she gains goes into heel and
 * into holding her speed against the chop outside). The current's edge is BASIN_MOUTH's (environment/current.ts).
 */
describe('crossing out of the cove\'s shelter', () => {
  for (const current of ['flood', 'ebb'] as const) it(`on the ${current}: within four boat lengths of the mouth she heels and is set sideways`, () => {
    const { trace } = exit(current, 'skilled');
    const mean = (k: keyof (typeof trace)[0], a: number, b: number) => { const q = trace.filter(t => t.across >= a && t.across < b); return q.reduce((s, t) => s + t[k], 0) / q.length; };
    const inH = mean('heel', -20, 0), outH = mean('heel', 20, 40), inS = mean('set', -20, 0), outS = mean('set', 20, 40), inV = mean('v', -20, 0), outV = mean('v', 20, 40);
    expect(outH, `heel ${inH.toFixed(1)}° inside, ${outH.toFixed(1)}° outside`).toBeGreaterThan(1.6 * inH); // (3.7° to 7.4–7.9°, both tides)
    expect(inS, 'the stream across her inside (m/s)').toBeLessThan(0.06); // (slack in the cove: 0 on the flood, 0.04 on the ebb)
    expect(outS - inS, `the stream across her: ${inS.toFixed(2)} inside, ${outS.toFixed(2)} m/s outside`).toBeGreaterThan(0.1); // (0.14 on the flood, 0.18 on the ebb)
    expect(outV).toBeGreaterThan(inV); expect(outV).toBeLessThan(1.1 * inV); // (2.6 to 2.7 m/s: she drives on, she doesn't leap)
  }, 300_000);
});

