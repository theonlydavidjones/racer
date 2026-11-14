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
  for (let k = 0; k < 4 * 60 * 60 && outAt === null; k++) {
    if (how === 'skilled') {
      const q = legs[leg]; if (Math.hypot(q.x - u.x, q.y - u.y) < 12 && leg < legs.length - 1) leg++;
      u.steer = Math.max(-1, Math.min(1, wrap(brg(legs[leg].x - u.x, legs[leg].y - u.y) - u.h) / 15)); u.luff = false;
    } else { u.steer = 0; u.luff = true; } // (let go: the helm left and the sails flapping)
    w.step(DT);
    closest = Math.min(closest, nearPiles(u));
    const across = (u.x - mid.x) * out.x + (u.y - mid.y) * out.y; // (how far out of the mouth's line)
    if (Math.abs(across) < 10) slowest = Math.min(slowest, Math.hypot(u.vx, u.vy));
    if (u.wrecked) wrecked = true;
    if (across > 150) outAt = w.t;
  }
  return { closest, slowest, wrecked, outAt, u };
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
