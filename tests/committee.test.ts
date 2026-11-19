import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { D2R, KT, V, brg, sub, wrap } from '../src/core/math';
import { buildCourse, type CourseFile } from '../src/courses/course';
import { beatAngle, polar, runAngle } from '../src/boat/polar';
import { TARGET_MIN, TIME_FIT, chooseCourse, estimateCourse, legTime, raceDay } from '../src/courses/committee';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', tideDate: '2026-11-14', tideTime: '13:00', traffic: 0, ...o });
const NM = 1852, still = { x: 0, y: 0 };

describe('how long a leg takes', () => {
  const w = { kt: 12, from: 0 };
  it('a beat: the distance over the speed made good to windward, plus a tack or two', () => {
    const t = legTime({ x: 0, y: 0 }, { x: 0, y: NM }, w, still)!, b = beatAngle(12), vmg = polar(12, b) * Math.cos(b * D2R);
    expect(t.kind).toBe('beat');
    expect(t.s).toBeGreaterThan(NM / vmg); expect(t.s).toBeLessThan(NM / vmg + 40);
  });
  it('a run: gybing down at the best angle; a reach: straight there', () => {
    const r = runAngle(12), run = legTime({ x: 0, y: 0 }, { x: 0, y: -NM }, w, still)!;
    expect(run.kind).toBe('run'); expect(run.s).toBeLessThan(NM / (polar(12, r) * -Math.cos(r * D2R)) + 40);
    const reach = legTime({ x: 0, y: 0 }, { x: NM, y: 0 }, w, still)!;
    expect(reach.kind).toBe('reach'); expect(reach.s).toBeCloseTo(NM / polar(12, 90), -1);
  });
  it('the tide: a foul current makes a beat longer, a fair one shorter; too much foul current and she can\'t get there', () => {
    const foul = { x: 0, y: -1 * KT }, fair = { x: 0, y: 1 * KT };
    const t0 = legTime({ x: 0, y: 0 }, { x: 0, y: NM }, w, still)!.s;
    expect(legTime({ x: 0, y: 0 }, { x: 0, y: NM }, w, foul)!.s).toBeGreaterThan(t0 * 1.3);
    expect(legTime({ x: 0, y: 0 }, { x: 0, y: NM }, w, fair)!.s).toBeLessThan(t0 * 0.8);
    const drift = { kt: 2, from: 0 }, ebb = V(0); // 2 kt of wind, 2.5 kt of current against her
    expect(legTime({ x: 0, y: 0 }, { x: 0, y: NM }, drift, { x: -ebb.x * 2.5 * KT, y: -ebb.y * 2.5 * KT })).toBeNull();
  });
});

describe('the race committee\'s choice', () => {
  it('fits the target time, starting to windward in the westerly', () => {
    for (const raceLength of ['short', 'medium', 'long'] as const) {
      const c = chooseCourse(COURSES, settings({ windKt: 12, current: 'slack', raceLength }))!;
      expect(c.est.upwindStart).toBe(true);
      expect(c.est.minutes / TARGET_MIN[raceLength]).toBeGreaterThan(0.7);
      expect(c.est.minutes / TARGET_MIN[raceLength]).toBeLessThan(1.4);
      expect(c.why).toMatch(/course \d+/);
    }
  });
  it('a longer race is a longer course; more wind, a longer course for the same time', () => {
    const nm = (o: Partial<Settings>) => chooseCourse(COURSES, settings({ current: 'slack', ...o }))!.est.file.distanceNm!;
    expect(nm({ windKt: 12, raceLength: 'long' })).toBeGreaterThan(nm({ windKt: 12, raceLength: 'short' }));
    expect(nm({ windKt: 18, raceLength: 'medium' })).toBeGreaterThan(nm({ windKt: 6, raceLength: 'medium' }));
  });
  it('the same day gives the same course', () => {
    const a = chooseCourse(COURSES, settings({ windKt: 0, current: 'real' }))!, b = chooseCourse(COURSES, settings({ windKt: 0, current: 'real' }))!;
    expect(a.est.no).toBe(b.est.no);
  });
  it('the race flies the number; just sailing doesn\'t', () => {
    const c = chooseCourse(COURSES, settings({ windKt: 12, current: 'slack' }))!;
    const w = new World(c.est.file, settings({ windKt: 12, current: 'slack' }), 1, { courseSignal: { no: c.est.no, why: c.why } });
    expect(w.courseSignal?.no).toBe(c.est.no);
    expect(new World(c.est.file, settings({ mode: 'sail' }), 1, { freeSail: true, courseSignal: { no: 1, why: '' } }).courseSignal).toBeNull();
  });
});

describe('a start to leeward (the courses starting east)', () => {
  // A start to leeward: the boats hold upwind of the line and come in on a run. Easing the sails barely slows a boat
  // on a run, so the AI burns time on a reach along the line and bears away when it's time, on starboard gybe when
  // it can (src/ai/ai.ts). Measured over many races, since one race turns on who meets whom. Before that, about 60% of
  // the boats that didn't foul got away within 20 s and a dozen of 48 fouled; now nearly all of them do, and a flood
  // setting them onto the line no longer sends half the fleet over early.
  const leeward = (current: string, seeds: number) => {
    const f = COURSES.find(c => c.id === 'ss41')!;
    let onTime = 0, n = 0, fouls = 0, over = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const w = new World(f, settings({ windKt: 12, current, fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] }), seed), fouled = new Set<number>();
      while (w.t < 40) {
        w.step(DT);
        for (const b of w.boats) if (b.penalty > 0 && w.t < 0) fouled.add(b.id);
        if (Math.abs(w.t) < DT / 2) over += w.boats.slice(1).filter(b => b.ocs).length;
      }
      fouls += [...fouled].filter(id => id > 0).length;
      w.startTimes.slice(1).forEach((t, i) => { if (fouled.has(i + 1)) return; n++; if (t != null && t < 20) onTime++; });
    }
    return { onTime: onTime / n, fouls, over, boats: seeds * 3 };
  };
  it('slack: the AI boats come in on a run and nearly all start within a few seconds of the gun, few foul, none early (16 races)', () => {
    const r = leeward('slack', 16);
    expect(r.onTime).toBeGreaterThan(0.9);
    expect(r.over).toBeLessThanOrEqual(1);
    expect(r.fouls).toBeLessThanOrEqual(8);
  }, 400000);
  it('a 1 kt flood setting them onto the line: nearly all still start on time, few over early (8 races)', () => {
    const r = leeward('flood', 8);
    expect(r.onTime).toBeGreaterThan(0.85);
    expect(r.over / r.boats).toBeLessThan(0.1);
  }, 400000);
});

describe('The first leg (World Sailing Race Management Manual J.2.2: "a race should start with a beat or have a beating leg as soon as possible after the start")', () => {
  const pool = COURSES.filter(c => c.group?.startsWith('Kelp Chowder')); // (the series' in-game name since Clubs' rename, 17 Nov 2026: real race names aren't shown)
  /** Worked out here from the courses themselves: those that fit the time, and each one's first leg off the wind. */
  const committee = (S: Settings) => {
    const day = raceDay(S, pool[0].windBase), target = TARGET_MIN[S.raceLength as 'short'];
    const off = (f: CourseFile) => { const e = estimateCourse(f, day, S.fleet); return Math.abs(Math.log(e.minutes / target)) + (e.slowestKt < 1 ? 1 : 0); };
    const fits = pool.filter(f => off(f) <= TIME_FIT);
    const twa1 = (f: CourseFile) => { const C = buildCourse(f, { bias: 0, fleet: S.fleet, windFrom: day.fromAtGun }), d = sub(C.marks[0].p, C.center); return Math.abs(wrap(brg(d.x, d.y) - day.wind(C.center, 0).from)); };
    const leg1 = (f: CourseFile) => estimateCourse(f, day, S.fleet).legs[0].minutes;
    return { fits, twa1, off, leg1, pick: chooseCourse(COURSES, S)!.est.file };
  };
  it('a southerly day where no course starts with a beat (12 Nov 2026, 14:35, a short race): of the courses that fit the time, the one whose first leg is nearest a beat and long enough to spread the fleet (J.3.1), not a two-minute dash to a mark', () => {
    const { fits, twa1, off, leg1, pick } = committee({ ...DEFAULT_SETTINGS, course: 'rc', windKind: 'auto', windKt: 0, windDay: 0, tideDate: '2026-11-12', tideTime: '14:35', raceLength: 'short', current: 'real', fleet: 7 } as Settings);
    expect(fits.length).toBeGreaterThan(0);
    expect(off(pick)).toBeLessThanOrEqual(TIME_FIT); // (it fits the time)
    const spread = fits.filter(f => leg1(f) > 5);
    expect(leg1(pick)).toBeGreaterThan(5);
    expect(twa1(pick)).toBeLessThanOrEqual(Math.min(...spread.map(twa1)) + 5);
  });
  it('a westerly: a course that fits the time and starts with a beat', () => {
    const { fits, twa1, off, pick } = committee({ ...DEFAULT_SETTINGS, course: 'rc', windKind: 'west', windKt: 14, current: 'slack', raceLength: 'medium', tideDate: '2026-11-14', tideTime: '13:00' } as Settings);
    expect(fits.some(f => twa1(f) < 55)).toBe(true);
    expect(off(pick)).toBeLessThanOrEqual(TIME_FIT);
    expect(twa1(pick)).toBeLessThan(55);
  });
});
