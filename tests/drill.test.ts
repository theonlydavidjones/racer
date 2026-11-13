import { describe, expect, it } from 'vitest';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { FOLKBOAT } from '../src/boat/polar';
import { D2R, KT, wrap } from '../src/core/math';
import { DrillTracker, SIM_CREW, coachLine, simCrew, type ManoeuvreScore } from '../src/sim/drill';
import { manoeuvreS } from '../src/sim/routing';
import { takeLine } from '../src/boat/physics';
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
    // (so timid she creeps through the eye: told so, as a stalled tack, whether or not there was a speed to score it by)
    const good = drill('tack', 10)!, slow = drill('tack', 10, { tiller: -0.12 })!;
    expect(slow.coach).toMatch(/Too slow through the eye|Stuck in irons/);
    if (slow.scored) { expect(slow.deadS).toBeGreaterThan(good.deadS * 1.6); expect(slow.lostM).toBeGreaterThan(good.lostM); }
  });
  it('full helm through a tack turns at least as hard, overshoots the new course, and costs at least the crew\'s tack', () => {
    // (the sim's boat doesn't stall in a hard turn: its rudder's braking at full helm decides how much a spin costs,
    // and today it costs little more than the crew's tack)
    const good = drill('tack', 10)!, fast = drill('tack', 10, { tiller: -1 })!;
    expect(fast.peakRate).toBeGreaterThan(good.peakRate - 0.5); // (the crew already tack at about full helm)
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

  // the physics review's cases: only a real manoeuvre, from a steady course on that point of sail, is scored
  const run = (b: Boat & { handsOff?: boolean }, d: DrillTracker, secs: number, each?: () => void) => { let t = (d as unknown as { _t?: number })._t ?? 0; sail(b, secs, () => { each?.(); d.step(b, t, 1 / 60); t += 1 / 60; }); (d as unknown as { _t?: number })._t = t; };
  it('bearing away from close-hauled straight into a gybe is noted, not scored (and never a negative loss)', () => {
    const tws = 12, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    run(b, d, 40); b.poleWant = true;
    // one long turn from close-hauled on port, round through the run and into the gybe
    b.handsOff = true; b.tiller = 0.6; run(b, d, 25); b.handsOff = false; b.tiller = 0; run(b, d, 60);
    const g = d.list.filter(x => x.kind === 'gybe');
    expect(g.length).toBeGreaterThan(0);
    expect(g.every(x => !x.scored)).toBe(true);
    expect(g[0].coach).toMatch(/Gybe not scored/);
    expect(d.list.filter(x => x.scored).every(x => x.lostM >= -2.5)).toBe(true);
  });
  it('a tack from a reach is noted, not scored', () => {
    const tws = 12, b = testBoat({ heading: 270, kt: 5, windKt: tws }) as Boat, d = new DrillTracker();
    run(b, d, 40); startTack(b); run(b, d, 60);
    const s = d.list[0];
    expect(s?.scored).toBe(false); expect(s?.coach).toMatch(/Tack not scored/);
  });
  it('a wind shift that flips the tack with no turn is not a manoeuvre', () => {
    const tws = 12, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    run(b, d, 40); b.handsOff = true; b.tiller = 0;
    b.ww = { ...b.ww, from: (b.ww.from - 2 * ang - 10 + 360) % 360 }; // (a 90°-odd shift: she's on the other tack where she points)
    run(b, d, 40, () => { b.h = 360 - ang; });
    expect(d.list.filter(x => x.scored).length).toBe(0);
  });
  it('tacking on a header is not scored as a loss: the twin sails in the same wind', () => {
    const tws = 12, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat, d = new DrillTracker();
    run(b, d, 60); startTack(b);
    // a 10° header on the new tack, 8 s after the flip; she's sailed close-hauled in it, as a sailor would
    let flipT = -1, t = 0;
    run(b, d, 90, () => { t += 1 / 60; if (flipT < 0 && b.tack === 'P') flipT = t;
      if (flipT >= 0 && t - flipT > 8) { if (t - flipT < 8 + 1 / 59) b.ww = { ...b.ww, from: (b.ww.from - 10 + 360) % 360 }; b.h = (b.ww.from + ang + 360) % 360; } });
    const s = d.list.find(x => x.scored)!;
    expect(Math.abs(s.lostM - s.goodM), `lost ${s.lostM.toFixed(1)} vs ${s.goodM.toFixed(1)}`).toBeLessThan(2.5);
  });
  it('hove to (the jib left aback) is not scored as a tack', () => {
    const tws = 12, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat, d = new DrillTracker();
    // (heaving to: tack and leave the old jib sheet made fast, so the jib stays aback on the new windward side)
    run(b, d, 40); takeLine(b, 'jibsheet'); takeLine(b, 'jibsheetW'); startTack(b);
    run(b, d, 60, () => { if (b.tack === 'P') { b.ctl.jibsheetW = 0; b.ctl.jibsheet = 1; } });
    expect(b.hove).toBe(true);
    expect(d.list.length).toBe(0);
  });
  it("a good tack with the jib sheets yours is still a good tack (no 'too early' line without an honest signal for it)", () => {
    const s = drill('tack', 12)!;
    expect(coachLine(s, true)).toMatch(/^A good tack/);
  });

  it('an aborted tack (back onto the old tack before the turn is done) is noted, not scored, and makes no best', () => {
    const tws = 12, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    run(b, d, 40);
    // head up through the wind by 10°, then fall back onto the old tack
    b.handsOff = true; b.tiller = -0.6; let backAgain = false;
    run(b, d, 30, () => { const a = wrap(b.ww.from - b.h); if (!backAgain && a < -10) { backAgain = true; b.tiller = 0.6; } if (backAgain && a > ang - 2) b.tiller = 0; });
    b.handsOff = false; run(b, d, 40);
    expect(d.list.some(x => x.scored)).toBe(false);
    expect(d.list.some(x => /not completed/.test(x.coach))).toBe(true);
  });
  it("in a Bay chop the crew's own tack is still scored, over the turn itself (a wave's yaw isn't turning)", () => {
    const tws = 14, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat, d = new DrillTracker();
    b.sea = { ...b.sea, hsW: 0.6, tpW: 2.5, fromW: b.ww.from, steep: 0.06 };
    run(b, d, 60); startTack(b); run(b, d, 90);
    const s = d.list.find(x => x.scored);
    expect(s, d.list.map(x => x.coach).join(' | ')).toBeTruthy();
    expect(s!.turnS).toBeLessThan(14);
    expect(s!.rate).toBeGreaterThan(0.6 * simCrew('tack', tws).rate);
  });
  it('drifting, and wallowing on a run with no gybe, make no notes', () => {
    const tws = 6, b = testBoat({ heading: 180, kt: 0.3, windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    b.handsOff = true; b.tiller = 0;
    let t = 0; run(b, d, 300, () => { t += 1 / 60; b.ww = { ...b.ww, from: (360 + 6 * Math.sin(t / 7)) % 360 }; });
    expect(d.list.length, d.list.map(x => x.coach).join(' | ')).toBe(0);
  });
  it('a lull right after the tack is not read as a gain (back to speed is judged in the wind as it is)', () => {
    const tws = 10, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat, d = new DrillTracker();
    run(b, d, 60); startTack(b);
    let flipT = -1, t = 0;
    run(b, d, 90, () => { t += 1 / 60; if (flipT < 0 && b.tack === 'P') flipT = t; if (flipT >= 0 && t - flipT > 2 && b.ww.kt === tws) b.ww = { ...b.ww, kt: tws - 4 }; });
    const s = d.list.find(x => x.scored)!;
    expect(s.backS).not.toBeNull();
    expect(s.lostM).toBeGreaterThan(0.5 * s.goodM);
  });

  it('an aborted tack that pauses just past the eye before falling back is still one aborted tack, not two scored', () => {
    for (const pause of [1.5, 3, 5]) {
      const tws = 8, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
      run(b, d, 40); b.handsOff = true; b.tiller = -0.6;
      let phase = 0, t = 0, at = 0;
      run(b, d, 40, () => { t += 1 / 60; const a = wrap(b.ww.from - b.h);
        if (phase === 0 && a < -5) { phase = 1; at = t; b.tiller = 0; } else if (phase === 1 && t - at > pause) { phase = 2; b.tiller = 0.6; } else if (phase === 2 && a > ang - 2) { phase = 3; b.tiller = 0; } });
      b.handsOff = false; run(b, d, 60);
      expect(d.list.filter(x => x.scored).length, `${pause} s: ${d.list.map(x => x.coach).join(' | ')}`).toBe(0);
    }
  });
  it('a dead run rocking in a quartering sea, with no gybe, makes no notes', () => {
    const tws = 14, b = testBoat({ heading: 182, kt: 5, windKt: tws }) as Boat, d = new DrillTracker();
    b.poleWant = true; b.sea = { ...b.sea, hsW: 0.6, tpW: 2.5, fromW: 20, steep: 0.06 };
    let t = 0; run(b, d, 180, () => { t += 1 / 60; b.ww = { ...b.ww, from: (360 + 4 * Math.sin(t / 9)) % 360 }; b.h = 182; });
    expect(d.list.length, d.list.map(x => x.coach).join(' | ')).toBe(0);
  });
  it('a tack that stops head to wind before she falls across is told it was stuck in irons', () => {
    const tws = 6, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    for (const til of [-0.08, -0.15]) {
      const b2 = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d2 = new DrillTracker();
      run(b2, d2, 40); b2.handsOff = true; b2.tiller = til; run(b2, d2, 120); b2.handsOff = false; run(b2, d2, 40);
      expect(d2.list.some(x => /Stuck in irons|Too slow through the eye/.test(x.coach)), `${til}: ${d2.list.map(x => x.coach).join(' | ')}`).toBe(true);
    }
    void b; void d;
  });

  it('a tack then a pinch (sailing a few degrees above close-hauled) still scores, and so does the tack back', () => {
    const tws = 8, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat, d = new DrillTracker();
    run(b, d, 50); startTack(b);
    let t = 0, flipT = -1; run(b, d, 30, () => { t += 1 / 60; if (flipT < 0 && b.tack === 'P') flipT = t; if (flipT >= 0 && t - flipT > 8) b.h = (b.ww.from + ang - 8 + 360) % 360; });
    startTack(b); run(b, d, 60);
    expect(d.list.filter(x => x.scored && x.kind === 'tack').length, d.list.map(x => x.coach).join(' | ')).toBe(2);
  });
  it('a slow tack is shown at its own rate (not faster than it turned)', () => {
    const tws = 8, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    run(b, d, 50); b.handsOff = true; let h = b.h, done = false;
    run(b, d, 80, () => { if (!done) { h = (h + 3 / 60) % 360; b.h = h; if (wrap(b.ww.from - b.h) < -ang) done = true; } });
    const s = d.list.find(x => x.scored || /slow|irons/i.test(x.coach));
    expect(s, d.list.map(x => x.coach).join(' | ')).toBeTruthy();
    if (s!.scored) expect(s!.rate).toBeLessThan(4.5);
  });
  it('sitting in irons and wagging the tiller tells it once, not on every flip', () => {
    const tws = 6, ang = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - ang, kt: FOLKBOAT.speedKt(tws, ang), windKt: tws }) as Boat & { handsOff?: boolean }, d = new DrillTracker();
    run(b, d, 40); b.handsOff = true; b.tiller = -0.08; run(b, d, 110);
    let t = 0; run(b, d, 100, () => { t += 1 / 60; b.h = (b.ww.from + 4 * Math.sin(t / 3) + 360) % 360; b.v = Math.min(b.v, 0.2); });
    expect(d.list.filter(x => /irons|Too slow/.test(x.coach)).length, d.list.map(x => x.coach).join(' | ')).toBeLessThanOrEqual(1);
  });
});
