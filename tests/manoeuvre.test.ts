import { describe, expect, it } from 'vitest';
import { FOLKBOAT } from '../src/boat/polar';
import { D2R, KT } from '../src/core/math';
import { MANOEUVRE_LOSS, manoeuvreS } from '../src/sim/routing';
import { sail, startTack, testBoat, upwindProgress } from './helpers/testBoat';

/** What a tack (or gybe) costs the sim's own boat in `tws` kt: the distance made good she loses against a twin that
 * sails on, over her VMG (s). */
function measure(kind: 'tack' | 'gybe', tws: number): number {
  const ang = kind === 'tack' ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws), vb = FOLKBOAT.speedKt(tws, ang);
  const mk = () => testBoat({ heading: 360 - ang, kt: vb, windKt: tws });
  const a = mk(), s = mk(); sail(a, 20); sail(s, 20);
  startTack(a); sail(a, 70); sail(s, 70);
  const lost = (kind === 'tack' ? 1 : -1) * (upwindProgress(s) - upwindProgress(a));
  return lost / Math.abs(vb * KT * Math.cos(ang * D2R));
}

describe("the passage planner's time for a tack or a gybe (routing.ts manoeuvreS)", () => {
  it("is what the sim's own Folkboat loses in one, wind by wind (the planner and the boat agree)", () => {
    for (const kind of ['tack', 'gybe'] as const) for (const [tws, s] of MANOEUVRE_LOSS[kind]) {
      const m = measure(kind, tws);
      expect(Math.abs(m - s), `${kind} in ${tws} kt: measured ${m.toFixed(1)} s, table ${s} s`).toBeLessThan(Math.max(0.5, 0.15 * s));
    }
  });
  it('runs smoothly between the winds measured, and holds beyond them', () => {
    expect(manoeuvreS('tack', 10)).toBeCloseTo((5.3 + 3.3) / 2, 6);
    expect(manoeuvreS('tack', 3)).toBe(7.6); expect(manoeuvreS('tack', 30)).toBe(3.3);
    expect(manoeuvreS('gybe', 14)).toBeLessThan(manoeuvreS('tack', 14));
  });
});
