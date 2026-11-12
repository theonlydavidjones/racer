import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { CANCEL_KT } from '../src/sim/signals';
import { raceBrief } from '../src/sim/strategist';
import type { CourseFile } from '../src/courses/course';

const race = (kt: number) => new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, current: 'slack', sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] } as never, 5);

describe(`the committee calls racing off over ${CANCEL_KT} kt (the SF Bay Folkboat fleet's practice)`, () => {
  it('in 28 kt: AP over A before the start, no more racing today, and nobody finishes', () => {
    const w = race(28);
    while (w.t < 0 && !w.cancelled) w.step(DT);
    expect(w.cancelled).not.toBeNull();
    expect(w.cancelled!.t).toBeLessThan(0);
    expect(w.flags).toEqual(['AP', 'A']);
    while (w.t < 300) w.step(DT);
    expect(w.boats.some(b => b.finished)).toBe(false);
    expect(w.flags).toEqual(['AP', 'A']);
  }, 60000);
  it('in 16 kt: they race', () => {
    const w = race(16);
    while (w.t < 240) w.step(DT);
    expect(w.cancelled).toBeNull();
    expect(w.flags.includes('AP')).toBe(false);
  }, 60000);
  it('a breeze that builds past the limit after the start: N over A, abandoned', () => {
    const w = race(14);
    while (w.t < 60) w.step(DT);
    expect(w.cancelled).toBeNull();
    w.settings.windKt = 30; w.windModel.kt = 30;
    while (w.t < 600 && !w.cancelled) w.step(DT);
    expect(w.cancelled?.up).toEqual(['N', 'A']);
    expect(w.cancelled!.t).toBeGreaterThan(60);
  }, 60000);
  it("the strategist's briefing warns first when the forecast is over the limit, and not on an ordinary day", () => {
    expect(raceBrief(race(28)).sections[0].id).toBe('limit');
    expect(raceBrief(race(12)).sections.some(s => s.id === 'limit')).toBe(false);
  }, 60000);
});
