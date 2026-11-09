import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { buildCourse } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { brg } from '../src/core/math';

const SS2 = ss2 as unknown as CourseFile, TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o });

describe('courses load from JSON', () => {
  it('Seaweed Soup course 2: seven legs, X is a pass mark, line is an obstruction', () => {
    const C = buildCourse(SS2, { bias: 0, fleet: 3 });
    expect(C.marks.map(m => `${m.key}${m.type === 'pass' ? '(pass)' : ''}:${m.side}`)).toEqual(
      ['A:s', 'X(pass):s', '6:s', 'X(pass):p', 'A:s', 'X(pass):s', '6:s']);
    expect(C.obstruction).toBe(true);
    expect(C.pinKind).toBe('mark');
    expect(C.lineLen).toBeGreaterThan(200); // GGYC flagpole to X
    // first leg (to A) is a beat into the westerly; leg to 6 is downwind
    expect(C.marks[0].beat).toBe(true);
    expect(C.marks[2].beat).toBe(false);
  });

  it('training course: line length grows with the fleet and the bias rotates it', () => {
    const a = buildCourse(TRAIN, { bias: 0, fleet: 1 }), b = buildCourse(TRAIN, { bias: 8, fleet: 5 });
    expect(b.lineLen - a.lineLen).toBeCloseTo(14 * 4, 6);
    expect(brg(b.L.x, b.L.y) - brg(a.L.x, a.L.y)).toBeCloseTo(8, 6);
  });
});

describe('fixed timestep is reproducible', () => {
  it('same seed and inputs give the same race', () => {
    const run = () => {
      const w = new World(SS2, settings({ fleet: 5 }), 1234);
      for (let i = 0; i < 60 * 240; i++) w.step(DT); // 4 minutes: through the start
      return JSON.stringify(w.boats.map(b => [b.x, b.y, b.h, b.v, b.leg, b.ocs, b.started, b.penalty]));
    };
    expect(run()).toEqual(run());
  });
});

describe('start line: OCS and Rule 22.1 return (through the real sim)', () => {
  const place = (w: World, d: number, heading: number) => {
    const u = w.user;
    u.x = w.center.x + w.N.x * d; u.y = w.center.y + w.N.y * d; u.h = heading; u.v = 0; u.prevD = null; u.luff = true;
  };

  it('over the line at the gun → OCS; dip back below → cleared; cross again → started', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const toCourse = brg(w.N.x, w.N.y);
    w.t = -0.5; place(w, 6, toCourse);
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(w.user.ocs).toBe(true);
    expect(w.drainEvents().some(e => e.type === 'toast' && /Over early/.test(e.msg))).toBe(true);

    place(w, -12, toCourse); w.step(DT); w.step(DT); // first step after a teleport only records the line distance
    expect(w.user.ocs).toBe(false);
    expect(w.user.started).toBe(false);

    place(w, -4.5, toCourse); w.user.v = 2; w.user.luff = false;
    for (let i = 0; i < 120 && !w.user.started; i++) w.step(DT);
    expect(w.user.started).toBe(true);
    expect(w.startReport).not.toBeNull();
  });

  it('behind the line at the gun → not OCS', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    w.t = -0.5; place(w, -20, brg(w.N.x, w.N.y));
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(w.user.ocs).toBe(false);
  });
});

describe('AI fleet sails the course', () => {
  const race = (file: CourseFile, s: Partial<Settings>, seed: number, minutes: number) => {
    const w = new World(file, settings(s), seed);
    const end = minutes * 60;
    while (w.t < end && !w.boats.slice(1).every(b => b.finished)) w.step(DT);
    return w;
  };

  it('training course: every AI boat starts, rounds and finishes', () => {
    const w = race(TRAIN, { fleet: 5, current: 'ebb' }, 7, 20);
    for (const b of w.boats.slice(1)) expect(b.finished, `${b.name} leg ${b.leg}`).toBe(true);
  });

  it('Seaweed Soup course 2 in an ebb: every AI boat finishes', () => {
    const w = race(SS2, { fleet: 3, current: 'ebb' }, 11, 75);
    for (const b of w.boats.slice(1)) expect(b.finished, `${b.name} leg ${b.leg}`).toBe(true);
  }, 60_000);
});

describe('AI starts (regression guard, 8 races × 5 boats)', () => {
  const starts = (cur: string) => {
    const delays: number[] = []; let ocs = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = new World(SS2, settings({ fleet: 5, current: cur }), seed), ai = w.boats.slice(1), st = new Map<number, number>();
      while (w.t < 90) {
        w.step(DT);
        if (Math.abs(w.t) < DT) ocs += ai.filter(b => b.ocs).length;
        for (const b of ai) if (b.started && !st.has(b.id)) st.set(b.id, w.t);
      }
      for (const b of ai) delays.push(st.get(b.id) ?? 90);
    }
    delays.sort((a, b) => a - b);
    return { median: delays[delays.length >> 1], ocsRate: ocs / delays.length };
  };
  for (const cur of ['slack', 'ebb']) it(`Seaweed Soup line, ${cur}: few OCS, median start within 25 s of the gun (the AI is no ace yet)`, () => {
    const r = starts(cur);
    expect(r.ocsRate).toBeLessThan(0.15);
    expect(r.median).toBeLessThan(25);
  }, 60_000);
});

describe('laylines and course description', () => {
  it('before the start, laylines point at the first mark (a beat) and straddle the wind', async () => {
    const { laylinesFor } = await import('../src/sim/laylines');
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 3);
    w.step(DT);
    const L = laylinesFor(w, w.user)!;
    expect(L.kind).toBe('up');
    expect(L.mark.key).toBe('A');
    // tracks arriving at an upwind mark head into the wind, one each side of it
    const into = (g: { x: number; y: number }) => brg(g.x, g.y);
    const off = L.tracks.map(g => ((into(g) - w.user.ww.from + 540) % 360) - 180);
    expect(off[0]).toBeLessThan(-35); expect(off[1]).toBeGreaterThan(35);
  });

  it('on the run to 6 the laylines are downwind ones', async () => {
    const { laylinesFor } = await import('../src/sim/laylines');
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 3);
    w.step(DT); w.user.started = true; w.user.leg = 2;
    expect(laylinesFor(w, w.user)!.kind).toBe('down');
  });

  it('describes how to sail every leg', async () => {
    const { legDescriptions } = await import('../src/ui/courseView');
    const w = new World(SS2, settings({ fleet: 0 }), 3);
    const legs = legDescriptions(w);
    expect(legs).toHaveLength(8);
    expect(legs[0]).toBe('Start → A: beat (upwind). Round A leaving it to starboard (clockwise).');
    expect(legs[1]).toBe("A → X: run (downwind). Pass X leaving it to starboard. Don't round it.");
    expect(legs[3]).toContain('Pass X leaving it to port');
    expect(legs[7]).toBe('6 → Finish: cross the line between GGYC flagpole and X.');
  });
});
