import { describe, expect, it } from 'vitest';
import { tillerClearance, tillerLift } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The tiller: a rigid straight spar, turned with the rudder about her 46° hinge to hard over either way, where it comes
// down onto the after deck (balance.ts HARD_OVER, the deck's stop: the owner's ruling, 18 Nov 2026; 75° and lifted on its
// pin until then). It rides on its arc alone, with no lift (hull.ts TILLER, tillerLift; tests/tillerpath.test.ts holds the
// stop to the arc)
const R = Math.PI / 180;
describe('The tiller clears the deck at every angle to hard over (hull.ts tillerLift)', () => {
  it(`clear of the deck, the toerail, the coaming and the deck's edge until it comes down onto the deck at ±${HARD_OVER}°`, () => {
    // (5 mm clear to a degree and a half short of the stop, as it was asked all the way to 75° while it was lifted; at
    // the stop it rests on the deck, within 2 mm: the owner's ruling, 18 Nov 2026)
    let worst = 9, at = 0;
    for (let deg = -HARD_OVER + 1.5; deg <= HARD_OVER - 1.5; deg += 0.5) { const c = tillerClearance(deg * R, tillerLift(deg * R), 80); if (c < worst) { worst = c; at = deg; } }
    expect(worst, `at ${at}°`).toBeGreaterThan(0.005);
    for (const deg of [-HARD_OVER, HARD_OVER]) expect(Math.abs(tillerClearance(deg * R, 0, 80)), `resting at ${deg}°`).toBeLessThan(0.002);
  });
  it('rides on its arc with no lift on its pin, at any angle to hard over (it rode up about 20° at 75° until 18 Nov 2026)', () => {
    for (let deg = -HARD_OVER; deg <= HARD_OVER; deg += 0.5) expect(tillerLift(deg * R), `${deg}°`).toBe(0);
  });
});
