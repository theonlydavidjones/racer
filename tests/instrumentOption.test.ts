import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';

// the cabin-top instrument is optional in her setup (the owner, 15 Nov 2026): fitted unless you say none
describe('the cabin-top instrument option', () => {
  it('is fitted by default, and on older saves', () => {
    expect(fixSpec(structuredClone(DEFAULT_BOAT)).instrument).toBeUndefined();
    expect(fixSpec({ ...structuredClone(DEFAULT_BOAT), instrument: 'junk' as never }).instrument).toBeUndefined();
  });
  it('keeps none through a save and load', () => {
    const s = fixSpec({ ...structuredClone(DEFAULT_BOAT), instrument: 'none' });
    expect(fixSpec(JSON.parse(JSON.stringify(s))).instrument).toBe('none');
  });
});
