import { describe, expect, it } from 'vitest';
import { BOTTOM_COLORS, HULL_COLORS, TEAK_DECKS } from '../src/boat/spec';
import { bottomLine, colorName } from '../src/ui/colorName';

describe('colorName', () => {
  it('names a teak deck by its id, which is not a hex', () => {
    for (const [name, id] of TEAK_DECKS) expect(colorName([...TEAK_DECKS, ...HULL_COLORS], id)).toBe(name);
    expect(colorName(TEAK_DECKS, 'teak-silver')).toBe('Silvered teak');
  });
  it('names an exact swatch', () => expect(colorName(BOTTOM_COLORS, '#2b4f8f')).toBe('Blue'));
  it('falls back to the nearest swatch when close', () => expect(colorName(BOTTOM_COLORS, '#2c5090')).toBe('Blue'));
  it('says Custom when nothing is near, or the value is not a color', () => {
    expect(colorName(BOTTOM_COLORS, '#00ff00')).toBe('Custom');
    expect(colorName(HULL_COLORS, 'nonsense')).toBe('Custom');
  });
});
describe('bottomLine', () => {
  it('never leaves a stray comma', () => {
    expect(bottomLine('', 0)).toBe('just cleaned');
    expect(bottomLine('Blue', 0)).toBe('Blue, just cleaned');
    expect(bottomLine('Blue', 3)).toBe('Blue, cleaned 3 wk ago');
  });
});
