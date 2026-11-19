import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { speedAlong, tideLine } from '../src/ui/tideLine';

// The coach's foul-tide line (owner's race, 18 Nov 2026): Course 2 on 7 Nov 2026 at 13:35, a 2.4 kt ebb, the run east
// from X to mark 6 straight into it.
const s = { ...DEFAULT_SETTINGS, course: 'ss2', tideDate: '2026-11-07', tideTime: '13:35', windKind: 'west', windKt: 7, current: 'real', traffic: 0, opponents: [], fleet: 0 } as Settings;
const w = new World(ss2 as unknown as CourseFile, s, 2434542977);
const X = LL(37.811667, -122.443333), M6 = LL(37.811667, -122.43);
const env = { currentAt: (p: { x: number; y: number }) => w.currentAt(p), windHere: (p: { x: number; y: number }) => w.windHere(p, undefined, false) };

describe('the foul-tide coach line', () => {
  it('speaks on the run east into the ebb, with the saving in minutes', () => {
    expect(tideLine(X, M6, env)).toMatch(/^Foul tide: stay inshore on this leg, it saves about \d+ min\.$/);
  });
  it('is silent with the tide fair (the beat back west) and with no current', () => {
    expect(tideLine(M6, X, env)).toBeNull();
    expect(tideLine(X, M6, { ...env, currentAt: () => ({ x: 0, y: 0 }) })).toBeNull();
  });
  it('is silent on a short leg', () => {
    expect(tideLine(X, { x: X.x + 100, y: X.y }, env)).toBeNull();
  });
  it('her speed along a heading is her polar between the beat and the run, and her best beat made good closer in', () => {
    expect(speedAlong(10, 0, 90)).toBeGreaterThan(2);
    expect(speedAlong(10, 0, 10)).toBeGreaterThan(0); expect(speedAlong(10, 0, 10)).toBeLessThan(speedAlong(10, 0, 90) * 1.2);
  });
});
