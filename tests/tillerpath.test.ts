import { describe, expect, it } from 'vitest';
import { tillerClearance, tillerLift } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The tiller's path (the owner, 18 Nov 2026): "on a slight arc, so it's up off the deck at center, but travels slightly
// down and touches the deck at the extremes of its travel path". Turned about the raked rudder line its end comes down as
// it swings; drawn, it never goes into the deck, the toerail or the coaming, and at hard over it rests on them.
const R = Math.PI / 180, at = (deg: number) => tillerClearance(deg * R, tillerLift(deg * R));
describe("The tiller's path (hull.ts tillerLift)", () => {
  it('up off the deck amidships', () => {
    expect(at(0)).toBeGreaterThan(0.05);
  });
  it(`never into the deck, the toerail or the coaming, every degree to ±${HARD_OVER}°`, () => {
    const bad: string[] = [];
    for (let d = -HARD_OVER; d <= HARD_OVER; d++) if (at(d) < -0.001) bad.push(`${d}°: ${(at(d) * 100).toFixed(1)} cm into it`);
    expect(bad).toEqual([]);
  });
  it('touching at hard over, each way: resting on it, not held off it nor sunk in', () => {
    for (const d of [-HARD_OVER, HARD_OVER]) { expect(at(d), `${d}°`).toBeGreaterThan(-0.001); expect(at(d), `${d}°`).toBeLessThan(0.003); }
  });
  it('coming down as it swings out, to where it rests', () => {
    expect(at(30)).toBeLessThan(at(0)); expect(at(45)).toBeLessThan(at(30));
  });
});
