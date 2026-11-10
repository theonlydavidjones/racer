import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { flagsAt, inTriangle, startSequence } from '../src/sim/signals';

const TRAIN = train as unknown as CourseFile, SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKt: 12, tideDate: '2026-11-14', current: 'slack', sea: 'flat', ...o });

describe('Starting signals (RRS 26)', () => {
  it('3-minute sequence: class flag at 3, P at 2, P down with a long sound at 1, class flag down at the gun', () => {
    const s = startSequence(3, 'P');
    expect(s.map(x => [x.t, x.up.join(), x.down.join(), x.sound])).toEqual([
      [-180, 'class', '', 'one'], [-120, 'P', '', 'one'], [-60, '', 'P', 'long'], [0, '', 'class', 'one']
    ]);
    expect(flagsAt(s, -150)).toEqual(['class']);
    expect(flagsAt(s, -90).sort()).toEqual(['P', 'class']);
    expect(flagsAt(s, -30)).toEqual(['class']);
    expect(flagsAt(s, 1)).toEqual([]);
  });
  it('2-minute sequence: the preparatory flag goes up at 1 minute and comes down at the gun', () => {
    const s = startSequence(2, 'Z');
    expect(flagsAt(s, -30).sort()).toEqual(['Z', 'class']);
    expect(flagsAt(s, 0)).toEqual([]);
  });
  it('the world flies the flags and sounds the signals on time', () => {
    const w = new World(TRAIN, settings({ fleet: 0, seq: 3 }), 2);
    let horns = 0, long = 0;
    for (let i = 0; i < 60 * 125; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'horn') { horns++; if (e.dur > 2) long++; } }
    expect(w.t).toBeGreaterThan(-60);
    expect(w.flags).toEqual(['class']); // P came down at one minute
    expect(horns).toBe(2); // the preparatory signal and the one-minute signal (the warning was at the very start)
    expect(long).toBe(1);
  });
});

describe('The last-minute rules (RRS 30)', () => {
  const tri = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 50, y: 500 } };
  it('the triangle is the line ends and the first mark', () => {
    expect(inTriangle({ x: 50, y: 10 }, tri.a, tri.b, tri.c)).toBe(true);
    expect(inTriangle({ x: 50, y: -5 }, tri.a, tri.b, tri.c)).toBe(false);
    expect(inTriangle({ x: -20, y: 10 }, tri.a, tri.b, tri.c)).toBe(false);
  });

  /** Put the user in the triangle (just over the middle of the line) at 30 s to go. */
  function overAt30(prepFlag: Settings['prepFlag'], course = TRAIN) {
    const w = new World(course, settings({ fleet: 0, seq: 3, prepFlag }), 2);
    while (w.t < -30) w.step(DT);
    const u = w.user, N = w.N;
    Object.assign(u, { x: w.center.x + N.x * 15, y: w.center.y + N.y * 15, v: 0.5 });
    let toasts = '';
    for (let i = 0; i < 30; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') toasts += e.msg + ' '; }
    return { w, u, toasts };
  }
  it('Z flag: in the triangle in the last minute is a 20% scoring penalty', () => {
    const { u, toasts } = overAt30('Z');
    expect(u.scoring).toBe('ZFP');
    expect(toasts).toContain('30.2');
  });
  it('U flag: disqualified; black flag: disqualified', () => {
    expect(overAt30('U').u.scoring).toBe('UFD');
    expect(overAt30('black').u.scoring).toBe('BFD');
  });
  it('P flag: no last-minute penalty', () => {
    expect(overAt30('P').u.scoring ?? null).toBeNull();
  });
  it('I flag: over in the last minute, she must go back round an end; back through the middle of the line doesn\'t count', () => {
    const { w, u } = overAt30('I');
    expect(u.roundEnd).toBe(true);
    const N = w.N, L = w.L, half = w.lineLen / 2;
    // dip back through the middle of the line: still has to go round an end
    u.prevD = w.lineD({ x: u.x, y: u.y }); Object.assign(u, { x: w.center.x - N.x * 10, y: w.center.y - N.y * 10 }); w.step(DT);
    expect(u.roundEnd).toBe(true);
    // over again, out past the end, and back across the extension: done
    Object.assign(u, { x: w.center.x + L.x * (half + 15) + N.x * 5, y: w.center.y + L.y * (half + 15) + N.y * 5 }); w.step(DT);
    Object.assign(u, { x: w.center.x + L.x * (half + 15) - N.x * 5, y: w.center.y + L.y * (half + 15) - N.y * 5 }); w.step(DT);
    expect(u.roundEnd).toBe(false);
  });
  it('the AI starts a little later under the stricter flags, and rarely gets caught', () => {
    let caught = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = new World(SS2, settings({ fleet: 5, prepFlag: 'black' }), seed);
      while (w.t < 5) w.step(DT);
      caught += w.boats.filter(b => !b.isUser && b.scoring).length;
    }
    expect(caught).toBeLessThanOrEqual(2); // out of 20 AI starts
  }, 60000);
});
