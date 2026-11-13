// The AI round an island and on a run: getting out of an island's lee across the wind once she has rounded it, and out
// of another boat's wind shadow downwind (the real 1 November 2025 race round Alcatraz: Charts' real past races, #192).
import { describe, expect, it } from 'vitest';
import ss3 from '../src/courses/data/seaweed-soup-2026-course3.json';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { aiThink } from '../src/ai/ai';
import { V, n360, wrap } from '../src/core/math';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', tideDate: '2026-11-14', traffic: 0, ...o });

describe('the AI at an island and downwind', () => {
  it("once round an island, in its lee she leaves across the wind, toward where she's going, not on downwind", () => {
    const w = new World(ss3 as unknown as CourseFile, settings({ fleet: 1 }), 1);
    const k = w.C.marks.findIndex(m => !!m.reach); expect(k).toBeGreaterThanOrEqual(0);
    const isl = w.C.marks[k], [, B] = w.boats, F = w.wind.from;
    for (const b of w.boats) { b.x += 1e5; b.y += 1e5; }
    // just past it, 180 m downwind of it, in its lee
    const u = V(F + 180 - 20);
    Object.assign(B, { x: isl.p.x + u.x * 180, y: isl.p.y + u.y * 180, h: n360(F + 180 + 30), desired: n360(F + 180 + 30), v: 1, started: true, leg: k + 1, tack: 'S', leeK: 0.3, shadowK: 0.3 });
    w.t = 600;
    aiThink(w, B, DT);
    const twa = Math.abs(wrap(F - B.desired));
    expect(twa, `desired ${B.desired.toFixed(0)}, wind from ${F.toFixed(0)}`).toBeGreaterThan(60); // across the wind,
    expect(twa).toBeLessThan(120); // not on downwind into the lee (she'd steered ~150° off the wind before)
  });
  it("running in another boat's wind shadow, she heads up out of it after a few seconds", () => {
    const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 1 }), 1);
    const [, B] = w.boats, F = w.wind.from;
    for (const b of w.boats) { b.x += 1e5; b.y += 1e5; }
    // 600 m straight upwind of her next mark, running down to it
    const m = w.C.marks[0], up = V(F), h = n360(F + 180 - 10);
    Object.assign(B, { x: m.p.x + up.x * 600, y: m.p.y + up.y * 600, h, desired: h, v: 2.5, started: true, leg: 0, tack: 'S', leeK: 1, shadowK: 0.5 });
    w.t = 600; B.ai!.running = true;
    const clean = (() => { B.shadowK = 1; aiThink(w, B, DT); return B.desired; })();
    B.shadowK = 0.5;
    for (let i = 0; i < 12 * 60; i++) { B.shadowK = 0.5; aiThink(w, B, DT); }
    // she sails higher than her clean-air run (toward the wind), out of the shadow
    expect(Math.abs(wrap(F - B.desired)), `clean ${clean.toFixed(0)}, blanketed ${B.desired.toFixed(0)}`).toBeLessThan(Math.abs(wrap(F - clean)) - 10);
  });
});
