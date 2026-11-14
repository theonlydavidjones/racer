import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LESSON_MARKS, LessonTracker, MOB_LEEWAY, mobDrift, type MobEnv } from '../src/sim/lessons';
import { KT, V } from '../src/core/math';
import type { Boat } from '../src/boat/boat';

const boat = (o: Partial<{ x: number; y: number; h: number; v: number; twa: number }>): Boat => ({
  x: o.x ?? 0, y: o.y ?? 0, h: o.h ?? 0, v: o.v ?? 2.5, twa: o.twa ?? 90, tack: 'S', astern: 0
}) as unknown as Boat;
const still: MobEnv = { current: () => ({ x: 0, y: 0 }), wind: () => ({ from: 270, kt: 10 }) };
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', lesson: 'mob', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0, ...o });

describe('Learn to sail, lesson 10: crew overboard', () => {
  it('a person in a life jacket drifts with the current, and a little downwind of it (the Coast Guard\'s leeway)', () => {
    const d = mobDrift({ x: 0, y: 0 }, { from: 270, kt: 10 }, 1);
    // downwind (east, +x) 0.48% of 10 kt: about 0.025 m/s, 0.05 kt; crosswind a third of that
    expect(d.x).toBeCloseTo(MOB_LEEWAY.down * 10 * KT, 5);
    expect(Math.abs(d.y)).toBeCloseTo(MOB_LEEWAY.cross * 10 * KT, 5);
    const c = mobDrift({ x: 0.3, y: -0.5 }, { from: 270, kt: 10 }, -1);
    expect(c.x - d.x).toBeCloseTo(0.3, 5); expect(c.y + d.y).toBeCloseTo(-0.5, 5); // (the current carries them whole)
  });

  it('after a reach the person goes over at her stern; stopped alongside them, under 2 kt, they\'re recovered', () => {
    const L = new LessonTracker('mob', null); let t = 0;
    expect(L.cue).toBe('Sail a beam reach');
    for (; t < LESSON_MARKS.reachS + 1; t++) L.update(boat({ v: 2.5 }), t, 1, 0, still);
    expect(L.step).toBe(1); expect(L.mob).not.toBeNull(); expect(L.cue).toMatch(/^Crew overboard!/);
    expect(L.mob!.y).toBeLessThan(-3); // (heading north: over the stern, behind her)
    // she comes back and stops with them 2 m off her side (heading south now, they're abeam)
    const m = L.mob!, b = boat({ x: m.x - 2, y: m.y, h: 180, v: 0.4 * KT });
    for (let k = 0; k < 4; k++) L.update(b, t++, 1, 0, still);
    expect(L.passed).toBe(true); expect(L.cue).toMatch(/^Alongside in \d+:\d\d ✓$/);
    expect(L.mobTime).toBeGreaterThan(0);
  });

  it('sailing through them at speed runs them down: not recovered, and their body is pushed clear of her hull', () => {
    const L = new LessonTracker('mob', null); let t = 0;
    for (; t < LESSON_MARKS.reachS + 1; t++) L.update(boat({}), t, 1, 0, still);
    const m = L.mob!, b = boat({ x: m.x, y: m.y - 1, h: 0, v: 4 * KT });
    L.update(b, t++, 1, 0, still);
    expect(L.passed).toBe(false); expect(L.cue).toMatch(/^Too fast/);
    const s = V(90), across = (L.mob!.x - b.x) * s.x + (L.mob!.y - b.y) * s.y;
    expect(Math.abs(across)).toBeGreaterThanOrEqual(1.1);
  });

  it('in the World: the person drifts with the current where they are (lesson mode only)', () => {
    const w = new World(COURSES[0], S({ current: 'flood' } as Partial<Settings>), 3, { freeSail: true });
    const L = w.lesson!; expect(L.id).toBe('mob');
    L.step = 1; L.mob = { x: w.user.x + 200, y: w.user.y + 200, t: 0, side: 1 };
    const p0 = { ...L.mob }, cur = w.currentAt(p0);
    for (let i = 0; i < 100; i++) w.step(DT);
    const moved = { x: L.mob.x - p0.x, y: L.mob.y - p0.y }, T = 100 * DT;
    expect(Math.hypot(moved.x - cur.x * T, moved.y - cur.y * T)).toBeLessThan(0.05 * T + 0.02); // (the current, plus leeway of a few cm/s)
    expect(new World(COURSES[0], S({ mode: 'race' } as Partial<Settings>), 3).lesson).toBeNull();
  });
});
