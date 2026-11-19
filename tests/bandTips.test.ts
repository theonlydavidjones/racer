import { describe, expect, it } from 'vitest';
import { BAND_TIPS } from '../src/ui/sailBand';

// the owner (18 Nov 2026): "gargantuan copy blocks. no one will read this": one line each
describe('the sail band tips', () => {
  it('are one short line each', () => {
    for (const [k, t] of Object.entries(BAND_TIPS)) expect(t.length, `${k}: ${t}`).toBeLessThanOrEqual(90);
  });
  it('carry no brand names', () => {
    for (const [k, t] of Object.entries(BAND_TIPS)) expect(t, k).not.toMatch(/North|Heikkil|Sails/);
  });
});
