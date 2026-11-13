import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { beatAngle, polar } from '../src/boat/polar';
import { D2R, KT } from '../src/core/math';
import { HOVE, sailWind } from '../src/boat/physics';
import { windSide } from '../src/boat/dynamics';

/** Her slip angle (deg, to leeward on starboard tack: the boat frame's sway to port). */
const slipOf = (b: { v: number; sway?: number }) => Math.atan2(-(b.sway ?? 0), b.v) / D2R;

/** Close-hauled on starboard, steering her leeway above the beat angle, for a minute and a half: her mean leeway, the
 * model's, and her speed made good to windward (along her course through the water). */
function beat(W: number) {
  const twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: polar(W, twa, 'jib') / KT, windKt: W });
  let n = 0, slip = 0, vmg = 0;
  sail(b, 90, t => {
    b.h = courseHeading(b, 360 - twa);
    if (t > 60) { const s = slipOf(b); slip += s; vmg += Math.hypot(b.v, b.sway ?? 0) * Math.cos((360 - b.h + s) * D2R); n++; }
  });
  return { b, slip: slip / n, model: b.leeway ?? 0, vmg: vmg / n, polarVmg: polar(W, twa, 'jib') * Math.cos(twa * D2R) };
}

describe('leeway (physics.ts: the keel\'s lift against the sails\' side force)', () => {
  it('close-hauled at full speed she makes 3–6° of leeway, more as the breeze builds, and the model knows it', () => {
    const r = [6, 12, 20].map(beat);
    for (const x of r) {
      expect(x.slip).toBeGreaterThan(2.5); expect(x.slip).toBeLessThan(6.5);
      expect(Math.abs(x.slip - x.model)).toBeLessThan(0.5);
    }
    expect(r[0].slip).toBeLessThan(r[1].slip); expect(r[1].slip).toBeLessThan(r[2].slip);
  }, 180_000);
  it("steering her leeway above the beat, she makes the polar's VMG (ORC's angles are the course's)", () => {
    for (const W of [6, 12, 20]) { const x = beat(W); expect(x.vmg / x.polarVmg).toBeGreaterThan(0.985); expect(x.vmg / x.polarVmg).toBeLessThan(1.015); }
  }, 180_000);
  it('slow, little holds her: at 1.5 kt close-hauled in 12 kt she sags off at 0.3–0.7 kt', () => {
    const W = 12, twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 1.5, windKt: W });
    sail(b, 2, () => { b.h = 360 - twa; b.v = 1.5 * KT; });
    const sag = -(b.sway ?? 0) / KT;
    expect(sag).toBeGreaterThan(0.3); expect(sag).toBeLessThan(0.7);
  });
  it('running, none: the sails push her along her heading', () => {
    const b = testBoat({ heading: 180 - 20, kt: 5, windKt: 12 });
    sail(b, 40, () => { b.h = 160; });
    // Her steady slip (deg) under a side force F (N): where it meets her keel's lift and her hull broadside, physics.ts
    // moveBoat's own balance, F = ½ρ·A·(πAR/2·u·v + Cd·v²)
    const k = 0.5 * 1025 * HOVE.latArea, lift = Math.PI * HOVE.aspect / 2 * b.v;
    const slipFor = (F: number) => Math.atan2((-lift + Math.sqrt(lift * lift + 4 * HOVE.crossCd * F / k)) / (2 * HOVE.crossCd), b.v) / D2R;
    const sails = b.forces!.heel * Math.cos((b.heelMag ?? 0) * D2R), ap = sailWind(b.ww.from, b.ww.kt, b.h, b.v, b.sway ?? 0, b.heel ?? 0), wind = 0.5 * 1.225 * ap.aws ** 2 * windSide(ap.awa); // (the wind at her rig, as moveBoat takes it)
    // (1) the sails' own: no leeway in the polar's sense (her course is her heading), and the little side force eased
    // sails still make slips her under half a degree, as before
    expect(b.leeway ?? 0).toBe(0);
    expect(slipFor(sails)).toBeLessThan(0.5);
    // (2) the rest is the wind on her topsides, mast and crew (dynamics.ts windSide: about 3 m² with the wind on her
    // quarter): a tenth to a third of a degree more. Her whole slip is the two together, to within 3% (she's
    // settled), and to leeward (she's on port tack here: slipOf reads negative)
    expect(slipFor(wind)).toBeGreaterThan(0.1); expect(slipFor(wind)).toBeLessThan(0.3);
    expect(-slipOf(b)).toBeGreaterThan(0);
    expect(Math.abs(-slipOf(b) - slipFor(sails + wind))).toBeLessThan(0.03 * slipFor(sails + wind));
  });
});
