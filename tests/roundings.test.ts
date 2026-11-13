import { describe, expect, it } from 'vitest';
import { RoundingTracker, simCrew, roundingCoach, roundingKey, type RoundingScore, type CrewRounding } from '../src/sim/roundings';
import { FOLKBOAT } from '../src/boat/polar';
import { KT, V } from '../src/core/math';
import { DT } from '../src/sim/world';
import type { Boat } from '../src/boat/boat';
import type { Course } from '../src/courses/course';

// (the full-World test, driving the sim crew round the course, is tests/roundings-crew.test.ts — excluded from test:fast)

describe('The rounding coach: the costly mistakes, each in its own words (sim/roundings.ts roundingCoach)', () => {
  const base = (kind: 'windward' | 'leeward', over: Partial<RoundingScore> = {}): RoundingScore => ({
    kind, scored: true, tws: 12, hs: 0, lostM: simCrew(kind, 12).lostM, goodM: simCrew(kind, 12).lostM, tacks: 1, freeS: 0, pinchS: 0,
    stallS: 0, poleS: kind === 'windward' ? 15 : null, dropS: kind === 'leeward' ? 28 : null, entryD: 20, exitD: simCrew(kind, 12).exitD, closest: 5, peakRate: 12, minSpeed: 0.8, slackS: 0, touched: false, coach: '', ...over
  });
  const g = (kind: 'windward' | 'leeward'): CrewRounding => simCrew(kind, 12);

  it('a touch is called first of all', () => {
    expect(roundingCoach(base('leeward', { touched: true }), g('leeward'))).toMatch(/touched the mark/);
  });
  it('short of the layline (pinching or an extra tack) is told', () => {
    expect(roundingCoach(base('windward', { pinchS: 8, lostM: 60 }), g('windward'))).toMatch(/Short of the layline/);
    expect(roundingCoach(base('windward', { tacks: 3, lostM: 60 }), g('windward'))).toMatch(/Short of the layline/);
  });
  it('overstanding (reaching in) is told', () => {
    expect(roundingCoach(base('windward', { freeS: 20, lostM: 60 }), g('windward'))).toMatch(/Overstood/);
  });
  it('a late pole after the windward mark is told, but not in light air where the crew does not pole', () => {
    expect(roundingCoach(base('windward', { poleS: null, lostM: 60 }), g('windward'))).toMatch(/pole/i);
    const light = { ...simCrew('windward', 6) };
    expect(roundingCoach(base('windward', { tws: 6, poleS: null, lostM: light.lostM, goodM: light.lostM }), light)).not.toMatch(/pole/i);
  });
  it('easing the main late on the bear-away is told', () => {
    expect(roundingCoach(base('windward', { stallS: 6 }), g('windward'))).toMatch(/Ease the main/);
  });
  it('a late drop and a wide exit at the leeward mark are each told', () => {
    expect(roundingCoach(base('leeward', { dropS: null, lostM: 50 }), g('leeward'))).toMatch(/Pole down late/);
    expect(roundingCoach(base('leeward', { exitD: 40, lostM: 50 }), g('leeward'))).toMatch(/Wide out/);
  });
  it('turning too hard onto the wind (slowing right down) is told', () => {
    expect(roundingCoach(base('leeward', { peakRate: 30, minSpeed: 0.5, lostM: 50 }), g('leeward'))).toMatch(/too hard/);
  });
  it('a good rounding is praised', () => {
    expect(roundingCoach(base('windward'), g('windward'))).toMatch(/good rounding/);
    expect(roundingCoach(base('leeward'), g('leeward'))).toMatch(/good rounding/);
  });
  it('the best is kept by mark and wind band', () => {
    expect(roundingKey({ kind: 'windward', tws: 6 })).toBe('wmark-light');
    expect(roundingKey({ kind: 'leeward', tws: 12 })).toBe('lmark-medium');
    expect(roundingKey({ kind: 'windward', tws: 20 })).toBe('wmark-fresh');
  });
});

describe('The rounding measure is through the water: the tide does not score her (a scripted boat, no AI)', () => {
  // A boat that sails exactly the same track through the water in every stream: close-hauled at the polar's speed up to
  // the windward mark (she's set so the stream carries her past it on the right side), across its upwind ray just above
  // it, then off down the run at the polar's speed. Whatever the stream along the wind, what she makes good through the
  // water, and the twin's, are the same; so is her score.
  const wind = 0, tws = 12, W = { x: 0, y: 600 }, pin = { x: 0, y: 0 };
  const course = { marks: [{ key: 'W', name: 'Windward mark', p: W, type: 'round', side: 'p', shape: 'cylinder', look: 'Y', beat: true, leg: 'beat', prev: pin, next: pin, dir: { x: 0, y: 1 }, sv: { x: 0, y: 0 }, r: { x: 0, y: 1 } }], pin, pinLabel: 'Pin' } as unknown as Course;
  /** `e0`: how far above the mark she crosses its upwind ray before bearing away (more: she kept on past the mark);
   * `stopAt`: stopped dead through the water for 10 s once she's this close to the mark, inside the gate (a mistake).
   * She's started so she crosses the ray at the same height in every stream. */
  function scripted(cy: number, e0 = 4, stopAt?: number): (RoundingScore & { e: number }) | undefined {
    const tr = new RoundingTracker(course);
    // (as after a lap: her pace on the run already measured, at the polar's, so the twin's run isn't the first-lap guess)
    (tr as unknown as { eta: { up: number | null; down: number | null } }).eta.down = 1;
    const a = FOLKBOAT.beatAngle(tws), S = FOLKBOAT.speedKt(tws, a) * KT, r = FOLKBOAT.runAngle(tws), Sr = FOLKBOAT.speedKt(tws, r) * KT;
    const hb = 360 - a, hr = 360 - r, vb = V(hb), vr = V(hr);
    // where to start so the stream (along the wind) brings her past the mark 4 m off on her way up: 220 m below it
    const y0 = W.y - 220, moving = (W.y + e0 - y0 - (stopAt != null ? 10 * cy : 0)) / (S * vb.y + cy), x0 = W.x - S * vb.x * moving;
    const b = { isUser: false, docked: undefined, pushing: false, motor: null, pilotSteers: false, x: x0, y: y0, h: hb, v: S, vx: 0, vy: 0, cur: { x: 0, y: cy },
      ww: { from: wind, kt: tws }, sea: { hsW: 0, tpW: 3 }, tack: 'S', pole: 'down', markTouch: null, trim: { main: { flow: 'good' }, jib: { flow: 'good' } } } as unknown as Boat;
    let t = 0, run = false, e = 0, stopT = -1;
    for (let i = 0; i < 60 * 1200 && tr.list.length === 0; i++) {
      if (!run && b.x < W.x - 0.5 && b.y > W.y) { run = true; e = b.y - W.y; } // (across the mark's upwind ray, above it: bear away)
      if (stopAt != null && stopT < 0 && Math.hypot(b.x - W.x, b.y - W.y) < stopAt) stopT = t; // (inside the gate, wherever the stream has set her)
      const stopped = stopT >= 0 && t - stopT < 10, u = run ? vr : vb, sp = stopped ? 0 : run ? Sr : S;
      b.h = run ? hr : hb; b.v = sp; b.vx = sp * u.x + b.cur.x; b.vy = sp * u.y + b.cur.y;
      b.x += b.vx * DT; b.y += b.vy * DT; t += DT;
      tr.step(b, t, DT);
    }
    return tr.list[0] && { ...tr.list[0], e };
  }
  it('scores the same rounding the same in slack water, a flood and an ebb along the wind', () => {
    const slack = scripted(0)!;
    expect(slack?.scored, 'the scripted rounding is scored').toBe(true);
    for (const cy of [0.77, -0.77, -1.29]) { // (1.5 kt each way, 2.5 kt foul)
      const s = scripted(cy)!;
      expect(s?.scored, `stream ${cy}`).toBe(true);
      expect(Math.abs(s.lostM - slack.lostM), `stream ${cy} m/s: lost ${s.lostM.toFixed(1)} vs slack ${slack.lostM.toFixed(1)}`).toBeLessThan(2.5); // (the crossing height and the window's length differ a little with the stream)
    }
  });
  it('keeping on past the mark before turning costs what it does on the water: the ground there and back', () => {
    // (each metre past the mark's level she makes and must give back: about 1 + VMG down / VMG up, 2.2 m a metre at 12 kt)
    const near = scripted(0, 4)!, far = scripted(0, 30)!, de = far.e - near.e;
    expect(de, 'she crossed higher').toBeGreaterThan(15);
    expect((far.lostM - near.lostM) / de, `lost ${near.lostM.toFixed(1)} → ${far.lostM.toFixed(1)} for ${de.toFixed(0)} m more`).toBeGreaterThan(1.8);
  });
  it('a mistake (10 s stopped short of the mark) costs about the same in slack, and a little more in a strong stream, never less', () => {
    // (through the water the stream scales a loss before the mark by the time she then takes: in a 2.5 kt foul stream
    // about 40% more; over the ground, as a rival nearby would see it, it would be several times that)
    const clean = scripted(0)!.lostM, slack = scripted(0, 4, 60)!.lostM - clean;
    expect(slack, 'the stop costs').toBeGreaterThan(15);
    for (const cy of [0.77, -0.77, -1.29]) {
      const loss = scripted(cy, 4, 60)!.lostM - scripted(cy)!.lostM;
      expect(loss / slack, `stream ${cy} m/s: the stop costs ${loss.toFixed(1)} vs ${slack.toFixed(1)} in slack`).toBeGreaterThan(0.85);
      expect(loss / slack, `stream ${cy} m/s: the stop costs ${loss.toFixed(1)} vs ${slack.toFixed(1)} in slack`).toBeLessThan(1.5);
    }
  });
});
