import { describe, expect, it } from 'vitest';
import { MARINAS } from '../src/geo/marina';
import { berthRows } from '../src/ui/berthName';

describe('the boat editor\'s Home berth rows', () => {
  it('name a known marina and its slip row', () => {
    const r = berthRows(MARINAS[0].id);
    expect(r.marina).toBe(MARINAS[0].name);
    expect(r.slipRow).toMatch(/^Slip in \S/);
  });
  it('read an unknown marina id as None, with no slip row', () => {
    expect(berthRows('gone-marina')).toEqual({ marina: 'None', slipRow: null });
    expect(berthRows(undefined)).toEqual({ marina: 'None', slipRow: null });
  });
});
