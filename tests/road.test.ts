import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LESSON_MARKS } from '../src/sim/lessons';
import { LOA, V, n360 } from '../src/core/math';
import { engage } from '../src/boat/autopilot';
import { CONTACT_GAP, hullGap } from '../src/rules';

const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'lesson', lesson: 'road', sailFrom: 'northchannel', sailTo: '', tideDate: '2026-07-11', current: 'slack', opponents: [], fleet: 0, traffic: 0, ...o } as Settings);
const world = () => new World(COURSES[0], S(), 3, { freeSail: true });
/** Her pilot on a course (the helm a sailor would hold): by the compass. */
const steer = (w: World, h: number) => { engage(w.user, w.pilot, 'auto'); w.pilot.course = n360(h); };
/** Sail on until `done`, or `s` seconds; the least gap between the hulls on the way (m). */
function sail(w: World, s: number, done: () => boolean = () => false): number {
  let gap = Infinity;
  for (let i = 0; i < s / DT && !done(); i++) { w.step(DT); gap = Math.min(gap, hullGap(w.user, w.boats[1])); }
  return gap;
}
/** Put her on a heading, sailing: as if she'd been there a while (the lesson's checks need her moving). */
function setOn(w: World, h: number) {
  const u = w.user; u.h = u.desired = n360(h); u.v = 2.5; const g = V(u.h); u.vx = g.x * 2.5; u.vy = g.y * 2.5; steer(w, h);
}

describe('Learn to sail, lesson 9: rules of the road', () => {
  it('has one other boat, only in this lesson, and she waits out of the way', () => {
    const w = world();
    expect(w.lesson!.id).toBe('road'); expect(w.boats.length).toBe(2);
    expect(Math.hypot(w.boats[1].x - w.user.x, w.boats[1].y - w.user.y)).toBeGreaterThan(400);
    expect(new World(COURSES[0], S({ lesson: 'mob' } as Partial<Settings>), 3, { freeSail: true }).boats.length).toBe(1);
  });

  it('on port tack a starboard boat is set on a collision course; holding on, you come too close and do it again', () => {
    const w = world(), L = w.lesson!, from = w.windModel.base;
    setOn(w, from + 100); // (port tack, a beam reach)
    sail(w, 10, () => L.step === 1);
    expect(L.step).toBe(1); expect(L.cue).toMatch(/^Starboard boat!/);
    const o = w.boats[1]; expect(o.tack).toBe('S');
    const gap = sail(w, 90, () => L.step !== 1);
    expect(gap).toBeLessThan(LESSON_MARKS.clearLoa * LOA); // (she stood on to the last moment, then swerved: Rule 17(b))
    expect(L.step).toBe(0); expect(L.cue).toMatch(/^(Too close|You hit her)/);
    expect(w.paused).toBe(false); // (no racing-rules incident: the lesson says what happened)
  });

  it('a gap with no plain action of yours doesn\'t pass: Rule 16 wants early and substantial action', () => {
    const w = world(), L = w.lesson!, from = w.windModel.base;
    setOn(w, from + 100);
    sail(w, 10, () => L.step === 1);
    const o = w.boats[1]; o.x += 120 * V(o.h + 90).x; o.y += 120 * V(o.h + 90).y; // (she happens to pass well wide)
    sail(w, 120, () => L.step !== 1);
    expect(L.step).toBe(0); expect(L.cue).toMatch(/^Alter early and plainly/);
  });

  it('she\'s set only once your heading and speed have settled, and never coming up from astern (Rule 13)', () => {
    const w = world(), L = w.lesson!, from = w.windModel.base;
    setOn(w, from + 100); steer(w, from + 40); // (still turning)
    sail(w, 3);
    expect(L.step).toBe(0);
  });

  it('giving way early and plainly (bearing away under her stern) passes, and the next is the windward boat', () => {
    const w = world(), L = w.lesson!, from = w.windModel.base;
    setOn(w, from + 100);
    sail(w, 10, () => L.step === 1);
    steer(w, from + 150); // (bear away hard, early: her stern, not her bow)
    const gap = sail(w, 90, () => L.step !== 1);
    expect(gap).toBeGreaterThanOrEqual(LESSON_MARKS.clearLoa * LOA);
    expect(L.step).toBe(2); expect(L.cue).toMatch(/starboard tack/);
    // starboard, a beam reach: a boat to leeward is set coming up close-hauled; you head up and away from her
    setOn(w, from - 90);
    sail(w, 150, () => L.step === 3); // (once the last boat's well away)
    expect(L.step).toBe(3); expect(L.cue).toMatch(/to leeward/);
    const o = w.boats[1]; expect(o.tack).toBe('S');
    steer(w, from - 50); // (up toward the wind, away from her)
    sail(w, 120, () => L.step !== 3);
    expect(L.step).toBe(4);
  });

  it('standing on, she keeps clear of you (the race AI\'s keep-clear); you hold your course and speed', () => {
    const w = world(), L = w.lesson!, from = w.windModel.base;
    L.step = 4; setOn(w, from - 60); // (starboard, a close reach)
    sail(w, 10, () => L.step === 5);
    expect(L.step).toBe(5); expect(L.cue).toMatch(/^A port boat/);
    const o = w.boats[1]; expect(o.tack).toBe('P');
    const gap = sail(w, 120, () => L.step !== 5);
    expect(gap).toBeGreaterThan(CONTACT_GAP); // (she kept clear: the race AI's keep-clear, judged by its closest approach)
    expect(L.step).toBe(6); expect(L.gate).not.toBeNull(); expect(L.cue).toMatch(/red right returning/);
  });

  it('turning away when you stand on spoils it, and it\'s set again', () => {
    const w = world(), L = w.lesson!, from = w.windModel.base;
    L.step = 4; setOn(w, from - 60);
    sail(w, 10, () => L.step === 5);
    steer(w, from - 150); // (bears away: not holding her course)
    sail(w, 20);
    expect(L.cue).toMatch(/^Hold your course/);
    sail(w, 120, () => L.step !== 5);
    expect(L.step).toBe(4);
  });

  it('the buoys are the North Channel\'s real 1 and 2: in between them northbound, red 2 to starboard, passes; outside doesn\'t', () => {
    const lay = (w: World, dx: number) => {
      const L = w.lesson!, c = L.channel!; expect(c).not.toBeNull();
      (L as unknown as { step: number }).step = 6;
      // 300 m south of the line, `dx` m east of its middle, heading north
      const u = w.user; u.x = (c.red.x + c.green.x) / 2 + dx; u.y = (c.red.y + c.green.y) / 2 - 300;
      (L as unknown as { layGate(b: unknown): void }).layGate(u); setOn(w, L.gate!.inbound);
      return L;
    };
    const w = world(), L = lay(w, 0), g = L.gate!;
    expect(Math.abs(((g.inbound % 360) + 360) % 360 - 352)).toBeLessThan(10); // (about north: the line runs a little north of east)
    expect(g.red.x).toBeGreaterThan(g.green.x); // (red 2 to the east: on her right, northbound)
    sail(w, 300, () => L.passed);
    expect(L.passed).toBe(true);
    const w2 = world(), L2 = lay(w2, 900); // (east of red 2)
    sail(w2, 300, () => /Between/.test(L2.cue));
    expect(L2.passed).toBe(false); expect(L2.cue).toMatch(/^Between the buoys/);
  });
});
