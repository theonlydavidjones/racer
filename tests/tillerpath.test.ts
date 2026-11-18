import { describe, expect, it } from 'vitest';
import { tillerClearance } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The tiller's path (the owner, 18 Nov 2026): "on a slight arc, so it's up off the deck at center, but travels slightly
// down and touches the deck at the extremes of its travel path"; "the deck does [block it], equally on both sides". Drawn
// on that arc (turned about the raked rudder line, no lift on its pin), it never goes into the deck, the toerail or the
// coaming, and it meets the deck at HARD_OVER: the physics' stop and the drawing's are one.
const R = Math.PI / 180, at = (deg: number) => tillerClearance(deg * R, 0, 200);
describe("The tiller's path (hull.ts tillerClearance, boat/balance.ts HARD_OVER)", () => {
  it('up off the deck amidships, coming down as it swings out', () => {
    expect(at(0)).toBeGreaterThan(0.05);
    expect(at(30)).toBeLessThan(at(0)); expect(at(HARD_OVER * 0.9)).toBeLessThan(at(30));
  });
  it(`never into the deck, the toerail or the coaming, to ±${HARD_OVER}°`, () => {
    const bad: string[] = [];
    for (let d = -HARD_OVER; d <= HARD_OVER; d += 0.5) if (at(d) < -0.0015) bad.push(`${d}°: ${(at(d) * 100).toFixed(1)} cm into it`);
    expect(bad).toEqual([]);
  });
  it('meeting the deck at hard over, each way, within half a degree', () => {
    for (const s of [1, -1]) { let d = 0; while (d < 90 && at(s * d) > 0) d += 0.05; expect(Math.abs(d - HARD_OVER), `${s > 0 ? 'to port' : 'to starboard'}: the arc meets the deck at ${d.toFixed(2)}°`).toBeLessThan(0.5); }
  });
});
