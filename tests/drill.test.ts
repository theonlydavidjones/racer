import { describe, expect, it } from 'vitest';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { FOLKBOAT } from '../src/boat/polar';
import { D2R, KT, wrap } from '../src/core/math';
import { DrillTracker, SIM_CREW, simCrew, type ManoeuvreScore } from '../src/sim/drill';
import { manoeuvreS } from '../src/sim/routing';
import type { Boat } from '../src/boat/boat';

/** Settle her on the wind (a tack) or on her run (a gybe), then turn: the sim crew's own way (`how` absent), or by a
 * fixed tiller until she's on the new tack's angle; then sail on and score it. */
function drill(kind: 'tack' | 'gybe', tws: number, how?: { tiller: number }, cur?: { x: number; y: number }): ManoeuvreScore | undefined {
  const ang = kind === 'tack' ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws);
  const b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean };
  if (kind === 'gybe') b.poleWant = true;
  if (cur) b.cur = cur;
  const d = new DrillTracker(); let t = 0;
  const tick = () => { d.step(b, t, 1 / 60); t += 1 / 60; };
  sail(b, 60, tick);
  if (!how) startTack(b);
  else {
    // a hand on the tiller: turned to starboard (a negative tiller) until she's on the other side at her angle
    b.handsOff = true; b.tiller = how.tiller;
    sail(b, 40, () => { tick(); const a = wrap(b.ww.from - b.h); if (a < 0 && Math.abs(a) >= (kind === 'tack' ? ang : ang) - 1 && (kind === 'tack' ? true : Math.abs(a) <= 179)) return true; });
    b.handsOff = false; b.tiller = 0;
  }
  sail(b, 150, tick);
  return d.list[0];
}

describe('The tack and gybe drill: each manoeuvre scored against a twin that sails on (sim/drill.ts)', () => {
  it("scores the sim crew's own tack at a good crew's loss, and calls it good", () => {
    for (const tws of [6, 10, 16]) {
      const s = drill('tack', tws)!;
      expect(s.kind).toBe('tack');
      expect(Math.abs(s.lostM - s.goodM), `${tws} kt: lost ${s.lostM.toFixed(1)}, a good crew ${s.goodM.toFixed(1)}`).toBeLessThan(Math.max(1, 0.15 * s.goodM));
      expect(s.coach).toMatch(/^A good tack/);
    }
  });
  it("its yardstick is part of the passage planner's loss (MANOEUVRE_LOSS, carried on to full speed): no more than it", () => {
    for (const tws of [6, 12, 20]) { const a = FOLKBOAT.beatAngle(tws), vmg = FOLKBOAT.speedKt(tws, a) * KT * Math.cos(a * D2R); expect(simCrew('tack', tws).lostM).toBeLessThanOrEqual(manoeuvreS('tack', tws) * vmg * 1.1); }
  });
  it('a gybe is found and scored as a gybe', () => {
    const s = drill('gybe', 12)!;
    expect(s.kind).toBe('gybe'); expect(s.lostM).toBeLessThan(6); expect(s.coach).toMatch(/^A good gybe/);
  });
  it('a timid tack (too little helm) sits head to wind too long, loses more, and is told to turn more firmly', () => {
    const good = drill('tack', 10)!, slow = drill('tack', 10, { tiller: -0.12 })!;
    expect(slow.deadS).toBeGreaterThan(good.deadS * 1.6);
    expect(slow.lostM).toBeGreaterThan(good.lostM);
    expect(slow.coach).toMatch(/Too slow through the eye/);
  });
  it('full helm through a tack turns faster, overshoots the new course, and costs at least the crew\'s tack', () => {
    // (the sim's boat doesn't stall in a hard turn: its rudder's braking at full helm decides how much a spin costs,
    // and today it costs little more than the crew's tack)
    const good = drill('tack', 10)!, fast = drill('tack', 10, { tiller: -1 })!;
    expect(fast.rate).toBeGreaterThan(good.rate);
    expect(fast.overshoot).toBeGreaterThan(good.overshoot + 3);
    expect(fast.lostM).toBeGreaterThanOrEqual(good.lostM * 0.98);
  });
  it('a half-hearted tack (half helm) is slow through the eye, loses more and is told so', () => {
    const half = drill('tack', 10, { tiller: -0.4 })!;
    expect(half.lostM).toBeGreaterThan(2 * half.goodM);
    expect(half.coach).toMatch(/Too slow through the eye/);
  });
  it('the tide does not score her: the same tack in a 1.5 kt current loses about the same', () => {
    const still = drill('tack', 10)!, tide = drill('tack', 10, undefined, { x: 0.77, y: 0 })!;
    expect(Math.abs(tide.lostM - still.lostM)).toBeLessThan(1);
  });
  it("keeps SIM_CREW (the coaching's yardstick) in step with the sim crew's own tacks and gybes", () => {
    for (const kind of ['tack', 'gybe'] as const) for (const [tws] of SIM_CREW[kind].filter((_, i) => i % 3 === 1)) {
      const s = drill(kind, tws)!, g = simCrew(kind, tws);
      expect(Math.abs(s.rate - g.rate), `${kind} ${tws} kt rate ${s.rate.toFixed(1)} vs ${g.rate}`).toBeLessThan(Math.max(0.6, 0.15 * g.rate));
      if (kind === 'tack') expect(Math.abs(s.deadS - g.dead), `${tws} kt dead ${s.deadS.toFixed(1)} vs ${g.dead}`).toBeLessThan(Math.max(0.5, 0.15 * g.dead));
      expect(Math.abs(s.lostM - g.lostM), `${kind} ${tws} kt lost ${s.lostM.toFixed(1)} vs ${g.lostM}`).toBeLessThan(Math.max(0.5, 0.15 * g.lostM));
    }
  });
});
