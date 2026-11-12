import { describe, expect, it } from 'vitest';
import orc from '../src/boat/data/nordic-folkboat-orc.json';
import { FOLKBOAT, Polar, jibOnlyDeadRun, type OrcPolarData } from '../src/boat/polar';
import { coastDistance, maxTurnRate, timeToCover } from '../src/boat/dynamics';
import { D2R, KT, LOA } from '../src/core/math';
import { kt, sail, startTack, testBoat, upwindProgress } from './helpers/testBoat';

const ORC = orc as OrcPolarData;
const SPIN = new Polar(ORC, { spinnaker: true });
const vmg = (tws: number, twa: number) => FOLKBOAT.speedKt(tws, twa) * Math.cos(twa * D2R);

describe('polar: Nordic Folkboat from ORC certificates', () => {
  it('reproduces the ORC table at its own points (upwind and reaching are unaffected by the spinnaker)', () => {
    ORC.tws.forEach((tws, j) => {
      for (const a of [52, 60, 75]) expect(FOLKBOAT.speedKt(tws, a)).toBeCloseTo(ORC.speed[String(a)][j], 6);
      expect(FOLKBOAT.speedKt(tws, ORC.beat.angle[j])).toBeCloseTo(ORC.beat.speed[j], 6);
      expect(SPIN.speedKt(tws, 150)).toBeCloseTo(ORC.speed['150'][j], 6);
    });
  });

  it('12 kt: about 4.7 kt close-hauled at 41°, 5.9 kt on a beam reach', () => {
    expect(FOLKBOAT.beatAngle(12)).toBeCloseTo(40.7, 1);
    expect(FOLKBOAT.speedKt(12, FOLKBOAT.beatAngle(12))).toBeCloseTo(4.71, 1);
    expect(FOLKBOAT.speedKt(12, 90)).toBeCloseTo(5.9, 1);
  });

  it('the beat angle is the best upwind VMG: pinching or footing 3° loses VMG', () => {
    for (const tws of [6, 10, 12, 16, 20]) {
      const b = FOLKBOAT.beatAngle(tws);
      expect(vmg(tws, b)).toBeGreaterThan(vmg(tws, b - 3));
      expect(vmg(tws, b)).toBeGreaterThan(vmg(tws, b + 3));
    }
  });

  it('no drive head to wind; pinching 5° costs only a few percent of speed', () => {
    expect(FOLKBOAT.speedKt(12, 20)).toBe(0);
    const b = FOLKBOAT.beatAngle(12), r = FOLKBOAT.speedKt(12, b - 5) / FOLKBOAT.speedKt(12, b);
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(0.97);
  });

  it('jib only (no spinnaker): slower downwind, from ~85% in light air to ~93% near hull speed', () => {
    const jib = jibOnlyDeadRun(ORC);
    ORC.tws.forEach((_, j) => {
      const r = jib[j] / ORC.deadRun[j];
      expect(r).toBeGreaterThan(0.8);
      expect(r).toBeLessThan(0.95);
    });
    expect(FOLKBOAT.speedKt(12, 180)).toBeLessThan(SPIN.speedKt(12, 180));
    expect(FOLKBOAT.speedKt(12, 90)).toBeCloseTo(SPIN.speedKt(12, 90), 6);
  });

  it('downwind, the best jib-only VMG angle is a few degrees off dead downwind', () => {
    for (const tws of [8, 12, 16]) {
      const a = FOLKBOAT.runAngle(tws);
      expect(a).toBeGreaterThan(155);
      expect(-vmg(tws, a)).toBeGreaterThanOrEqual(-vmg(tws, 180));
    }
  });

  it('speed rises with wind, and fades to zero below the lightest table wind', () => {
    let prev = 0;
    for (const tws of [2, 4, 6, 8, 10, 12, 14, 16, 20]) { const s = FOLKBOAT.speedKt(tws, 90); expect(s).toBeGreaterThan(prev); prev = s; }
    expect(FOLKBOAT.speedKt(0, 90)).toBe(0);
  });
});

/* Boat handling. Wind 12 kt from north unless stated; headings are compass degrees. These pin the
 * calibration in src/boat/dynamics.ts so it can't drift by accident. */
describe('handling: acceleration and slowing', () => {
  it('settles at the polar target speed on a beam reach', () => {
    const b = testBoat({ heading: 270, kt: 3 });
    sail(b, 120);
    // (her speed through the water, at her course's angle: the polar's angles are the course's, her leeway included)
    expect(Math.hypot(b.v, b.sway ?? 0) / KT).toBeCloseTo(FOLKBOAT.speedKt(12, 90 + (b.leeway ?? 0)), 1);
  });

  it('accelerating from 1 kt on a close reach to 90% of target takes 8–20 s (heavy, long-keeled boat)', () => {
    const b = testBoat({ heading: 300, kt: 1 }), target = FOLKBOAT.speedKt(12, 60);
    const t = sail(b, 60, () => kt(b) >= 0.9 * target);
    expect(t).toBeGreaterThan(8);
    expect(t).toBeLessThan(20);
  });

  it('accelerates more slowly in lighter wind', () => {
    const time = (w: number) => { const b = testBoat({ heading: 300, kt: 1, windKt: w }); return sail(b, 90, () => kt(b) >= 0.9 * FOLKBOAT.speedKt(w, 60)); };
    expect(time(8)).toBeGreaterThan(time(12));
  });

  it('luffing (sails eased to flog) halves the speed in 8–20 s, then the boat coasts to a stop', () => {
    const target = FOLKBOAT.speedKt(12, 60), b = testBoat({ heading: 300, kt: target });
    b.luff = true;
    const t = sail(b, 60, () => kt(b) <= target / 2);
    expect(t).toBeGreaterThan(8);
    expect(t).toBeLessThan(20);
    sail(b, 90);
    expect(kt(b)).toBeLessThan(0.3);
  });

  it('shooting head to wind from close-hauled speed carries 2–5 boat lengths', () => {
    const b = testBoat({ heading: 0.5, kt: FOLKBOAT.speedKt(12, FOLKBOAT.beatAngle(12)) }), y0 = b.y;
    sail(b, 60, () => kt(b) < 0.3);
    const lengths = (b.y - y0) / LOA;
    expect(lengths).toBeGreaterThan(2);
    expect(lengths).toBeLessThan(5);
  });
});

describe('handling: turning and tacking', () => {
  it('turn rate depends on speed: ~15°/s at full speed, only a few °/s when nearly stopped', () => {
    expect(maxTurnRate(2.4)).toBeGreaterThan(13);
    expect(maxTurnRate(2.4)).toBeLessThan(18);
    expect(maxTurnRate(0.2)).toBeLessThanOrEqual(4);
  });

  //   wind ↓     ↖ close-hauled on starboard → tack → ↗ close-hauled on port
  it('a tack in 12 kt: 5–9 s through the turn, slows to 50–70%, costs 0.5–1.5 boat lengths of upwind progress', () => {
    const beat = FOLKBOAT.beatAngle(12), vb = FOLKBOAT.speedKt(12, beat);
    const tacker = testBoat({ heading: 360 - beat, kt: vb }), straight = testBoat({ heading: 360 - beat, kt: vb });
    sail(tacker, 1); sail(straight, 1);
    startTack(tacker);
    let minKt = 99, turned = -1;
    sail(tacker, 59, t => { minKt = Math.min(minKt, kt(tacker)); if (turned < 0 && tacker.turnTarget == null) turned = t; });
    sail(straight, 59);
    expect(tacker.tack).toBe('P');
    expect(turned).toBeGreaterThan(5);
    expect(turned).toBeLessThan(9);
    expect(minKt / vb).toBeGreaterThan(0.5);
    expect(minKt / vb).toBeLessThan(0.7);
    const lost = (upwindProgress(straight) - upwindProgress(tacker)) / LOA;
    expect(lost).toBeGreaterThan(0.5);
    expect(lost).toBeLessThan(1.5);
  });

  it('tacking ends (Rule 13) once the boat is close-hauled on the new tack', () => {
    const b = testBoat({ heading: 360 - FOLKBOAT.beatAngle(12), kt: 4.7 });
    sail(b, 0.5); startTack(b);
    let sawTacking = false;
    sail(b, 15, () => { if (b.tacking) sawTacking = true; });
    expect(sawTacking).toBe(true);
    expect(b.tacking).toBe(false);
  });
});

describe('predictions used by the AI and the line aid match the simulation', () => {
  it('time to cover 80 m from 1 kt on a close reach', () => {
    const b = testBoat({ heading: 300, kt: 1 }), x0 = b.x;
    const sim = sail(b, 90, () => x0 - b.x >= 80 * Math.sin(60 * D2R));
    const predicted = timeToCover(80, 1 * KT, FOLKBOAT.speedKt(12, 60) * KT);
    expect(Math.abs(predicted - sim) / sim).toBeLessThan(0.1);
  });

  it('coasting distance while luffing', () => {
    const target = FOLKBOAT.speedKt(12, 60), b = testBoat({ heading: 300, kt: target }), x0 = b.x, y0 = b.y;
    b.luff = true; sail(b, 15);
    const sim = Math.hypot(b.x - x0, b.y - y0), predicted = coastDistance(target * KT, 15, 12, 60);
    expect(Math.abs(predicted - sim) / sim).toBeLessThan(0.2);
  });
});

describe('downwind: wing-on-wing with the whisker pole', () => {
  it('dead downwind, the main blankets a normally-sheeted jib; poled out wing-on-wing is faster', () => {
    for (const tws of [6, 12, 18]) expect(FOLKBOAT.speedKt(tws, 175, 'wing')).toBeGreaterThan(FOLKBOAT.speedKt(tws, 175, 'jib') * 1.03);
  });

  it('on a reach the pole is wrong: a poled-out jib is aback, so normal trim is faster', () => {
    for (const a of [90, 120, 135]) expect(FOLKBOAT.speedKt(12, a, 'jib')).toBeGreaterThan(FOLKBOAT.speedKt(12, a, 'wing') * 1.05);
  });

  it('poling out pays from roughly 150–160° true wind angle', () => {
    const cross = [...Array(61).keys()].map(i => 120 + i).find(a => FOLKBOAT.bestPlan(12, a) === 'wing');
    expect(cross).toBeGreaterThan(145);
    expect(cross).toBeLessThan(162);
  });

  it('the best downwind VMG angle uses the pole and sails deep (~165–175°)', () => {
    expect(FOLKBOAT.runAngle(12)).toBeGreaterThan(163);
    expect(FOLKBOAT.runAngle(12, 'wing')).toBeGreaterThan(FOLKBOAT.runAngle(12, 'jib'));
  });

  it('setting the pole takes the crew a few seconds, then the boat speeds up', () => {
    const b = testBoat({ heading: 175, kt: 3.9 }); // wind from north, running south on port... rel = −175 → port tack
    sail(b, 30); const before = kt(b);
    b.poleWant = true;
    sail(b, 2); expect(b.pole).toBe('setting');
    sail(b, 40);
    expect(b.pole).toBe('set');
    expect(kt(b)).toBeGreaterThan(before * 1.03);
  });

  it('gybing with the pole set: the crew gybes it end-for-end, then it is wing-on-wing on the new side', () => {
    const b = testBoat({ heading: 175, kt: 4 });
    b.poleWant = true; sail(b, 12);
    expect(b.pole).toBe('set');
    const tack0 = b.tack;
    b.h = 185; b.turnTarget = null; // gybe
    sail(b, 1);
    expect(b.tack).not.toBe(tack0);
    expect(b.pole).toBe('setting');
    sail(b, 10);
    expect(b.pole).toBe('set');
    expect(b.poleTack).toBe(b.tack);
  });
});

describe('sail trim', async () => {
  const { optimalSheet, sailTrim, SAILS } = await import('../src/boat/trim');

  it('best sheet angles: tight close-hauled, eased on a reach, all the way out on a run', () => {
    expect(optimalSheet('main', 30)).toBeCloseTo(8, 0);
    expect(optimalSheet('jib', 30)).toBeCloseTo(12, 0);
    expect(optimalSheet('main', 65)).toBeCloseTo(43, 0);
    expect(optimalSheet('main', 170)).toBeCloseTo(SAILS.main.max, 0);
  });

  it('trimmed right, the sail draws fully', () => {
    const t = sailTrim('jib', 40, optimalSheet('jib', 40));
    expect(t.flow).toBe('good');
    expect(t.eff).toBeCloseTo(1, 6);
  });

  it('eased 10° too far, the sail luffs and loses most of its drive', () => {
    const t = sailTrim('jib', 40, optimalSheet('jib', 40) + 10);
    expect(t.flow).toBe('luffing');
    expect(t.eff).toBeLessThan(0.5);
  });

  it('pinching with the sheets hard in still luffs the jib (windward telltales lift)', () => {
    const t = sailTrim('jib', 18, SAILS.jib.min);
    expect(t.flow).toBe('luffing');
  });

  it('sheeted hard in on a reach, the sails stall: some drive left, but well down', () => {
    const t = sailTrim('main', 70, SAILS.main.min);
    expect(t.flow).toBe('stalled');
    expect(t.eff).toBeGreaterThan(0.45);
    expect(t.eff).toBeLessThan(0.8);
  });

  it('on a run, sheeted in costs drive (less sail facing the wind); no luffing or stalling to speak of', () => {
    const out = sailTrim('main', 170, SAILS.main.max), half = sailTrim('main', 170, 40);
    expect(out.eff).toBeCloseTo(1, 2);
    expect(half.eff).toBeLessThan(0.9);
    expect(half.flow).toBe('good');
  });

  it('the crew keeps the sails drawing when sailing steadily close-hauled', () => {
    const b = testBoat({ heading: 360 - FOLKBOAT.beatAngle(12), kt: 4.5 });
    sail(b, 20);
    expect(b.trim.main.flow).toBe('good');
    expect(b.trim.jib?.flow).toBe('good');
  });

  it('pinching 12° above close-hauled makes the jib luff, and the boat slows', () => {
    const beat = FOLKBOAT.beatAngle(12), b = testBoat({ heading: 360 - beat, kt: 4.6 });
    sail(b, 20); const v0 = kt(b);
    b.h = 360 - (beat - 12);
    sail(b, 8);
    expect(b.trim.jib?.flow).toBe('luffing');
    expect(kt(b)).toBeLessThan(v0 * 0.9);
  });

  it('trimming yourself with the sheets hard in on a beam reach is much slower than the crew trimming', () => {
    const crew = testBoat({ heading: 270, kt: 5 }), you = testBoat({ heading: 270, kt: 5 });
    you.manualTrim = true; you.sheets.main = SAILS.main.min; you.sheets.jib = SAILS.jib.min;
    sail(crew, 60); sail(you, 60);
    expect(kt(you)).toBeLessThan(kt(crew) * 0.85);
  });
});

describe('penalty turns (Rule 44.2)', async () => {
  const { startPenalty } = await import('../src/sim/world');
  it('only turning one way counts: wiggling back and forth does not finish a penalty', () => {
    const b = testBoat({ heading: 270, kt: 4 });
    startPenalty(b, 720);
    for (let i = 0; i < 10; i++) { b.tiller = 1; sail(b, 1.5); b.tiller = -1; sail(b, 1.5); }
    expect(b.penalty).toBeGreaterThan(600);
  });
  it('two full circles the same way finish a two-turns penalty', () => {
    const b = testBoat({ heading: 270, kt: 4 });
    startPenalty(b, 720);
    b.steer = -1; // helm hard over to port: round and round
    sail(b, 240, () => b.penalty === 0);
    expect(b.penalty).toBe(0);
    expect(b.penaltyDir).toBe(-1);
  });
});

describe("the sails' push at her speed (driveCurve.ts)", () => {
  it('close-hauled, slow, they push less than at full speed (ORC: 0.7–0.8 at rest); on a run, more', async () => {
    const { driveRatio } = await import('../src/boat/driveCurve');
    const { polar, beatAngle } = await import('../src/boat/polar');
    const at = (w: number, a: number, f: number) => { const vt = polar(w, a, 'jib'); return driveRatio(w, a, f * vt, vt); };
    expect(at(12, beatAngle(12), 0)).toBeGreaterThan(0.65); expect(at(12, beatAngle(12), 0)).toBeLessThan(0.85);
    expect(at(12, 170, 0)).toBeGreaterThan(1.8);
    expect(at(12, 90, 1)).toBeCloseTo(1, 6);
  });
  it('whatever was asked before (no two conditions share a cached value)', async () => {
    const { driveRatio } = await import('../src/boat/driveCurve');
    const { polar } = await import('../src/boat/polar');
    const run = () => driveRatio(6, 150, 0, polar(6, 150, 'jib'));
    const a = run(); driveRatio(7, 50, 0, polar(7, 50, 'jib')); driveRatio(13, 70, 0, polar(13, 70, 'jib'));
    expect(run()).toBe(a); expect(a).toBeGreaterThan(1.5);
  });
});
