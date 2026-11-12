import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

/** Just sail from under the Golden Gate Bridge with the conditions adjuster as set (the owner's heavy-weather report). */
const atTheGate = (o: Partial<Settings>) => new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'gate', sailTo: '', tideDate: '2026-11-14', ...o } as Settings, 1, { freeSail: true });
const combined = (s: { hsW: number; hsS: number }) => Math.hypot(s.hsW, s.hsS);

describe('heavy weather at the Gate (the conditions adjuster maxed out)', () => {
  const max = { windKt: 30, chop: 3, swellHs: 5, rain: 2, fog: 2 } as const;
  it('she has her full sea from the first frame, before a single step', () => {
    const w = atTheGate(max), s0 = w.user.sea;
    expect(combined(s0)).toBeGreaterThan(2.5);
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(Math.abs(combined(w.user.sea) - combined(s0))).toBeLessThan(0.5); // (the same sea a second later)
  });
  it('the chop × 3 is clearly bigger than × 1, in longer waves (it grows as a sea does, not only steeper until it breaks)', () => {
    const one = atTheGate({ ...max, chop: 1 }).user.sea, three = atTheGate(max).user.sea;
    expect(three.hsW).toBeGreaterThan(2 * one.hsW);
    expect(three.tpW).toBeGreaterThan(1.5 * one.tpW);
    expect(three.steep).toBeLessThanOrEqual(0.1);
  });
  it('glassy at × 0', () => {
    expect(atTheGate({ ...max, chop: 0 }).user.sea.hsW).toBe(0);
  });
});
