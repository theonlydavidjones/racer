import { describe, expect, it } from 'vitest';
import { BAND_TIPS } from '../src/ui/sailBand';

// the owner (18 Nov 2026): "gargantuan copy blocks. no one will read this": one line each
describe('the sail band tips', () => {
  it('are one short line each', () => {
    for (const [k, t] of Object.entries(BAND_TIPS)) expect(t.length, `${k}: ${t}`).toBeLessThanOrEqual(90);
  });
  // (rig audit 3: the car's athwartships hole only changes the lead angle, controls.ts jibAngle; jibShape reads its fore
  // and aft hole alone, so moving it out opens the slot but doesn't make the jib any fuller)
  it("the jib car's says what moving it out does", () => {
    expect(BAND_TIPS.car).not.toMatch(/fuller/);
    expect(BAND_TIPS.car).toMatch(/out to open the slot/);
  });
  it('carry no brand names', () => {
    for (const [k, t] of Object.entries(BAND_TIPS)) expect(t, k).not.toMatch(/North|Heikkil|Sails/);
  });
});
