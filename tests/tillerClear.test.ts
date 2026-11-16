import { describe, expect, it } from 'vitest';
import { tillerClearance, tillerLift } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The tiller: a rigid straight spar, turned with the rudder about her 46° hinge to hard over either way (balance.ts
// HARD_OVER, 75°: the owner's own boat) and lifted on its pin only as far as it rides up over the coaming and the rail
// (hull.ts TILLER, tillerLift)
const R = Math.PI / 180;
describe('The tiller clears the deck at every angle to hard over (hull.ts tillerLift)', () => {
  it(`never below the deck, the toerail, the coaming or the deck's edge, to ±${HARD_OVER}°`, () => {
    let worst = 9, at = 0;
    for (let deg = -HARD_OVER; deg <= HARD_OVER; deg += 0.5) { const c = tillerClearance(deg * R, tillerLift(deg * R), 80); if (c < worst) { worst = c; at = deg; } }
    expect(worst, `at ${at}°`).toBeGreaterThan(0.005);
  });
  it('lies at its working angle, unlifted, through the helm sailing uses (to 40° either way)', () => {
    for (let deg = 0; deg <= 40; deg += 5) expect(tillerLift(deg * R), `${deg}°`).toBe(0);
  });
  it('rides up no more than it needs: about 20° at hard over, and never down as it goes further over', () => {
    const l75 = tillerLift(HARD_OVER * R) / R; expect(l75).toBeGreaterThan(10); expect(l75).toBeLessThan(30);
    for (let deg = 0; deg < HARD_OVER; deg += 1) expect(tillerLift((deg + 1) * R)).toBeGreaterThanOrEqual(tillerLift(deg * R));
  });
});
