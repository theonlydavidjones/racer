import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { D2R, KT, V } from '../src/core/math';
import { beatAngle, polar, runAngle } from '../src/boat/polar';
import { TARGET_MIN, chooseCourse, legTime } from '../src/courses/committee';

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
  it('the AI boats come in on a run and start within a few seconds of the gun', () => {
    const f = COURSES.find(c => c.id === 'ss41')!;
    const w = new World(f, settings({ windKt: 12, current: 'slack', fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] }), 11);
    while (w.t < 40) w.step(DT);
    for (const t of w.startTimes.slice(1)) { expect(t).not.toBeNull(); expect(t!).toBeLessThan(20); }
  }, 60000);
});
