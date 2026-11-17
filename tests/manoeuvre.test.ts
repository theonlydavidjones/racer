import { describe, expect, it } from 'vitest';
import { FOLKBOAT } from '../src/boat/polar';
import { D2R } from '../src/core/math';
import { MANOEUVRE_LOSS, manoeuvreS } from '../src/sim/routing';
import { sail, startTack, testBoat, upwindProgress } from './helpers/testBoat';

/** What a tack (or gybe) costs the sim's own boat in `tws` kt: the distance made good she loses against a twin that
 * sails on, over her VMG (s). */
function measure(kind: 'tack' | 'gybe', tws: number): number {
  const ang = kind === 'tack' ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws), vb = FOLKBOAT.speedKt(tws, ang);
  // (a dead run's sailed poled out, wing-on-wing: a Folkboat carries no spinnaker; the crew gybes the pole)
  const mk = () => { const b = testBoat({ heading: 360 - ang, kt: vb, windKt: tws }); if (kind === 'gybe') b.poleWant = true; return b; };
  // settled a minute first, then four minutes on: long enough for her to be back to speed, even in 3 kt
  const a = mk(), s = mk(); sail(a, 60); sail(s, 60);
  startTack(a); sail(a, 240); sail(s, 240);
  const lost = (kind === 'tack' ? 1 : -1) * (upwindProgress(s) - upwindProgress(a));
  return lost / Math.abs(s.v * Math.cos(ang * D2R));
}

describe("the passage planner's time for a tack or a gybe (routing.ts manoeuvreS)", () => {
  it("is what the sim's own Folkboat loses in one, wind by wind (the planner and the boat agree)", () => {
    for (const kind of ['tack', 'gybe'] as const) for (const [tws, s] of MANOEUVRE_LOSS[kind]) {
      const m = measure(kind, tws);
      expect(Math.abs(m - s), `${kind} in ${tws} kt: measured ${m.toFixed(1)} s, table ${s} s`).toBeLessThan(Math.max(0.5, 0.15 * s));
    }
  }, 180_000);
  it('runs smoothly between the winds measured, and holds beyond them', () => {
    expect(manoeuvreS('tack', 10)).toBeCloseTo((5.1 + 3.3) / 2, 6);
    expect(manoeuvreS('tack', 2)).toBe(23.1); expect(manoeuvreS('tack', 30)).toBe(4.0);
    expect(manoeuvreS('gybe', 14)).toBeLessThan(manoeuvreS('tack', 14));
  });
  it('costs a tack more in chop (the sim\'s own sea: about 40% a metre), a gybe the same', () => {
    expect(manoeuvreS('tack', 16, 0.5)).toBeCloseTo(manoeuvreS('tack', 16) * 1.2, 6);
    expect(manoeuvreS('gybe', 16, 0.5)).toBe(manoeuvreS('gybe', 16));
  });
});
