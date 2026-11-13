import { describe, expect, it } from 'vitest';
import { sail, startTack, testBoat } from './helpers/testBoat';

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
  it('a gybe still takes them across', () => {
    const b = testBoat({ heading: 360 - 165, kt: 4, windKt: 12 });
    sail(b, 30, () => { b.h = 360 - 165; });
    const before = b.crew!.people.map(p => Math.sign(p.x));
    startTack(b); sail(b, 25);
    const after = b.crew!.people.map(p => Math.sign(p.x));
    expect(after.filter((s, j) => s !== before[j]).length).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
