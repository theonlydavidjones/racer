import { describe, expect, it } from 'vitest';
import { begunTack } from '../src/rules/pairs';
import { boat } from './diagram';

// Rule 20: "respond ... by tacking as soon as possible". The response is the helm going down; a slow boat, against her
// yaw inertia, can take 5 s to turn 15° (Deep Physics' turning model). Wind from 000°; starboard close-hauled at 315.
describe('rule 20: a tack begun, by the helm', () => {
  const hail = (B: ReturnType<typeof boat>) => ({ at: 50, headAt: { [B.id]: { h: 315, wind: 0 } } });
  it('the helm hard down to windward, her bow 3° up: begun', () => {
    const B = boat('B', { at: [0, 0], heading: 318 }); B.helm = 0.8;
    expect(begunTack(B, hail(B), 0)).toBe(true);
  });
  it('a steering correction (0.2 of the throw), or the helm down to leeward: not begun', () => {
    const B = boat('B', { at: [0, 0], heading: 318 }); B.helm = 0.2;
    expect(begunTack(B, hail(B), 0)).toBe(false);
    B.helm = -0.8;
    expect(begunTack(B, hail(B), 0)).toBe(false);
  });
  it('the helm down but her bow not yet moving: not yet', () => {
    const B = boat('B', { at: [0, 0], heading: 315 }); B.helm = 0.9;
    expect(begunTack(B, hail(B), 0)).toBe(false);
  });
  it('without a helm (a diagram), 15° up as before', () => {
    expect(begunTack(boat('B', { at: [0, 0], heading: 331 }), hail(boat('X', { at: [0, 0], heading: 331 })), 0)).toBe(false); // (no record of her)
    const B = boat('B', { at: [0, 0], heading: 331 });
    expect(begunTack(B, hail(B), 0)).toBe(true);
  });
});

describe('rule 20: the helm signal, the review\'s cases', () => {
  const hail = (B: ReturnType<typeof boat>, h: number) => ({ at: 50, headAt: { [B.id]: { h, wind: 0 } } });
  it('a boat on a reach rounding up with the helm hard over is not tacking (no further off the wind than about close-hauled)', () => {
    const B = boat('B', { at: [0, 0], heading: 275 }); B.helm = 0.9; // hailed at 270, a beam reach: 85° off
    expect(begunTack(B, hail(B, 270), 0)).toBe(false);
  });
  it('once started, a dip of the blade mid-tack doesn\'t stop her tacking while her bow stays up', () => {
    const B = boat('B', { at: [0, 0], heading: 322 }); B.helm = 0.2;
    expect(begunTack(B, hail(B, 315), 0, true)).toBe(true);
    expect(begunTack(B, hail(B, 315), 0, false)).toBe(false);
  });
});
