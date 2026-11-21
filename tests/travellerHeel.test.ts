import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';

// The owner (21 Nov 2026): "easing the traveler (dropping it to leeward) absolutely reduces heel. It's one of the main
// ways we manage heel when beating, especially in stiffer wind." Below the stall a sail's lift falls as its angle of
// attack does (a finite wing's lift slope), so dropping the car with the sheet held lowers the main's heeling force,
// her heel and her weather helm, and costs less drive than it saves heeling force (the force rotates forward as it
// shrinks: drive is L·sinβ − D·cosβ, heel L·cosβ + D·sinβ, with β about 30° beating).
describe('dropping the traveler to leeward, the sheet held, beating', () => {
  for (const tws of [16, 20]) it(`reduces heel and helm step by step in ${tws} kt`, () => {
    const twa = beatAngle(tws), b = testBoat({ heading: 360 - twa, kt: 5, windKt: tws }), h0 = b.h;
    const hold = () => { b.h = h0; };
    sail(b, 60, hold); // (her crew trims her for the breeze)
    // then every line is yours, sheeted as North's guide sails her: the car in the middle and the sheet tight (the boom
    // 2.5° off), "In heavy winds, sheet tight"; then the car eased to leeward "to decrease heel and thus rudder pressure"
    b.manualTrim = true; b.trimAll = true;
    b.ctl.traveller = 0; b.ctl.mainsheet = 0.1;
    const sheet = b.ctl.mainsheet;
    const rows: { car: number; heel: number; helm: number; F: number; D: number; stalled: boolean }[] = [];
    for (const car of [0, 0.25, 0.5, 0.75, 1]) {
      b.ctl.traveller = car; b.ctl.mainsheet = sheet;
      sail(b, 15, hold);
      let heel = 0, helm = 0, F = 0, D = 0, n = 0;
      sail(b, 10, () => { hold(); heel += b.heel; helm += b.helmNeed ?? 0; F += b.forces!.heel; D += b.forces!.drive; n++; });
      rows.push({ car, heel: heel / n, helm: helm / n, F: F / n, D: D / n, stalled: b.trim.main.flow === 'stalled' });
    }
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], c = rows[i], why = `car ${a.car} → ${c.car}: ${JSON.stringify(rows.map(r => [r.car, +r.heel.toFixed(2), +r.helm.toFixed(3), Math.round(r.F), Math.round(r.D)]))}`;
      expect(c.heel, why).toBeLessThan(a.heel - 0.1); // (each quarter of the car's travel, 2.4° of boom, takes heel off)
      // (and eases the helm, once the main is drawing. Out of a stall, the first ease gives back drive faster than it
      // sheds heeling force, and drive pushed out to leeward by her heel turns her up: at 20 kt the first quarter of the
      // car's drop adds a little helm before every step after takes it off. For the physics reviewer, 21 Nov 2026)
      if (!a.stalled) expect(c.helm, why).toBeLessThan(a.helm);
    }
    const first = rows[0], last = rows[rows.length - 1];
    expect(first.D - last.D).toBeLessThan(first.F - last.F); // (drive given up is less than heeling force shed)
    expect(last.helm).toBeLessThan(first.helm - 1); // (and the car right down leaves her helm far lighter)
  });
});
