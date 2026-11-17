import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { beatAngle, runAngle } from '../src/boat/polar';
import { aimPoint, crabFor } from '../src/ai/ai';
import { V, brg, n360, wrap } from '../src/core/math';
import type { CourseFile } from '../src/courses/course';

/** The AI fleet sailing the training course (windward–return, 620 m legs), the user's boat left at the line. */
function race(kt: number, current = 'slack', seed = 77) {
  return new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, current, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'] } as never, seed);
}

/**
 * What she should sail on a run, by where her mark is: her best running angle (polar.ts runAngle, for the wind she has)
 * when the mark is that deep or deeper, and straight at it when it's shallower. Above runAngle the polar is convex (the
 * VMG to a point off the wind is best on the straight line to it), so sailing deeper than the mark and gybing back only
 * adds distance; below it, steering straight at a mark dead downwind is slower than running at the angle and gybing.
 * `twa` hers, `aimTwa` her mark's (deg off the wind), `kt` her wind: her angle less the one she should sail, deg.
 */
const runError = (twa: number, aimTwa: number, kt: number): number => twa - Math.min(aimTwa, runAngle(kt));

describe('the AI sails the boat as a sailor does', () => {
  it('a tack she decides on she carries out (no stalling head to wind, no wheeling round mid-tack), and she runs at her best angle', () => {
    const w = race(12), ai = w.boats.filter(b => !b.isUser);
    const pending = new Map<number, { to: string; at: number }>(), late: string[] = [], stuck = new Map<number, number>(), stalls: string[] = [];
    const run = new Map<number, { s: number; n: number }>();
    while (w.t < 1500 && !ai.every(b => b.finished)) {
      w.step(DT);
      if (w.t < 0) continue;
      for (const b of ai) {
        if (!b.started || b.finished || b.penalty > 0) { pending.delete(b.id); stuck.delete(b.id); continue; }
        // (a tack held while nobody's near: keeping clear of another boat rightly comes first, Rules 10–16)
        const g = b.ai!.goTack, near = w.boats.some(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 30);
        if (g && g.mode === 'beat' && !pending.has(b.id)) pending.set(b.id, { to: g.to, at: w.t });
        const p = pending.get(b.id);
        if (p && near) pending.delete(b.id);
        else if (p && b.tack === p.to) pending.delete(b.id);
        else if (p && w.t - p.at > 15) { late.push(`${b.name} t${p.at.toFixed(0)}`); pending.delete(b.id); }
        // head to wind (within 10°) for more than 6 s
        const h2w = b.twa < 10 ? (stuck.get(b.id) ?? 0) + DT : 0; stuck.set(b.id, h2w);
        if (h2w > 6 && h2w - DT <= 6) stalls.push(`${b.name} t${w.t.toFixed(0)}`);
        // on the run (leg 1), her mean angle against what she should sail by where her mark is (runError): all of it,
        // so a boat held on the wrong gybe, reaching in from 30° past the layline, or steering straight at a mark dead
        // downwind, shows (physics review). (Not against runAngle alone: a boat whose mark lies 8° above it sails
        // straight at it, rightly, and read 6.5° high against runAngle: the crew chain's batch, 15 Nov 2026)
        if (b.leg === 1 && b.twa > 120) {
          const P = b.ai!.detour ?? aimPoint(w, b), aimTwa = Math.abs(wrap(b.ww.from - brg(P.x - b.x, P.y - b.y)));
          const r = run.get(b.id) ?? { s: 0, n: 0 }; r.s += runError(b.twa, aimTwa, b.ww.kt); r.n++; run.set(b.id, r);
        }
      }
    }
    expect(late).toEqual([]);
    expect(stalls).toEqual([]);
    // (every boat: one that never ran at all is a fault too)
    for (const b of ai) { const r = run.get(b.id) ?? { s: 0, n: 0 }; expect(r.n, b.name).toBeGreaterThan(3000); expect(Math.abs(r.s / r.n), b.name).toBeLessThan(6); }
  }, 180_000);
  it('her run judged by where her mark is: straight at one above her best angle is right; straight at one dead downwind is not', () => {
    const kt = 12, ra = runAngle(kt);
    expect(Math.abs(runError(160, 160, kt)), 'the mark 8° above her best angle: straight at it').toBeLessThan(1);
    expect(Math.abs(runError(ra, 178, kt)), 'the mark dead downwind: running at her angle').toBeLessThan(1);
    expect(runError(178, 178, kt), 'the mark dead downwind and she steers straight at it, held in reach mode').toBeGreaterThan(6);
    expect(runError(150, 160, kt), 'reaching 10° above a mark she could lay').toBeLessThan(-6);
  });
  it('she keeps clear of the committee boat and the pin: no touches of a starting mark before she has started (two minutes after the gun)', () => {
    for (const kt of [8, 12]) {
      const w = race(kt), touches = new Set<string>();
      while (w.t < 120) {
        w.step(DT);
        for (const b of w.boats) if (!b.isUser && !b.started && b.markTouch && w.t > -240) touches.add(`${kt} kt ${b.name}`);
      }
      expect([...touches]).toEqual([]);
    }
  }, 180_000);
  it('running across a current she gybes when the other gybe lays the mark, not back and forth across dead downwind', async () => {
    // (a 1.5 kt current setting 350° across the run home, about 080: steered up-current, her course through the water is
    // within a few degrees of dead downwind. Decided by the bearing she steered it as a reach and gybed every few
    // seconds, 51 times in the fleet at this seed: physics review. Uniform presets added here only, for the test)
    const { CURRENTS } = await import('../src/environment/current');
    CURRENTS.testCross = { id: 'testCross', set: 350, kt: 1.5, label: '', button: '' };
    const w = race(12, 'testCross', 72), ai = w.boats.filter(b => !b.isUser), last = new Map<number, { tack: string; t: number }>();
    let quick = 0;
    while (w.t < 1500 && !ai.every(b => b.finished)) {
      w.step(DT);
      if (w.t < 0) continue;
      for (const b of ai) {
        if (!b.started || b.finished || b.penalty > 0) continue;
        const L = last.get(b.id);
        if (L && L.tack !== b.tack && b.twa > 100 && w.t - L.t < 15) quick++;
        if (!L || L.tack !== b.tack) last.set(b.id, { tack: b.tack, t: w.t });
      }
    }
    delete CURRENTS.testCross;
    expect(ai.every(b => b.finished)).toBe(true);
    expect(quick).toBeLessThanOrEqual(10); // (5 as it stands, the five boats over the race)
  }, 180000);
  it("close-hauled she steers her leeway above the beat angle, so her course through the water is the polar's beat", () => {
    const w = race(12), beat = beatAngle(12);
    let s = 0, n = 0;
    while (w.t < 600) {
      w.step(DT);
      if (w.t < 20) continue;
      for (const b of w.boats) {
        if (b.isUser || !b.started || b.finished || b.tacking || b.penalty > 0 || b.leg !== 0 || b.v < 2) continue;
        const course = b.twa + Math.atan2(b.tack === 'S' ? -(b.sway ?? 0) : (b.sway ?? 0), b.v) * 180 / Math.PI;
        if (Math.abs(course - beat) < 6) { s += course; n++; }
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(Math.abs(s / n - beat)).toBeLessThan(1.5);
  }, 180_000);
  it('reaching across a current she steers up-current of the mark by just enough to make good the straight line', () => {
    for (const [brg, set, kn] of [[90, 0, 2], [45, 180, 1.5], [200, 290, 1]] as const) {
      const cur = { x: V(set).x * kn * 0.5144, y: V(set).y * kn * 0.5144 }, v = 2.8, h = crabFor(brg, v, cur), u = V(h);
      const over = { x: u.x * v + cur.x, y: u.y * v + cur.y }, made = n360(Math.atan2(over.x, over.y) * 180 / Math.PI);
      expect(Math.abs(wrap(made - brg))).toBeLessThan(0.01);
      expect(over.x * V(brg).x + over.y * V(brg).y).toBeGreaterThan(0);
    }
  });
});
