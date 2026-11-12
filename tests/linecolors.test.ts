import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, LINE_COLORS, fixSpec, lineColor } from '../src/boat/spec';

// The lines' colours, chosen in the boat editor and saved with the boat (owner, 12 Nov 2026)
describe('Line colours on a boat', () => {
  it('the usual colours until you choose', () => {
    expect(lineColor(DEFAULT_BOAT, 'mainsheet')).toBe(LINE_COLORS.mainsheet);
    expect(lineColor(null, 'backstay')).toBe(LINE_COLORS.backstay);
  });
  it('a chosen colour is hers, and kept through a save', () => {
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: { vang: '#d8343a' } });
    expect(lineColor(b, 'vang')).toBe('#d8343a');
    expect(lineColor(b, 'outhaul')).toBe(LINE_COLORS.outhaul);
    expect(JSON.parse(JSON.stringify(b)).lineColors).toEqual({ vang: '#d8343a' });
  });
  it('an old or damaged save keeps only real colours for real lines', () => {
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: { vang: 'red', spinnaker: '#ffffff', jibsheet: '#3fae5a' } as never });
    expect(b.lineColors).toEqual({ jibsheet: '#3fae5a' });
    expect(fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: { vang: 'nope' } as never }).lineColors).toBeUndefined();
  });
});
