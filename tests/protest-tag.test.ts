import { describe, expect, it } from 'vitest';
import { turnsTag } from '../src/render/labels';

describe("a boat's tag while she takes her penalty", () => {
  it('says which turn she is on, of how many (a two-turns penalty is 720°: RRS 44.2)', () => {
    expect(turnsTag({ penaltyTotal: 720, penaltyTurned: 0 })).toBe(' · turn 1 of 2');
    expect(turnsTag({ penaltyTotal: 720, penaltyTurned: -400 })).toBe(' · turn 2 of 2'); // (turning to port)
    expect(turnsTag({ penaltyTotal: 720, penaltyTurned: 719 })).toBe(' · turn 2 of 2');
    expect(turnsTag({ penaltyTotal: 360, penaltyTurned: 100 })).toBe(' · turn 1 of 1');
  });
});
