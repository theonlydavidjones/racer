import { describe, expect, it } from 'vitest';
import { sail, startTack, testBoat } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew, placeCrew } from '../src/boat/crewPhys';

// On a run the crew settle on one side and stay there between gybes (crewPhys.ts HOLD.crossHeel, crossLast): they steady
// the roll by leaning, not by crossing the boat with each roll or puff. A gybe still takes them across, and on a reach a
// breeze filling in still has them up to windward at once.

/** Crossings of the boat's centreline by each person to a new seat (from a seat out on one side, beyond 0.15 m, to one on the other; not a
 * trip across to a job, the leeward jib winch, which is real). */
function crossings(b: ReturnType<typeof testBoat>, secs: number, each?: () => void): number[] {
  // (a side is had only out beyond 0.15 m: sitting in the middle and shifting a few inches either way is weight, not a crossing)
  const ppl = b.crew!.people, side = ppl.map(p => (Math.abs(p.x) > 0.15 ? Math.sign(p.x) : 0)), n = ppl.map(() => 0);
  sail(b, secs, () => { each?.(); ppl.forEach((p, j) => { if (Math.abs(p.x) > 0.15 && Math.sign(p.x) !== side[j]) { if (side[j] !== 0 && !p.job) n[j]++; side[j] = Math.sign(p.x); } }); });
  return n;
}

describe('the crew off the wind', () => {
  for (const [W, twa] of [[6, 135], [14, 170], [4, 160]] as const)
    it(`stay on their side between gybes: ${W} kt, ${twa}° true, the wind wandering ±8°`, () => {
      const b = testBoat({ heading: 360 - twa, kt: 4, windKt: W });
      sail(b, 30, () => { b.h = 360 - twa; });
      // (the wind shifting about her, as a puff's veer and a lull's back, and the heel and need with it; she holds her course)
      let t = 0; const from0 = b.ww.from;
      expect(crossings(b, 150, () => { t += 1 / 60; b.ww.from = from0 + 8 * Math.sin(t / 7); b.h = 360 - twa; })).toEqual([0, 0, 0]);
    }, 30_000);
  for (const twa of [80, 100, 115])
    it(`on a reach (${twa}° true), sitting to leeward in light air, they're up to windward within seconds when the breeze fills in`, () => {
      const b = testBoat({ heading: 360 - twa, kt: 3, windKt: 5 });
      sail(b, 40, () => { b.h = 360 - twa; });
      b.ww.kt = 14;
      sail(b, 8, () => { b.h = 360 - twa; });
      // (the helm and the crew, on the windward side: x > 0 is to windward in the crew's frame, b.crew.wind)
      const w = b.crew!.wind;
      expect(b.crew!.people.filter(p => p.x * w > 0.15).length, b.crew!.people.map(p => (p.x * w).toFixed(2)).join(',')).toBeGreaterThanOrEqual(2);
    }, 30_000);
  for (const twa of [75, 90, 110])
    it(`on a light-air reach (${twa}° true), the wind hovering about 6 kt, the helm stays on their side (crewPhys.ts HOLD.helmHeel)`, () => {
      const b = testBoat({ heading: 360 - twa, kt: 3, windKt: 6 });
      sail(b, 40, () => { b.h = 360 - twa; });
      // (gusts and lulls of half a knot either side, a few seconds each: the wind about the light-air threshold)
      let t = 0;
      expect(crossings(b, 150, () => { t += 1 / 60; b.ww.kt = 6 + 0.6 * Math.sin(t / 3) * Math.sin(t / 11); b.h = 360 - twa; })[0]).toBe(0);
    }, 30_000);
  // (and a lasting error does take the helm across, either way, after about HOLD.helmLast; placeCrew directly, with
  // the heel she's carrying set: settled on one side, then a steady error of 4-5 degrees the other way)
  for (const [need, heel, label] of [[-300, 1, 'too flat by 5: to leeward'], [300, 10, 'over-heeled by 4: up to windward']] as const)
    it(`on a light-air reach, a lasting heel error (${label}) takes the helm across after about 20 s, not at once`, () => {
      const c = newCrew(DEFAULT_CREW, 'S');
      const base = { twa: 90, tws: 6, v: 2, pole: false, tack: 'S' as const, windward: 1, beat: 42, extraMoment: 0, sea: 0, rmPerDeg: 250, bestHeel: 6 };
      for (let i = 0; i < 20 * 30; i++) placeCrew(c, { ...base, need: need < 0 ? 400 : -600, heel: 6 }, 0.05);
      const x0 = c.people[0].x; let crossed = -1;
      for (let i = 0; i < 20 * 60 && crossed < 0; i++) { placeCrew(c, { ...base, need, heel }, 0.05); if (Math.sign(c.people[0].x) !== Math.sign(x0)) crossed = i * 0.05; }
      expect(crossed, 'seconds before the helm went across').toBeGreaterThan(15);
      expect(crossed).toBeLessThan(30);
    });
  for (const [twa, W] of [[90, 5], [110, 4]] as const)
    it(`sailing a reach (${twa}° true), the wind falling from 9 to ${W} kt: the helm goes to leeward, after the wait`, () => {
      const b = testBoat({ heading: 360 - twa, kt: 4, windKt: 9 });
      sail(b, 40, () => { b.h = 360 - twa; });
      const w = b.crew!.wind; expect(b.crew!.people[0].x * w, 'to windward in 9 kt').toBeGreaterThan(0.15);
      b.ww.kt = W; let t = 0, crossed = -1;
      sail(b, 60, () => { t += 1 / 60; b.h = 360 - twa; if (crossed < 0 && b.crew!.people[0].x * w < -0.15) crossed = t; });
      expect(crossed, 'seconds before the helm was to leeward').toBeGreaterThan(18);
      expect(crossed).toBeLessThan(40);
    }, 30_000);
  it('a gybe still takes them across', () => {
    const b = testBoat({ heading: 360 - 165, kt: 4, windKt: 12 });
    sail(b, 30, () => { b.h = 360 - 165; });
    const before = b.crew!.people.map(p => Math.sign(p.x));
    startTack(b); sail(b, 25);
    const after = b.crew!.people.map(p => Math.sign(p.x));
    expect(after.filter((s, j) => s !== before[j]).length).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
