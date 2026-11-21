import { describe, expect, it } from 'vitest';
// @ts-ignore node:fs for the test's report
import { appendFileSync } from 'node:fs';
import { LESSON_MARKS, baseFactor, puffAhead, type PuffWind } from '../src/sim/lessons';
import type { Puff } from '../src/environment/wind';
import { KT } from '../src/core/math';

/** w028: lesson 11 sees a puff coming, from the sim's own wind, before it reaches her. */
describe('puffAhead: the wind coming down to her', () => {
  // the course's wind from the west (blowing toward +x) at 15 kt; where she is the field makes it 18 (k 1.2: her local
  // wind isn't the mean the air travels at); she sits still at the origin
  const still = { x: 0, y: 0, vx: 0, vy: 0 };
  const calm = { at: () => ({ u: 0, v: 0 }) };
  const w = (o: Partial<PuffWind>): PuffWind => ({ gusts: calm, puffs: { cells: [], gustiness: 1, dir: { x: 1, y: 0 } }, wind: { from: 270, kt: 15 }, fieldAt: () => ({ k: 1.2 }), ...o });
  // a gust 3σ strong (σ about 0.7 m/s in 18 kt: about 4 kt) in the air between 60 and 140 m upwind of her now
  const gust = { at: (p: { x: number }) => ({ u: p.x <= -60 && p.x >= -140 ? 3 : 0, v: 0 }) };
  it('a gust upwind, carried with the air at the course\'s mean wind (15 kt, 7.7 m/s, not her local 18): seen 8 s out, marked where it is', () => {
    const r = puffAhead(w({ gusts: gust }), still)!;
    expect(r.inS).toBe(8); // (its near edge 60 m off: 60 / 7.7 = 7.8 s, so the 8th second; at her 18 kt it'd say 7)
    expect(r.at.x).toBeCloseTo(-8 * 15 * KT, 3); expect(r.at.y).toBeCloseTo(0, 6);
    expect(puffAhead(w({ gusts: gust }), { ...still, vx: -2.5 })!.inS).toBe(6); // (beating into it at 2.5 m/s: sooner)
  });
  it('a puff (the slow patches) coming at its own 6 m/s: seen once its heart is within reach', () => {
    const puff: Puff = { x: -150, y: 0, r: 100, amp: 0.25, age: 60, life: 200, dx: 1, dy: 0, v: 6 };
    // (+25% at its heart of her 18 kt base: 1.5 kt once its heart is within about 95 m, (1 − d²)² · sin(π·age/life) · 0.25 · 18 ≥ 1.5)
    expect(puffAhead(w({ puffs: { cells: [puff], gustiness: 1, dir: { x: 1, y: 0 } } }), still)!.inS).toBe(10);
  });
  it('nothing when the wind ahead is the mean, a lull, too far off, or the gust is already on her', () => {
    expect(puffAhead(w({}), still)).toBeNull();
    expect(puffAhead(w({ gusts: { at: (p: { x: number }) => ({ u: p.x < -60 ? -3 : 0, v: 0 }) } }), still)).toBeNull();
    expect(puffAhead(w({ gusts: { at: (p: { x: number }) => ({ u: p.x < -200 ? 3 : 0, v: 0 }) } }), still)).toBeNull(); // (26 s away)
    expect(puffAhead(w({ gusts: { at: () => ({ u: 3, v: 0 }) } }), still)).toBeNull();
  });
});

/**
 * The cue against the sim's own wind (Deep Physics' review, 21 Nov 2026): three seeds in 6, 12 and 18 kt, sailing ten
 * minutes each. A call is honest when her wind (windHere) is under the cue's own 1.5 kt over the base (baseFactor: the
 * sim's wind where she is without its puffs and gusts) until 2 s before the second it named, and over it within ±1 s of that second.
 * The null: the same test at random seconds, with the calls' own spread of seconds ahead. The calls must be honest at
 * least 70% of the time and at least twice as often as the null.
 */
describe('puffAhead in the World: the seconds it names are honest', () => {
  const REPORT = '/tmp/puffAhead-report.txt';
  for (const kt of [6, 12, 18]) {
    it(`in ${kt} kt, three seeds`, async () => {
      const { COURSES } = await import('../src/courses/registry');
      const { DEFAULT_SETTINGS } = await import('../src/settings');
      const { DT, World } = await import('../src/sim/world');
      const need = LESSON_MARKS.puffKt;
      let calls = 0, honest = 0, nullN = 0, nullHit = 0, events = 0;
      for (const seed of [1, 2, 3]) {
        const S = { ...DEFAULT_SETTINGS, windKind: 'west' as const, windKt: kt, mode: 'sail' as const, sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0 as const };
        const w = new World(COURSES[0], S, seed, { freeSail: true });
        const rise: number[] = [], made: { t: number; inS: number }[] = [];
        let next = 0;
        for (let s = 0; s < 600; s++) {
          for (let i = 0; i < Math.round(1 / DT); i++) w.step(DT);
          const u = w.user, bf = baseFactor(w), base = w.wind.kt * bf(u).k;
          rise.push(w.windHere(u).kt - base);
          if (s < next) continue;
          const p = puffAhead({ gusts: w.gusts, puffs: w.puffs, wind: w.wind, fieldAt: bf }, { x: u.x, y: u.y, vx: u.vx ?? 0, vy: u.vy ?? 0 });
          if (p) { made.push({ t: s, inS: p.inS }); next = s + p.inS + 5; } // (one call a puff)
        }
        const ok = (t: number, inS: number): boolean | null => {
          const at = t + inS; if (at + 1 >= rise.length) return null;
          for (let k = t; k <= at - 2; k++) if (rise[k] >= need) return false; // (it came early, or was already there)
          return Math.max(rise[at - 1], rise[at], rise[at + 1]) >= need;
        };
        for (const c of made) { const r = ok(c.t, c.inS); if (r == null) continue; calls++; if (r) honest++; }
        // (the puffs that really came: her wind crossing the mark from under it)
        for (let k = 1; k < rise.length; k++) if (rise[k] >= need && rise[k - 1] < need) events++;
        // (the null: random seconds where her wind is under the mark, each with a call's own seconds ahead)
        let rs = seed * 9301 + 49297;
        const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
        for (let k = 0; k < 400 && made.length; k++) {
          const t = Math.floor(rnd() * (rise.length - 20)), inS = made[Math.floor(rnd() * made.length)].inS;
          if (rise[t] >= need) continue;
          const r = ok(t, inS); if (r == null) continue; nullN++; if (r) nullHit++;
        }
      }
      const hit = honest / Math.max(1, calls), base = nullHit / Math.max(1, nullN);
      appendFileSync(REPORT, `${kt} kt: ${events} puffs came; ${calls} calls, ${honest} honest (${(100 * hit).toFixed(0)}%); null ${nullHit}/${nullN} (${(100 * base).toFixed(0)}%)\n`);
      // (in 6 kt the cue's 1.5 kt is a quarter of the wind: few gusts reach it, and the calls are as few as the puffs that
      // came; the lesson itself sails in 15)
      expect(calls).toBeGreaterThanOrEqual(Math.min(5, Math.ceil(events / 2)));
      if (!calls) return;
      expect(hit).toBeGreaterThanOrEqual(0.7);
      expect(hit).toBeGreaterThanOrEqual(2 * base);
    }, 900000);
  }
});
