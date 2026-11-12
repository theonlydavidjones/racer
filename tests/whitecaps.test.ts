import { describe, expect, it } from 'vitest';
import { SeaField } from '../src/environment/sea';

/** The whitecaps where the chop isn't blocked, at a wind of `kt` over open bay water, no current. */
const white = (kt: number) => new SeaField({ hs: 1, tp: 10, from: 270 }).at({ x: 0, y: 1500 }, { from: 270, kt }, { x: 0, y: 0 }, () => ({ x: 0, y: 0 })).white;

describe("whitecaps (Monahan & O'Muircheartaigh 1980: W = 3.84e-6·U^3.41)", () => {
  it('cover the fraction of the water the law gives: about 1% in 20 kt, 2.4% in 25, 4.3% in 30', () => {
    for (const [kt, W] of [[15, 0.004], [20, 0.0109], [25, 0.0235], [30, 0.043]] as const) expect(white(kt) / W).toBeCloseTo(1, 1);
  });
  it('grow steeply with the wind, and never past about a tenth', () => {
    expect(white(30)).toBeGreaterThan(3 * white(20));
    expect(white(60)).toBeLessThanOrEqual(0.1);
  });
});
