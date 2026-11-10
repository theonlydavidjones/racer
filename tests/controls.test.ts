import { describe, expect, it } from 'vitest';
import { defaultControls, jibShape, mainShape, shapeEfficiency, targetShape, winchFactor, boomAngle, mainsheetFor } from '../src/boat/controls';
import { moveLazyCar } from '../src/boat/physics';
import { kt, sail, testBoat } from './helpers/testBoat';

describe('what each control does to the sails', () => {
  it('outhaul and backstay flatten the main; the backstay flattens the jib too', () => {
    const c = defaultControls(), base = mainShape(c, 12).depth;
    expect(mainShape({ ...c, outhaul: 1 }, 12).depth).toBeLessThan(base - 0.01);
    expect(mainShape({ ...c, backstay: 1 }, 12).depth).toBeLessThan(base - 0.01);
    expect(jibShape({ ...c, backstay: 1 }, 12, 'S').depth).toBeLessThan(jibShape(c, 12, 'S').depth - 0.01);
  });
  it('Cunningham and downhaul pull the draft forward; more wind blows it aft', () => {
    const c = defaultControls();
    expect(mainShape({ ...c, cunningham: 1, downhaul: 1 }, 12).draft).toBeLessThan(mainShape(c, 12).draft - 0.05);
    expect(mainShape(c, 20).draft).toBeGreaterThan(mainShape(c, 8).draft);
    expect(jibShape({ ...c, jibCunningham: 1 }, 12, 'S').draft).toBeLessThan(jibShape(c, 12, 'S').draft - 0.05);
  });
  it('with the sheet eased, the vang stops the main twisting open', () => {
    const c = { ...defaultControls(), mainsheet: 0.6 };
    expect(mainShape({ ...c, vang: 1 }, 12).twist).toBeLessThan(mainShape({ ...c, vang: 0 }, 12).twist - 6);
  });
  it('moving the jib car aft twists the jib open', () => {
    const c = defaultControls(), fwd = { ...c, car: { S: { fore: 0, ins: 1 }, P: { fore: 0, ins: 1 } } }, aft = { ...c, car: { S: { fore: 6, ins: 1 }, P: { fore: 6, ins: 1 } } };
    expect(jibShape(aft, 12, 'S').twist).toBeGreaterThan(jibShape(fwd, 12, 'S').twist + 8);
  });
  it('the traveller and mainsheet set the boom angle together', () => {
    expect(boomAngle({ ...defaultControls(), traveller: 0.5, mainsheet: mainsheetFor(20, 0.5) })).toBeCloseTo(20, 1);
  });
});

describe('what shape is fast', () => {
  it('flatter and more twisted in a breeze than in medium air, upwind', () => {
    const med = targetShape('main', 10, 30), heavy = targetShape('main', 20, 30);
    expect(heavy.depth).toBeLessThan(med.depth - 0.02);
    expect(heavy.twist).toBeGreaterThan(med.twist + 4);
    expect(heavy.draft).toBeLessThan(med.draft);
  });
  it('fuller off the wind', () => {
    expect(targetShape('main', 12, 140).depth).toBeGreaterThan(targetShape('main', 12, 30).depth);
  });
  it('a badly set sail costs a few percent, never more than ~8%', () => {
    const t = targetShape('main', 20, 30);
    const bad = shapeEfficiency(mainShape({ ...defaultControls(), outhaul: 0, backstay: 0, cunningham: 0, downhaul: 0, mainsheet: 0 }, 20), t);
    expect(bad).toBeLessThan(0.97); expect(bad).toBeGreaterThan(0.91);
  });
});

describe('the crew', () => {
  for (const [tws, twa] of [[5, 42], [10, 42], [18, 42], [12, 90], [12, 150]]) {
    it(`sets the sails close to ideal: ${tws} kt, ${twa}° TWA`, () => {
      const b = testBoat({ heading: 360 - twa, kt: 4, windKt: tws });
      sail(b, 40);
      expect(b.shape.eff).toBeGreaterThan(0.985);
    });
  }
  it('flattens and depowers in a breeze, eases everything in light air', () => {
    const light = testBoat({ heading: 318, kt: 3, windKt: 5 }), heavy = testBoat({ heading: 318, kt: 5, windKt: 20 });
    sail(light, 40); sail(heavy, 40);
    expect(heavy.ctl.backstay).toBeGreaterThan(light.ctl.backstay + 0.5);
    expect(heavy.ctl.outhaul).toBeGreaterThan(light.ctl.outhaul + 0.2);
    expect(heavy.ctl.cunningham).toBeGreaterThan(light.ctl.cunningham + 0.5);
  });
});

describe('you on the controls', () => {
  it('when you trim everything, the crew leaves the lines alone', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 20 });
    b.manualTrim = b.trimAll = true; b.ctl.backstay = 0;
    sail(b, 10);
    expect(b.ctl.backstay).toBe(0);
    b.ctlCmd.backstay = 1; sail(b, 1); // +1 raises the value: backstay on
    expect(b.ctl.backstay).toBeGreaterThan(0.2);
  });
  it('pulling the backstay on in a breeze is faster than leaving it off', () => {
    const off = testBoat({ heading: 318, kt: 5, windKt: 20 }), on = testBoat({ heading: 318, kt: 5, windKt: 20 });
    for (const b of [off, on]) { b.manualTrim = b.trimAll = true; Object.assign(b.ctl, { outhaul: 0.5, cunningham: 0.8, downhaul: 0.8 }); }
    off.ctl.backstay = 0; on.ctl.backstay = 1;
    sail(off, 30); sail(on, 30);
    expect(kt(on)).toBeGreaterThan(kt(off));
  });
  it('the jib sheet comes in on the winch, slower in a breeze; easing is quick', () => {
    expect(winchFactor(20, true)).toBeLessThan(winchFactor(6, true));
    expect(winchFactor(20, false)).toBeGreaterThan(winchFactor(20, true));
  });
  it('you can only move the lazy (windward) jib car', () => {
    const b = testBoat({ heading: 318, kt: 4 }); // starboard tack: the port car is loaded
    const loaded = { ...b.ctl.car.P };
    moveLazyCar(b, 2, 1);
    expect(b.ctl.car.P).toEqual(loaded);
    expect(b.ctl.car.S.fore).toBe(defaultControls().car.S.fore + 2);
  });
});
