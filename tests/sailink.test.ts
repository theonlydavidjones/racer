import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';

describe('sail numbers\' and the F\'s colours (the Boat page)', () => {
  it('none chosen by default (the contrasting ink); a chosen colour kept; anything else dropped', () => {
    expect(fixSpec(DEFAULT_BOAT).sails.numberColor).toBeUndefined();
    const s = fixSpec({ ...DEFAULT_BOAT, sails: { ...DEFAULT_BOAT.sails, numberColor: '#b3202a', insigniaColor: 'red' } });
    expect(s.sails.numberColor).toBe('#b3202a');
    expect(s.sails.insigniaColor).toBeUndefined();
  });
});
