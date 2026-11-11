import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import type { Controls } from '../src/boat/controls';
import type { Boat } from '../src/boat/boat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';

/** Beat at `windKt` with the crew's settings, then (optionally) change the controls yourself and settle again. */
/** Sail her close-hauled; `full`: the crew held at full power (no depowering of their own), so one line's own effect shows. */
function beat(windKt: number, change?: (c: Controls) => void, full = !!change, secs = 20): Boat {
  const twa = beatAngle(windKt), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt });
  sail(b, secs, () => { b.h = 360 - twa; if (full) b.depower = 0; });
  if (change) {
    const base = JSON.parse(JSON.stringify(b.ctl));
    b.manualTrim = true; b.trimAll = true; b.ctl = base; change(b.ctl);
    sail(b, 12, () => { b.h = 360 - twa; if (full) b.depower = 0; });
  }
  return b;
}

describe('Heel from the forces on the sails', () => {
  it('heels more as the breeze builds, until the crew hold her at her best (hiking, then depowering)', () => {
    const h8 = beat(8).heelMag!, h14 = beat(14).heelMag!, h20 = beat(20).heelMag!;
    expect(h8).toBeLessThan(h14);
    expect(h14).toBeGreaterThan(10); expect(h14).toBeLessThan(20);
    expect(h20).toBeGreaterThan(h14 - 1); expect(h20).toBeLessThan(25);
    // held at full power she'd be well over (the righting moment from the ORC certificates)
    expect(beat(20, undefined, true).heelMag!).toBeGreaterThan(h20 + 5);
  });
  it('heels at once in a gust', () => {
    const b = beat(12), before = b.heelMag!;
    b.ww = { ...b.ww, kt: 18 }; // a puff
    sail(b, 1.5, () => { b.h = 360 - beatAngle(12); });
    expect(b.heelMag!).toBeGreaterThan(before + 3);
  });
  it('depowering stands her up once the crew are hiking flat out: backstay, outhaul and traveller down all reduce heel', () => {
    const base = beat(22, undefined, true).heelMag!;
    expect(beat(22, c => { c.backstay = 1; }).heelMag!).toBeLessThan(base);
    expect(beat(22, c => { c.outhaul = 1; }).heelMag!).toBeLessThan(base);
    expect(beat(22, c => { c.traveller = Math.min(1, c.traveller + 0.6); }).heelMag!).toBeLessThan(base - 4);
    expect(beat(22, c => { c.backstay = 0; c.outhaul = 0; }).heelMag!).toBeGreaterThan(base + 0.5); // fuller: more power, more heel
  });
  it('in a moderate breeze the crew hike to hold her; depowering lets them hike less', () => {
    const full = beat(16, undefined, true), flat = beat(16, c => { c.backstay = 1; c.outhaul = 1; });
    expect(full.crew!.mode).toBe('hike');
    expect(flat.crew!.hike).toBeLessThan(full.crew!.hike);
  });
  it('vang-sheeting: easing the main with the vang on keeps the leech closed while she comes upright', () => {
    // (the main eased on its sheet, the traveller centred: with the vang on, the leech stays closed)
    const on = beat(16, c => { c.vang = 1; c.traveller = 0; c.mainsheet = 0.35; }), off = beat(16, c => { c.vang = 0; c.traveller = 0; c.mainsheet = 0.35; });
    expect(on.heelMag!).toBeLessThan(beat(16, undefined, true).heelMag!);
    expect(on.shape.main.twist).toBeLessThan(off.shape.main.twist - 4);
  });
});

describe('Helm balance (weather helm)', () => {
  it('a little weather helm in a moderate breeze, more as she heels', () => {
    const h12 = beat(12).helmNeed!, h20 = beat(20, undefined, true).helmNeed!; // (20 kt held at full power: heeled)
    expect(h12).toBeGreaterThan(0.5); expect(h12).toBeLessThan(4);
    expect(h20).toBeGreaterThan(h12 + 2);
  });
  it('easing the boom past its best angle (traveller down, sheet eased) and the backstay on take weather helm off; easing the main further can give lee helm', () => {
    const base = beat(16, undefined, true).helmNeed!;
    expect(beat(16, c => { c.traveller = 1; c.mainsheet = Math.min(1, c.mainsheet + 0.12); }).helmNeed!).toBeLessThan(base - 1.5);
    expect(beat(16, c => { c.backstay = 1; }).helmNeed!).toBeLessThan(base);
    expect(beat(16, c => { c.mainsheet += 0.2; }).helmNeed!).toBeLessThan(0);
  });
  it('let go of the tiller with weather helm and she rounds up into the wind', () => {
    const b = beat(16), twa0 = b.twa;
    (b as Boat & { handsOff?: boolean }).handsOff = true; b.tiller = 0;
    sail(b, 5);
    expect(b.twa).toBeLessThan(twa0 - 5);
  });
  it('carrying a lot of helm is slower than sailing balanced', () => {
    // the crew's own trim, once they've worked through the depowering steps (one job at a time): they take the helm off her
    const balanced = beat(18, undefined, false, 60);
    const loaded = beat(18, undefined, true, 60); // held at full power: heeled, a lot of weather helm
    expect(loaded.helmNeed!).toBeGreaterThan(balanced.helmNeed! + 1.5); // (the crew hikes harder to hold her up, which takes some of it off)
    expect(loaded.v).toBeLessThan(balanced.v);
  });
});

describe('The crew', () => {
  it('sit to leeward in light air, to windward in a moderate breeze, and hike only when she needs it', () => {
    expect(beat(4).crew!.mode).toBe('leeward');
    expect(['windward', 'centre']).toContain(beat(10).crew!.mode);
    expect(beat(20).crew!.mode).toBe('hike');
  });
  it('go forward downwind with the pole out (the pole hand at the mast, the other crew at the front of the cockpit)', () => {
    const b = testBoat({ heading: 195, kt: 4, windKt: 10 }); b.poleWant = true;
    sail(b, 30, () => { b.h = 195; });
    expect(b.crew!.mode).toBe('foredeck');
    const [, mid, bow] = b.crew!.people;
    expect(bow.pose).toBe('mast'); expect(bow.z).toBeLessThan(-0.5);
    expect(mid.z).toBeLessThan(1.4); // forward in the cockpit: the transom clear in light air
    expect(b.crew!.trim).toBeGreaterThan(0); // trimmed by the bow
  });
  it('sailing alone in a breeze she goes slower than with two crew: she heels more, or has to be depowered more', () => {
    const two = beat(20), solo = testBoat({ heading: 360 - beatAngle(20), kt: 4.5, windKt: 20 });
    solo.crew = newCrew({ ...DEFAULT_CREW, crew: [] }, 'S');
    sail(solo, 30, () => { solo.h = 360 - beatAngle(20); });
    expect(solo.heelMag! > two.heelMag! + 3 || (solo.depower ?? 0) > (two.depower ?? 0) + 0.1).toBe(true);
    expect(solo.v).toBeLessThan(two.v);
  });
});
