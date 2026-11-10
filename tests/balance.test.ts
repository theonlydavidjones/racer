import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import type { Controls } from '../src/boat/controls';
import type { Boat } from '../src/boat/boat';

/** Beat at `windKt` with the crew's settings, then (optionally) change the controls yourself and settle again. */
function beat(windKt: number, change?: (c: Controls) => void): Boat {
  const twa = beatAngle(windKt), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt });
  sail(b, 20, () => { b.h = 360 - twa; });
  if (change) {
    const base = JSON.parse(JSON.stringify(b.ctl));
    b.manualTrim = true; b.trimAll = true; b.ctl = base; change(b.ctl);
    sail(b, 12, () => { b.h = 360 - twa; });
  }
  return b;
}

describe('Heel from the forces on the sails', () => {
  it('heels more as the breeze builds, as much as a Folkboat does', () => {
    const h8 = beat(8).heelMag!, h14 = beat(14).heelMag!, h20 = beat(20).heelMag!;
    expect(h8).toBeLessThan(h14);
    expect(h14).toBeLessThan(h20);
    expect(h14).toBeGreaterThan(10); expect(h14).toBeLessThan(20);
    expect(h20).toBeGreaterThan(18); expect(h20).toBeLessThan(30);
  });
  it('heels at once in a gust', () => {
    const b = beat(12), before = b.heelMag!;
    b.ww = { ...b.ww, kt: 18 }; // a puff
    sail(b, 1.5, () => { b.h = 360 - beatAngle(12); });
    expect(b.heelMag!).toBeGreaterThan(before + 3);
  });
  it('depowering stands her up: backstay, outhaul and traveller down all reduce heel', () => {
    const base = beat(16).heelMag!;
    expect(beat(16, c => { c.backstay = 1; }).heelMag!).toBeLessThan(base - 1);
    expect(beat(16, c => { c.outhaul = 1; }).heelMag!).toBeLessThan(base - 1);
    expect(beat(16, c => { c.traveller = Math.min(1, c.traveller + 0.6); }).heelMag!).toBeLessThan(base - 4);
    expect(beat(16, c => { c.backstay = 0; c.outhaul = 0; }).heelMag!).toBeGreaterThan(base + 1); // fuller: more power, more heel
  });
  it('vang-sheeting: easing the main with the vang on keeps the leech closed while she comes upright', () => {
    const on = beat(16, c => { c.vang = 1; c.mainsheet += 0.08; }), off = beat(16, c => { c.vang = 0; c.mainsheet += 0.08; });
    expect(on.heelMag!).toBeLessThan(beat(16).heelMag!);
    expect(on.shape.main.twist).toBeLessThan(off.shape.main.twist - 4);
  });
});

describe('Helm balance (weather helm)', () => {
  it('a little weather helm in a moderate breeze, more as she heels', () => {
    const h12 = beat(12).helmNeed!, h20 = beat(20).helmNeed!;
    expect(h12).toBeGreaterThan(0.5); expect(h12).toBeLessThan(4);
    expect(h20).toBeGreaterThan(h12 + 2);
  });
  it('the traveller down and the backstay on take weather helm off; easing the main can give lee helm', () => {
    const base = beat(16).helmNeed!;
    expect(beat(16, c => { c.traveller = Math.min(1, c.traveller + 0.6); }).helmNeed!).toBeLessThan(base - 2);
    expect(beat(16, c => { c.backstay = 1; }).helmNeed!).toBeLessThan(base);
    expect(beat(16, c => { c.mainsheet += 0.2; }).helmNeed!).toBeLessThan(0);
  });
  it('let go of the tiller with weather helm and she rounds up into the wind', () => {
    const b = beat(16), twa0 = b.twa;
    (b as Boat & { handsOff?: boolean }).handsOff = true; b.tiller = 0;
    sail(b, 4);
    expect(b.twa).toBeLessThan(twa0 - 5);
  });
  it('carrying a lot of helm is slower than sailing balanced', () => {
    const balanced = beat(18, c => { c.backstay = 1; c.traveller = Math.min(1, c.traveller + 0.3); });
    const loaded = beat(18, c => { c.backstay = 0; c.traveller = -0.6; c.mainsheet = 0; });
    expect(loaded.helmNeed!).toBeGreaterThan(balanced.helmNeed! + 2);
    expect(loaded.v).toBeLessThan(balanced.v);
  });
});
