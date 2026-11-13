import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LESSON_MARKS, LessonTracker } from '../src/sim/lessons';
import { onLand } from '../src/geo/shore';
import { KT } from '../src/core/math';
import type { Boat } from '../src/boat/boat';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { FOLKBOAT } from '../src/boat/polar';

/** A boat as the lesson sees her: where, which way, how fast, the wind's angle and how her sails are drawing. */
const boat = (o: Partial<{ x: number; y: number; h: number; v: number; twa: number; main: string; jib: string; eff: number; hove: boolean }>): Boat => ({
  x: o.x ?? 0, y: o.y ?? 0, h: o.h ?? 270, v: o.v ?? 2.5, twa: o.twa ?? 90, hove: o.hove, ww: { kt: 12, from: 0 }, sea: { hsW: 0, tpW: 2 },
  trim: { main: { flow: o.main ?? 'good', eff: o.eff ?? 1 }, jib: { flow: o.jib ?? 'good', eff: o.eff ?? 1 } }
}) as unknown as Boat;
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0, ...o });

describe('Learn to sail: the lessons\' checks', () => {
  it('the tiller: reach the buoy, then hold the course you were on there for a minute; wandering off starts it again', () => {
    const L = new LessonTracker('tiller', { x: 0, y: 100 });
    L.update(boat({ y: 0 }), 0, 1); expect(L.step).toBe(0); expect(L.cue).toBe('Steer for the buoy');
    L.update(boat({ y: 90, h: 357 }), 1, 1); expect(L.step).toBe(1); expect(L.course).toBe(355); expect(L.cue).toBe('Hold 355° on the compass');
    let t = 2;
    for (; t < 2 + 40; t++) L.update(boat({ h: 350 }), t, 1); // (within 10°)
    expect(L.passed).toBe(false); expect(L.progress).toBeCloseTo(40 / LESSON_MARKS.holdS, 2);
    L.update(boat({ h: 20 }), t++, 1); expect(L.progress).toBe(0); // (25° off: again)
    for (let k = 0; k < LESSON_MARKS.holdS; k++) L.update(boat({ h: 0 }), t++, 1);
    expect(L.passed).toBe(true); expect(L.cue).toBe('Lesson passed ✓');
  });

  it('points of sail: close-hauled, a beam reach and a run, each held with the sails drawing; a luffing sail doesn\'t count', () => {
    const L = new LessonTracker('points', null);
    let t = 0;
    for (let k = 0; k < 30; k++) L.update(boat({ twa: 42, jib: 'luffing' }), t++, 1);
    expect(L.step).toBe(0); // (the jib luffing: not yet)
    for (let k = 0; k < 30; k++) L.update(boat({ twa: 54 }), t++, 1);
    expect(L.step).toBe(0); // (54° in 12 kt is a close reach, not close-hauled)
    for (const twa of [42, 90, 165]) for (let k = 0; k < LESSON_MARKS.pointS; k++) L.update(boat({ twa }), t++, 1);
    expect(L.passed).toBe(true);
  });

  it('a flicker of luffing in a puff takes back a moment, not the whole hold; a run with the sheets pinned in doesn\'t pass', () => {
    const L = new LessonTracker('points', null);
    let t = 0;
    for (let k = 0; k < 20 * 4; k++) L.update(boat({ twa: 42, main: k % 20 === 19 ? 'luffing' : 'good' }), t++, 0.25); // (a quarter-second luff every 5 s)
    expect(L.step).toBe(1);
    for (let k = 0; k < LESSON_MARKS.pointS; k++) L.update(boat({ twa: 90 }), t++, 1);
    for (let k = 0; k < 60; k++) L.update(boat({ twa: 170, eff: 0.85 }), t++, 1);
    expect(L.passed).toBe(false); // (sheets in on a run: the sails stalled, eff 0.85)
  });

  it('in the World: a lesson sails alone off the Cityfront, the tiller\'s buoy on open water, checked as she sails', () => {
    const w = new World(COURSES[0], S({ lesson: 'tiller' }), 3, { freeSail: true });
    expect(w.boats.length).toBe(1); expect(w.lesson?.id).toBe('tiller');
    const B = w.lesson!.buoy!; expect(onLand(B)).toBe(false);
    const d0 = Math.hypot(w.user.x - B.x, w.user.y - B.y); expect(d0).toBeGreaterThan(150);
    for (let i = 0; i < 10 * 60; i++) w.step(DT);
    expect(w.user.v).toBeGreaterThan(1 * KT); expect(w.lesson!.step).toBe(0);
  });

  it('stop, go, irons: stopped by the buoy, going again, in irons, then out of irons in time (too long: into irons again)', () => {
    const L = new LessonTracker('irons', { x: 0, y: 0 });
    let t = 0;
    const run = (o: Parameters<typeof boat>[0], s: number) => { for (let k = 0; k < s; k++) L.update(boat(o), t++, 1); };
    run({ x: 10, v: 0.1 }, 4); expect(L.step).toBe(1);
    run({ v: 3 * KT }, 4); expect(L.step).toBe(2);
    run({ twa: 10, v: 0.1 }, 4); expect(L.step).toBe(3);
    run({ twa: 10, v: 0.1 }, LESSON_MARKS.outS + 5); expect(L.step).toBe(2); expect(L.cue).toMatch(/^Again/);
    run({ twa: 10, v: 0.1 }, 4); expect(L.step).toBe(3);
    run({ twa: 70, v: 3 * KT }, 4); expect(L.passed).toBe(true);
  });

  it('heave to: hove to (the physics\' own state) and nearly stopped, for a minute', () => {
    const L = new LessonTracker('heaveto', null);
    let t = 0;
    for (let k = 0; k < 30; k++) L.update(boat({ hove: true, v: 2 * KT }), t++, 1);
    expect(L.step).toBe(0); // (forereaching at 2 kt: not hove to)
    for (let k = 0; k < LESSON_MARKS.hoveS; k++) L.update(boat({ hove: true, v: 0.4 * KT }), t++, 1);
    expect(L.passed).toBe(true);
  });

  it('tacking: three good tacks, scored by the tack and gybe drill\'s own measure', () => {
    const tws = 12, a = FOLKBOAT.beatAngle(tws), b = testBoat({ heading: 360 - a, kt: FOLKBOAT.speedKt(tws, a), windKt: tws });
    const L = new LessonTracker('tacking', null); let t = 0;
    const tick = () => { L.update(b, t, 1 / 60); t += 1 / 60; };
    sail(b, 30, tick);
    for (let k = 0; k < 3; k++) { startTack(b); sail(b, 60, tick); }
    expect(L.good).toBe(3); expect(L.passed).toBe(true);
  });

  it('gybing: three good gybes', () => {
    const tws = 12, a = FOLKBOAT.runAngle(tws), b = testBoat({ heading: 360 - a, kt: FOLKBOAT.speedKt(tws, a), windKt: tws });
    b.poleWant = true;
    const L = new LessonTracker('gybing', null); let t = 0;
    const tick = () => { L.update(b, t, 1 / 60); t += 1 / 60; };
    sail(b, 60, tick);
    for (let k = 0; k < 3; k++) { startTack(b); sail(b, 90, tick); }
    expect(L.good).toBe(3); expect(L.passed).toBe(true);
  });
});
