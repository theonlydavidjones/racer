import { describe, expect, it } from 'vitest';
import { puffAhead, type PuffWind } from '../src/sim/lessons';
import type { Puff } from '../src/environment/wind';
import { KT } from '../src/core/math';

/** w028: lesson 11 sees a puff coming, from the sim's own wind, before it reaches her. */
describe('puffAhead: the wind coming down to her', () => {
  // the wind from the west (blowing toward +x) at 15 kt; she sits still at the origin
  const still = { x: 0, y: 0, vx: 0, vy: 0, kt: 15 };
  const calm = { at: () => ({ u: 0, v: 0 }) };
  const w = (o: Partial<PuffWind>): PuffWind => ({ gusts: calm, puffs: { cells: [], gustiness: 1, dir: { x: 1, y: 0 } }, wind: { from: 270, kt: 15 }, ...o });
  // a gust 3σ strong (a σ of about 0.65 m/s in 15 kt, so about 3.8 kt) in the air between 60 and 140 m upwind of her now
  const gust = { at: (p: { x: number }) => ({ u: p.x <= -60 && p.x >= -140 ? 3 : 0, v: 0 }) };
  it('a gust upwind, carried with the air at the wind\'s speed (7.7 m/s): seen 8 s before it reaches her, marked where it is', () => {
    const r = puffAhead(w({ gusts: gust }), still)!;
    expect(r.inS).toBe(8); // (its near edge 60 m off: 60 / 7.7 = 7.8 s, the first whole second it's on her is the 8th)
    expect(r.at.x).toBeCloseTo(-8 * 15 * KT, 3); expect(r.at.y).toBeCloseTo(0, 6);
    expect(puffAhead(w({ gusts: gust }), { ...still, vx: -2.5 })!.inS).toBe(6); // (beating into it at 2.5 m/s: sooner)
  });
  it('a puff (the slow patches) coming at its own 6 m/s: seen once its heart is within reach', () => {
    const puff: Puff = { x: -150, y: 0, r: 100, amp: 0.25, age: 60, life: 200, dx: 1, dy: 0, v: 6 };
    expect(puffAhead(w({ puffs: { cells: [puff], gustiness: 1, dir: { x: 1, y: 0 } } }), still)!.inS).toBe(11);
  });
  it('nothing when the wind ahead is the mean, a lull, too far off, or the gust is already on her', () => {
    expect(puffAhead(w({}), still)).toBeNull();
    expect(puffAhead(w({ gusts: { at: (p: { x: number }) => ({ u: p.x < -60 ? -3 : 0, v: 0 }) } }), still)).toBeNull();
    expect(puffAhead(w({ gusts: { at: (p: { x: number }) => ({ u: p.x < -200 ? 3 : 0, v: 0 }) } }), still)).toBeNull(); // (26 s away)
    expect(puffAhead(w({ gusts: { at: () => ({ u: 3, v: 0 }) } }), still)).toBeNull();
  });
});

describe('puffAhead in the lesson itself: what it calls is what comes (the sim\'s own wind)', () => {
  it('her wind is up when it said it would be', async () => {
    const { COURSES } = await import('../src/courses/registry');
    const { DEFAULT_SETTINGS } = await import('../src/settings');
    const { DT, World } = await import('../src/sim/world');
    const S = { ...DEFAULT_SETTINGS, windKind: 'west' as const, windKt: 12, mode: 'lesson' as const, lesson: 'breeze' as const, sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0 as const };
    const w = new World(COURSES[0], S, 3, { freeSail: true });
    const calls: { at: number; base: number }[] = [], got: number[] = [];
    let next = 0;
    for (let s = 0; s < 600; s++) {
      for (let i = 0; i < Math.round(1 / DT); i++) w.step(DT);
      const u = w.user, here = w.windHere(u).kt, mean = w.windHere(u, undefined, false).kt;
      for (const c of calls) if (Math.abs(w.t - c.at) < 0.5) got.push(here - c.base);
      if (w.t < next) continue;
      const p = puffAhead(w, { x: u.x, y: u.y, vx: u.vx ?? 0, vy: u.vy ?? 0, kt: u.ww.kt });
      if (p) { calls.push({ at: w.t + p.inS, base: mean }); next = w.t + p.inS + 5; }
    }
    expect(calls.length).toBeGreaterThanOrEqual(5); // (ten minutes of a 15 kt breeze: puffs every 15–30 s)
    // (at the second it named, her wind over the mean it was called from: most up by the lesson's 1.5 kt, give or take
    // half a knot; the mean itself turns and the boat's way changes in the meantime)
    expect(got.filter(g => g >= 1.0).length / got.length).toBeGreaterThanOrEqual(0.7);
  }, 600000);
});
