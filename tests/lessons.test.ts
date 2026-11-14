import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LESSON_MARKS, LessonTracker } from '../src/sim/lessons';
import { onLand } from '../src/geo/shore';
import { slipsIn } from '../src/geo/marina';
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
    for (const twa of [42, 60, 90, 130, 165]) for (let k = 0; k < LESSON_MARKS.pointS; k++) L.update(boat({ twa }), t++, 1);
    expect(L.passed).toBe(true);
  });

  it('a flicker of luffing in a puff takes back a moment, not the whole hold; a run with the sheets pinned in doesn\'t pass', () => {
    const L = new LessonTracker('points', null);
    let t = 0;
    for (let k = 0; k < 20 * 4; k++) L.update(boat({ twa: 42, main: k % 20 === 19 ? 'luffing' : 'good' }), t++, 0.25); // (a quarter-second luff every 5 s)
    expect(L.step).toBe(1);
    for (const twa of [60, 90, 130]) for (let k = 0; k < LESSON_MARKS.pointS; k++) L.update(boat({ twa }), t++, 1);
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
    run({ twa: 10, v: 0.1 }, LESSON_MARKS.outS + 2); expect(L.step).toBe(2); expect(L.cue).toMatch(/^Again/);
    run({ twa: 10, v: 0.1 }, 4); expect(L.step).toBe(3);
    run({ twa: 70, v: 3 * KT }, 4); expect(L.passed).toBe(true);
  });

  it('heave to: hove to (the physics\' own state) and nearly stopped, for a minute', () => {
    const L = new LessonTracker('heaveto', null);
    let t = 0;
    for (let k = 0; k < 30; k++) L.update(boat({ hove: true, v: 2.6 * KT }), t++, 1);
    expect(L.step).toBe(0); // (forereaching at 2.6 kt: sailing, not hove to)
    for (let k = 0; k < LESSON_MARKS.hoveS; k++) L.update(boat({ hove: true, v: 1.3 * KT }), t++, 1); // (a Folkboat's own forereach)
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

  it('jibing: three good jibes', () => {
    const tws = 12, a = FOLKBOAT.runAngle(tws), b = testBoat({ heading: 360 - a, kt: FOLKBOAT.speedKt(tws, a), windKt: tws });
    b.poleWant = true;
    const L = new LessonTracker('jibing', null); let t = 0;
    const tick = () => { L.update(b, t, 1 / 60); t += 1 / 60; };
    sail(b, 60, tick);
    for (let k = 0; k < 3; k++) { startTack(b); sail(b, 90, tick); }
    expect(L.good).toBe(3); expect(L.passed).toBe(true);
  });

  it('a lesson\'s wind is held to the standard\'s 5–15 kt; a race\'s isn\'t', () => {
    expect(new World(COURSES[0], S({ windKt: 25 }), 3, { freeSail: true }).wind.kt).toBeLessThanOrEqual(15.01);
    expect(new World(COURSES[0], S({ windKt: 3 }), 3, { freeSail: true }).wind.kt).toBeGreaterThanOrEqual(4.99);
    expect(new World(COURSES[0], S({ windKt: 25, mode: 'sail' }), 3, { freeSail: true }).wind.kt).toBeGreaterThan(20);
  });

  it('a broad reach counts with the jib eased as far as it goes (it reads stalled there); sternway isn\'t stopped', () => {
    const L = new LessonTracker('points', null);
    let t = 0;
    for (const twa of [42, 60, 90]) for (let k = 0; k < LESSON_MARKS.pointS; k++) L.update(boat({ twa }), t++, 1);
    for (let k = 0; k < LESSON_MARKS.pointS; k++) L.update(boat({ twa: 125, jib: 'stalled', eff: 0.9 }), t++, 1);
    expect(L.step).toBe(4);
    const I = new LessonTracker('irons', { x: 0, y: 0 });
    for (let k = 0; k < 10; k++) I.update({ ...boat({ v: 0 }), astern: 1.2 } as Boat, k, 1);
    expect(I.step).toBe(0); // (going astern at 2.3 kt by the buoy: not stopped)
  });

  it('the lesson\'s wind is the one she sails in: the Cityfront\'s own, held near 15 kt with the mean at the top', () => {
    const w = new World(COURSES[0], S({ windKt: 25 }), 3, { freeSail: true }); let sum = 0, n = 0;
    for (let i = 0; i < 120 * 60; i++) { w.step(DT); if (i % 30 === 0) { sum += w.user.ww.kt; n++; } }
    expect(sum / n).toBeLessThan(16.5);
  });

  it('a breeze: the mainsheet in hand, then close-hauled a minute with the heel under 25°', () => {
    const L = new LessonTracker('breeze', null); let t = 0;
    const b = (o: Parameters<typeof boat>[0] & { heel?: number; hand?: boolean }) => ({ ...boat(o), isUser: true, hand: o.hand ? { mainsheet: true } : {}, heelMag: o.heel ?? 15 }) as unknown as Boat;
    for (let k = 0; k < 5; k++) L.update(b({ twa: 42 }), t++, 1);
    expect(L.step).toBe(0); // (the crew has the sheet: not yet)
    for (let k = 0; k < 30; k++) L.update(b({ twa: 42, hand: true, heel: 30 }), t++, 1);
    expect(L.step).toBe(1); expect(L.progress).toBe(0); // (laid over at 30°: no)
    for (let k = 0; k < LESSON_MARKS.breezeS; k++) L.update(b({ twa: 42, hand: true, heel: 18, v: 3 * KT }), t++, 1);
    expect(L.passed).toBe(true);
  });

  it('home to the slip: out past the harbor, then back in her slip and made fast', () => {
    const L = new LessonTracker('home', null); L.slip = { x: 0, y: 0 };
    L.update({ ...boat({ x: 0 }), docked: { slip: 's' } } as unknown as Boat, 0, 1); expect(L.step).toBe(0);
    L.update(boat({ x: 200 }), 1, 1); expect(L.step).toBe(1);
    L.update({ ...boat({ x: 0 }), docked: { slip: 's' } } as unknown as Boat, 2, 1); expect(L.passed).toBe(true);
  });

  it('a breeze is sailed at the top of the range; home starts in her own slip', () => {
    const w = new World(COURSES[0], S({ windKt: 8, lesson: 'breeze' }), 3, { freeSail: true });
    expect(w.wind.kt).toBeGreaterThan(12);
  });

  it('before you go: the dock card done, lights on, both sails up and off the dock', () => {
    const L = new LessonTracker('before', null); L.slip = { x: 0, y: 0 };
    const b = (o: { x?: number; lightsOff?: boolean; up?: boolean; docked?: boolean }) => ({ ...boat({ x: o.x ?? 0 }), lightsOff: o.lightsOff ?? false, docked: o.docked ? { slip: 's' } : undefined,
      rig: { main: o.up ? 1 : 0, jib: o.up ? 1 : 0, mainUp: !!o.up, jibUp: !!o.up } }) as unknown as Boat;
    L.update(b({ lightsOff: true, docked: true }), 0, 1); expect(L.step).toBe(0);
    L.ready(true); expect(L.step).toBe(1); // (after dark: lights first)
    L.update(b({ lightsOff: true, docked: true }), 1, 1); expect(L.step).toBe(1);
    L.update(b({ docked: true }), 2, 1); expect(L.step).toBe(2);
    L.update(b({ x: 50 }), 3, 1); expect(L.passed).toBe(false); // (off the dock, sails still down)
    L.update(b({ x: 50, up: true }), 4, 1); expect(L.passed).toBe(true);
  });

  it('in the World: Before you go starts with her lights off', () => {
    const w = new World(COURSES[0], S({ lesson: 'before' }), 3, { freeSail: true });
    expect(w.user.lightsOff).toBe(true); expect(w.lesson!.cue).toMatch(/float plan/);
  });

  it('before you go by day skips the lights', () => {
    const L = new LessonTracker('before', null); L.ready(false); expect(L.step).toBe(2);
  });

  it('in the World: home to the slip, out of the harbor and back in, docks her and passes', () => {
    const slip = slipsIn('gashouse-cove').find(s => s.kind !== 'alongside')!;
    const w = new World(COURSES[0], S({ lesson: 'home', sailFrom: 'slip', sailTo: 'slip', boat: { ...DEFAULT_SETTINGS.boat!, slip: slip.id } }), 3, { freeSail: true }), u = w.user;
    expect(u.docked).toBeTruthy(); expect(w.lesson!.slip).toBeTruthy();
    // out on the Bay, past the basin
    Object.assign(u, { docked: undefined, x: slip.p.x, y: slip.p.y + 600, v: 2 }); w.step(DT);
    expect(w.lesson!.step).toBe(1);
    // back: a metre short of her berth on its heading, nearly stopped
    const back = { x: slip.p.x - Math.sin(slip.heading * Math.PI / 180) * 1, y: slip.p.y - Math.cos(slip.heading * Math.PI / 180) * 1 };
    Object.assign(u, { x: back.x, y: back.y, h: slip.heading, v: 0.4, astern: 0 });
    for (let i = 0; i < 60 * 20 && !w.lesson!.passed; i++) w.step(DT);
    expect(u.docked).toBeTruthy(); expect(w.lesson!.passed).toBe(true);
  });
});
