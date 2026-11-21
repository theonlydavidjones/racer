import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { wrap } from '../src/core/math';
import { footReaches, slowTack } from '../src/boat/physics';
import { footStep } from '../src/ai/ai';
import type { Boat } from '../src/boat/boat';
import { FLAT_SEA } from '../src/environment/sea';

/**
 * AI steering in a dying breeze (ROADMAP; the Coordinator, 19 Nov 2026): in 1-4 kt her close-hauled speed is 0.5-1.2 m/s,
 * all under the old fixed SLOW_TACK of 1.3 m/s, so every tack her plan asked for the helm turned into a gybe right round
 * (250-280°, 100 s at 0.3 m/s in seed 4's 6 kt race when it died to 1-1.5 kt), and on the layline she bore away to build
 * a speed the wind couldn't give her. In this sim a committed tack from her own close-hauled speed gets through in 1-10 kt
 * in 6-24 s (sculling round the last of it, rule 42.3(d)), so in light air she tacks from TACK_WAY of that speed.
 */
/** (asked for the port close-hauled course from settled on starboard close-hauled, wind from 0: whether she bore away past
 * the beam, a gybe round, and when she was round) */
function askTack(b: Boat, s = 60, slow = false): { gybed: boolean; round: number } {
  const a = beatAngle(b.ww.kt);
  b.isUser = false; b.ai = { turnCommit: 0, commitFor: 0, goTack: slow ? { to: 'P', at: 0, mode: 'beat', leg: 0, slow } : null } as unknown as NonNullable<Boat['ai']>;
  b.desired = a;
  let gybed = false, round = -1;
  sail(b, s, t => { if (Math.abs(wrap(b.h - 180)) < 90) gybed = true; if (!gybed && Math.abs(wrap(b.h - a)) < 10) { round = t; return true; } });
  return { gybed, round };
}

describe('A tack in light air (physics.ts slowTack)', () => {
  it('in a deep lull in a breezy day\'s chop, or at its edge, footing can\'t be counted on to build the way', () => {
    // (v213 review, 20 Nov 2026: the chop is the day's wind's (world.ts seaWind), her threshold the wind at her; in 0.5 m
    // with 2 kt at her, footed 10° her target is under slowTack × 1.15, so ai.ts footed her on every think and she never
    // came round. v214 review: at the edge the table's target clears it, but as sailed in chop she settles 7-9% under
    // it (AI-steered 240 s: 0.428 m/s against a need of 0.433 in 2 kt and 0.4 m; 0.588 against 0.596 in 2.75 kt and
    // 0.5 m; 0.827 against 0.866 in 4 kt and 0.8 m), so footed forever there too. The chop's periods here are the sea's
    // for those heights, about: with a 3.3 s period the 4 kt case's target clears even the margin, so it rests on ai.ts
    // asking the tack after FOOT_FOR_S of footing, whatever this says.)
    for (const [kt, hsW, tpW] of [[2, 0.5, 2.8], [2, 0.4, 2.5], [2.75, 0.5, 2.8]])
      expect(footReaches({ ww: { kt }, sea: { ...FLAT_SEA, hsW, tpW } }), `${kt} kt in ${hsW} m chop`).toBe(false);
    for (const kt of [1, 2, 4, 8]) expect(footReaches({ ww: { kt }, sea: FLAT_SEA }), `${kt} kt, flat`).toBe(true);
  });
  it('asked a tack slow where footing couldn\'t build the way, she tacks through the wind, sculled, sooner than she\'d wear round', () => {
    // (v214 review, wearing against tacking: round at 97 s against 36 s in 2.5 kt and 0.5 m, 198 against 67 in 1 kt and
    // 0.3 m, 156 against 63 in 1.5 kt and 0.4 m. Rule 42.3(d), World Sailing's SCULL 1: sculled onto either tack's
    // close-hauled course. The wear won only from a dead stop, so from there she still wears.)
    for (const [kt, hsW, tpW] of [[2.5, 0.5, 2.8], [1, 0.3, 2.3], [1.5, 0.4, 2.5], [2, 0.5, 2.8]]) {
      const a = beatAngle(kt), b = testBoat({ heading: 360 - a, kt: 1, windKt: kt });
      b.sea = { ...FLAT_SEA, hsW, tpW }; sail(b, 90);
      const v0 = b.v, r = askTack(b, 90, true);
      expect(r.gybed, `${kt} kt, ${hsW} m: gybed round`).toBe(false);
      expect(r.round, `${kt} kt, ${hsW} m: round within 90 s, from ${v0.toFixed(2)} m/s`).toBeGreaterThan(0);
    }
    const a = beatAngle(2), b = testBoat({ heading: 360 - a, kt: 1, windKt: 2 });
    b.sea = { ...FLAT_SEA, hsW: 0.5, tpW: 2.8 }; sail(b, 90);
    b.vx = 0; b.vy = 0; b.v = 0;
    expect(askTack(b, 240, true).gybed, 'from a dead stop, she wears').toBe(true);
  });
  it('in chop, she wants at least the way she would in flat water (a seaway stops her head to wind sooner, not later)', () => {
    // (the physics review, 20 Nov 2026: with the share of her speed in chop, the threshold fell as the chop rose, 0.28 to
    // 0.12 m/s at 1.5 kt in 0.4 m, and to nothing at 1 kt; from there a tack took 72 s in 0.5 m and 201 s in 0.3 m)
    for (const kt of [1, 1.5, 3, 6]) for (const hsW of [0.3, 0.4, 0.5]) {
      const flat = slowTack({ ww: { kt }, sea: FLAT_SEA }), chop = slowTack({ ww: { kt }, sea: { ...FLAT_SEA, hsW, tpW: 2 } });
      expect(chop, `${kt} kt, ${hsW} m: ${chop.toFixed(2)} m/s in chop, ${flat.toFixed(2)} in flat water`).toBeGreaterThanOrEqual(flat);
      expect(flat, `${kt} kt`).toBeGreaterThan(0.1);
    }
  });
  it('in 3 kt, the edge: from just under TACK_WAY of her speed she gybes round, from just over it she tacks', () => {
    for (const [f, gybes] of [[0.9, true], [1.1, false]] as const) {
      const a = beatAngle(3), b = testBoat({ heading: 360 - a, kt: 1, windKt: 3 });
      sail(b, 90);
      const v = slowTack(b) * f; b.vx *= v / b.v; b.vy *= v / b.v; b.v = v;
      expect(askTack(b).gybed, `from ${v.toFixed(2)} m/s, ${f} of slowTack ${slowTack(b).toFixed(2)}`).toBe(gybes);
    }
  });
  it('a tack asked as a puff arrives (2 kt to 5 kt): judged by the wind she\'s been sailing in, she tacks', () => {
    const a = beatAngle(2), b = testBoat({ heading: 360 - a, kt: 1, windKt: 2 });
    sail(b, 90);
    b.ww = { from: 0, kt: 5 }; // (the puff, this moment: her speed is still the 2 kt breeze's)
    const r = askTack(b);
    expect(r.gybed, 'gybed round').toBe(false);
    expect(r.round).toBeGreaterThan(0);
  });
  for (const kt of [1.5, 2, 3, 4]) it(`in ${kt} kt, close-hauled at her own speed and asked for the other tack, she tacks, not gybes`, () => {
    const a = beatAngle(kt), b = testBoat({ heading: 360 - a, kt: 1, windKt: kt });
    sail(b, 90); // (settled close-hauled on starboard: wind from 0, heading 360 - a)
    b.isUser = false; b.ai = { turnCommit: 0, commitFor: 0 } as unknown as NonNullable<Boat['ai']>;
    b.desired = a; // (port close-hauled)
    let far = 0, round = -1;
    sail(b, 60, t => { far = Math.max(far, Math.abs(wrap(b.h - 180))< 90 ? 1 : 0); if (Math.abs(wrap(b.h - a)) < 10) { round = t; return true; } });
    expect(far, `in ${kt} kt she bore away past the beam (a gybe round), from ${(b.v).toFixed(2)} m/s`).toBe(0);
    expect(round, 'round onto port close-hauled within 40 s').toBeGreaterThan(0);
    expect(round).toBeLessThan(40);
  });
  it('in 12 kt, slowed to 1 m/s, she still bears away round (above SLOW_TACK\'s reach, as before)', () => {
    const a = beatAngle(12), b = testBoat({ heading: 360 - a, kt: 1, windKt: 12 });
    sail(b, 60); b.v = 1.0;
    b.isUser = false; b.ai = { turnCommit: 0, commitFor: 0 } as unknown as NonNullable<Boat['ai']>;
    b.desired = a;
    let far = false;
    sail(b, 60, () => { if (Math.abs(wrap(b.h - 180)) < 60) far = true; });
    expect(far, 'gybed round').toBe(true);
  });
});

describe('Footing for the way to tack (ai.ts footStep)', () => {
  // (the v215 review: footT was zeroed only off the beat or when a tack was set, so 25 s footed for a tack that then
  // lapsed was banked, and the next slow tack was asked after 5 s; a header's single think banked its step too)
  const run = (footT: number, thinks: [slow: boolean, s: number][], dt = 0.05) => {
    let asked = -1, t = 0;
    for (const [slow, s] of thinks) for (let i = 0; i < Math.round(s / dt); i++, t += dt) {
      const f = footStep(footT, slow, slow, dt); footT = f.footT;
      if (slow && !f.foot && asked < 0) asked = t;
    }
    return { footT, asked };
  };
  it('a tack she footed 25 s for and then dropped leaves nothing banked: the next one gets its full 30 s', () => {
    const r = run(0, [[true, 25], [false, 1], [true, 40]]);
    expect(r.asked - 26, 'footed before asking the next').toBeGreaterThanOrEqual(29.9);
  });
  it('a header\'s one think banks nothing', () => {
    expect(run(0, [[true, 0.05], [false, 0.05]]).footT).toBe(0);
  });
  it('footing she asks the tack after 30 s', () => {
    const r = run(0, [[true, 40]]);
    expect(r.asked).toBeGreaterThanOrEqual(29.9); expect(r.asked).toBeLessThan(30.2);
  });
});
