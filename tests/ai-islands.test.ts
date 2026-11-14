// The AI round an island and on a run: getting out of an island's lee across the wind once she has rounded it, and out
// of another boat's wind shadow downwind (the real 1 November 2025 race round Alcatraz: Charts' real past races, #192).
import { describe, expect, it } from 'vitest';
import ss3 from '../src/courses/data/seaweed-soup-2026-course3.json';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { aiThink, aroundIsland } from '../src/ai/ai';
import { V, dot, n360, sub, wrap } from '../src/core/math';

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
  it("getting out of an island's lee she keeps to the side she chose, even across the line down to her mark", () => {
    // her next mark nearly dead downwind of her (2° off: 18 Blossom Rock from Alcatraz in a 300° wind), so the line down
    // to it runs through the lee: chosen afresh each moment, the side swapped as she crossed that line
    const w = new World(ss3 as unknown as CourseFile, settings({ fleet: 1 }), 1);
    const k = w.C.marks.findIndex(m => !!m.reach);
    const isl = w.C.marks[k], [, B] = w.boats, F = w.wind.from;
    const down = V(F + 180), across = V(F + 90);
    Object.assign(B, { x: isl.p.x + down.x * 200 + across.x * 5, y: isl.p.y + down.y * 200 + across.y * 5, leeK: 0.3 });
    B.ai!.leeSide = null;
    const P = { x: isl.p.x + down.x * 1800, y: isl.p.y + down.y * 1800 };
    const exit1 = aroundIsland(isl, B, P, F, true), side = B.ai!.leeSide;
    expect(side).toBe(-1); // (P lies on the other side of her, by 5 m)
    // a few metres on across the wind, past the line down to P
    B.x += across.x * side! * 10; B.y += across.y * side! * 10;
    const exit2 = aroundIsland(isl, B, P, F, true);
    expect(B.ai!.leeSide).toBe(side);
    expect(dot(sub(exit2, B), across) * side!).toBeGreaterThan(250); // still heading out the same way
    expect(dot(sub(exit1, B), across) * side!).toBeGreaterThan(250);
    // out of the lee, she chooses afresh
    B.leeK = 0.9; aroundIsland(isl, B, P, F, true);
    expect(B.ai!.leeSide).toBeNull();
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
  /** Running to her next mark 600 m straight downwind, blanketed (shadowK 0.5) for `secs`, then (optionally) in clear air. */
  function blanket(o: { poled?: boolean; windward?: boolean } = {}) {
    const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 2 }), 1);
    const [, B, C] = w.boats, F = w.wind.from;
    for (const b of w.boats) { b.x += 1e5; b.y += 1e5; }
    const m = w.C.marks[0], up = V(F), h = n360(F + 180 - 10);
    Object.assign(B, { x: m.p.x + up.x * 600, y: m.p.y + up.y * 600, h, desired: h, v: 2.5, started: true, leg: 0, tack: 'S', leeK: 1, shadowK: 0.5, poleWant: !!o.poled, twa: 170 });
    if (o.windward) {
      // a boat on the same tack overlapped to windward of her, a beam's width off (the one blanketing her)
      const side = V(F + 90 + 180 - 10 - 90); // her windward side on starboard, running (the wind over her starboard quarter)
      Object.assign(C, { x: B.x + side.x * 5, y: B.y + side.y * 5, h, desired: h, v: 2.5, started: true, leg: 0, tack: 'S', leeK: 1, shadowK: 1 });
    }
    w.t = 600; B.ai!.running = true; B.lastTackT = -999;
    const clean = (() => { B.shadowK = 1; aiThink(w, B, DT); return B.desired; })();
    const run = (secs: number, k: number) => { for (let i = 0; i < secs * 60; i++) { B.shadowK = k; w.t += DT; aiThink(w, B, DT); } };
    return { w, B, F, clean, run };
  }
  it('once headed up out of a shadow, she holds the higher course a while rather than bear away back into it', () => {
    const { B, F, clean, run } = blanket();
    run(8, 0.5);
    const up = Math.abs(wrap(F - B.desired));
    expect(up).toBeLessThan(Math.abs(wrap(F - clean)) - 10);
    run(5, 1); // clear air again: still on the higher course
    expect(Math.abs(Math.abs(wrap(F - B.desired)) - up)).toBeLessThan(3);
    run(15, 1); // and back down to her run once well clear
    expect(Math.abs(wrap(B.desired - clean))).toBeLessThan(5);
  });
  it('poled out, she heads up no further than the pole stays set (it stows below 150°)', () => {
    const { B, F, run } = blanket({ poled: true });
    run(8, 0.5);
    expect(Math.abs(wrap(F - B.desired))).toBeGreaterThanOrEqual(150);
  });
  it('with a boat on her tack overlapped to windward (rule 17: heading up would luff it), she gybes away instead of heading up', () => {
    const { w, B, F, clean, run } = blanket({ windward: true });
    const [, , C] = w.boats;
    expect(w.rights(B, C).kc).toBe(C); // she's the leeward boat
    run(8, 0.5);
    // (not headed up out of the shadow, DIRTY_RUN_UP's 25°: the first few degrees of her gybe away, which rule 16.1
    // holds back with the other boat alongside, are no luff. Asked within 2° before the AI's rule 14 stopped answering
    // a boat sailing alongside at a steady distance, November 2026: that false escape was setting her course here)
    expect(Math.abs(wrap(F - B.desired)), 'not headed up out of the shadow').toBeGreaterThanOrEqual(Math.abs(wrap(F - clean)) - 10);
    expect(B.ai!.goTack?.to, 'gybing away').toBe('P');
  });
});
