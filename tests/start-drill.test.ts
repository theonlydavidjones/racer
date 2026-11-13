import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { brg, V } from '../src/core/math';
import type { Frame } from '../src/replay/recorder';
import { finalApproach, lineCheck, startDebrief } from '../src/sim/startDebrief';

const TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, mode: 'drill', windKind: 'west', windKt: 12, current: 'slack', traffic: 0, tideDate: '2026-11-14', ...o });

describe('the start-line drill', () => {
  it('alone: just you, on the same line as with the fleet; from 2 min, well below it, the whole sequence recorded', () => {
    const solo = new World(TRAIN, settings(), 4, { startAt: 120, solo: true }), fleet = new World(TRAIN, settings(), 4, { startAt: 120 });
    expect(solo.boats.length).toBe(1); expect(fleet.boats.length).toBe(4);
    expect(solo.lineLen).toBeCloseTo(fleet.lineLen, 6);
    const d = -solo.lineD(solo.user);
    expect(d).toBeGreaterThan(60); expect(d).toBeLessThan(240);
    while (solo.t < -100) solo.step(DT);
    expect(solo.track[0].t).toBeLessThan(-118);
    // (a race still keeps its track from 30 s before the gun)
    const race = new World(TRAIN, settings({ mode: 'race', seq: 1 }), 4);
    while (race.t < -20) race.step(DT);
    expect(race.track[0].t).toBeGreaterThanOrEqual(-30);
  });

  /** A world with your track replaced: from (d m below the line, along a), heading h, at v m/s, from t0 to the gun. */
  const withTrack = (pts: (t: number) => { d: number; a: number; h: number; wind: number }) => {
    const w = new World(TRAIN, settings(), 4, { startAt: 120, solo: true }), F: Frame[] = [];
    for (let t = -120; t <= 5; t++) { const q = pts(t), x = w.center.x - w.N.x * q.d + w.L.x * q.a, y = w.center.y - w.N.y * q.d + w.L.y * q.a;
      F.push({ t, b: [[x, y, q.h, 'S', 0, 0, q.wind, 0]] }); }
    (w as unknown as { track: Frame[] }).track = F;
    return w;
  };

  it('time on distance: the run in found from the track: when you turned, how far out, how long, how fast', () => {
    // reaching along the line 150 m below it until −60 s, then straight at it at 2.5 m/s: on the line at the gun
    const w = withTrack(t => ({ d: t < -60 ? 150 : Math.max(0, 150 - (t + 60) * 2.5), a: t < -60 ? (t + 120) * 2 : 120, h: 0, wind: 0 }));
    const ap = finalApproach(w)!;
    expect(ap.t0).toBe(-60); expect(ap.fromM).toBeCloseTo(150, 0); expect(ap.dur).toBe(60);
    expect(ap.meanV).toBeCloseTo(2.5, 1); expect(ap.toward).toBeCloseTo(1, 2);
  });

  it('the favoured end as you\'d check it: head to wind near the line, your bow against square to it', () => {
    const w0 = withTrack(() => ({ d: 100, a: 0, h: 0, wind: 0 })), sq = brg(w0.N.x, w0.N.y);
    // head to wind 6° clockwise of square, 40 m below the line, from −90 s
    const w = withTrack(t => ({ d: t < -90 ? 150 : 40, a: 0, h: t < -90 ? sq + 90 : sq + 6, wind: sq + 6 }));
    const c = lineCheck(w)!;
    expect(c.t).toBeGreaterThanOrEqual(-90); expect(c.offDeg).toBeCloseTo(6, 0); expect(c.atM).toBeCloseTo(40, 0);
    // the end clockwise of square, looking upwind, is the one the wind comes from: that end is favoured
    const cw = V(sq + 90), toCommittee = { x: w.committee.x - w.pin.x, y: w.committee.y - w.pin.y };
    expect(c.toward).toBe(cw.x * toCommittee.x + cw.y * toCommittee.y > 0 ? 'committee' : 'pin');
    // and never head to wind: no check found, and the debrief says how to do it
    expect(lineCheck(withTrack(() => ({ d: 100, a: 0, h: sq + 90, wind: sq })))).toBeNull();
  });

  it('a real attempt from 2 min gives a debrief with its numbers for the run of attempts', () => {
    const w = new World(TRAIN, settings(), 9, { startAt: 120, solo: true });
    while (w.t < 16) w.step(DT);
    const d = startDebrief(w);
    expect(d.stats).toBeDefined();
    expect(['pin', 'middle', 'committee']).toContain(d.stats!.end);
    expect(d.facts.length).toBeGreaterThan(3);
  }, 60_000);
});
