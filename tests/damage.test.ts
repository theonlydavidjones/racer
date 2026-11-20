import { describe, expect, it } from 'vitest';
import { DAMAGE_V, damageOf, impactEnergy } from '../src/boat/damage';

// One damage measure for the rules (RRS 14, 43.1(c), 44.1(b)) and the wreck outcome (docs/WRECK-PROPOSAL.md)
const M = 1930; // a Folkboat's displacement, kg
describe('damage (src/boat/damage.ts)', () => {
  it('the energy: ½·m·v² against something fixed; the reduced mass between two boats', () => {
    expect(impactEnergy(1, M)).toBeCloseTo(965, 6);
    expect(impactEnergy(1, M, M)).toBeCloseTo(482.5, 6); // (μ = m/2)
    expect(impactEnergy(Math.SQRT2, M, M)).toBeCloseTo(impactEnergy(1, M), 6); // two boats closing at √2 m/s = a wall at 1
  });
  it('against concrete or rock: a scrape, then damage, then a wreck, at the bands\' speeds', () => {
    for (const struck of ['concrete', 'rock'] as const) {
      expect(damageOf(impactEnergy(DAMAGE_V.scrape * 0.9, M), struck, M)).toBe('scrape');
      expect(damageOf(impactEnergy(1.0, M), struck, M)).toBe('damage');
      expect(damageOf(impactEnergy(DAMAGE_V.wreck * 1.1, M), struck, M)).toBe('wreck');
    }
  });
  it('another boat: a scrape, damage (43.1(c)) or serious damage (44.1(b)), never a wreck', () => {
    expect(damageOf(impactEnergy(0.6, M, M), 'boat', M)).toBe('scrape');
    expect(damageOf(impactEnergy(1.4, M, M), 'boat', M)).toBe('damage');
    expect(damageOf(impactEnergy(2.5, M, M), 'boat', M)).toBe('serious');
    expect(damageOf(impactEnergy(8, M, M), 'boat', M)).toBe('serious');
  });
  it('a ship is a wreck at any speed; piles by the blow, as concrete (lying against them is nothing); a fendered dock a scrape at most; mud nothing', () => {
    expect(damageOf(impactEnergy(0.2, M), 'ship', M)).toBe('wreck');
    expect(damageOf(impactEnergy(0.05, M), 'piles', M)).toBe('scrape');
    expect(damageOf(impactEnergy(2, M), 'piles', M)).toBe('wreck');
    expect(damageOf(impactEnergy(3, M), 'dock', M)).toBe('scrape');
    expect(damageOf(impactEnergy(3, M), 'mud', M)).toBe('none');
    expect(damageOf(0, 'rock', M)).toBe('none');
  });
});
