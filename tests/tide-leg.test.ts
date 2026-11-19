import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { landAt } from '../src/environment/sea';
import { tideLeg } from '../src/environment/tideLeg';

/**
 * Cheating the tide (the owner's race, 18 Nov 2026): Course 2 on 7 Nov 2026 at 13:35, a 2.4 kt ebb setting west in
 * mid-stream, the run east from X to mark 6 (Fort Mason) straight into it. Out on the rhumb line she makes a knot or so
 * over the ground; inshore, where the sim's stream is weaker (environment/current.ts shoreRelief, an estimate), much more.
 */
const s = { ...DEFAULT_SETTINGS, course: 'ss2', tideDate: '2026-11-07', tideTime: '13:35', windKind: 'west', windKt: 7, current: 'real', traffic: 0, opponents: [], fleet: 0 } as Settings;
const w = new World(ss2 as unknown as CourseFile, s, 2434542977);
const X = LL(37.811667, -122.443333), M6 = LL(37.811667, -122.43);
const run = () => 3.5 * 0.5144; // (a Folkboat's run in 7 kt, about 3.5 kt through the water, any heading here: the leg is dead downwind)
const wet = (p: { x: number; y: number }) => !landAt(p);

describe('the time a leg takes inshore against the rhumb line, in the current as it is', () => {
  it('the run east from X to mark 6 into the ebb: the best track is inshore (to starboard, toward the Cityfront) and saves minutes', () => {
    const r = tideLeg(X, M6, p => w.currentAt(p), run, wet);
    (globalThis as any).process.stderr.write(`rhumb ${(r.rhumb / 60).toFixed(1)} min, best ${r.off} m off: ${(r.time / 60).toFixed(1)} min, saved ${(r.saved / 60).toFixed(1)}\n`);
    expect(r.rhumb / 60, 'the rhumb line, 1.2 km at about a knot over the ground').toBeGreaterThan(15);
    expect(r.off, 'to starboard of an eastbound leg: south, toward the shore').toBeGreaterThan(0);
    expect(r.saved / 60).toBeGreaterThan(4);
    for (const p of r.path) expect(wet(p)).toBe(true);
  });
  it('the beat back west with the ebb under her: the rhumb line, or near it (no relief to look for with the tide fair)', () => {
    const r = tideLeg(M6, X, p => w.currentAt(p), run, wet);
    expect(r.saved).toBeGreaterThanOrEqual(0); expect(r.off).toBeLessThanOrEqual(0); // (out into the stream, if anywhere: the fair tide's stronger there)
  });
  it('no current: the rhumb line, the shortest way', () => {
    const r = tideLeg(X, M6, () => ({ x: 0, y: 0 }), run, wet);
    expect(r.off).toBe(0); expect(r.saved).toBe(0);
  });
  it('a foul current she can\'t stem on every track: none can be sailed', () => {
    const r = tideLeg(X, M6, () => ({ x: -2, y: 0 }), run, () => true);
    expect(r.time).toBe(Infinity);
  });
  it('cost: a call on a 1.2 km leg in well under a couple of milliseconds', () => {
    const n = 50, t0 = performance.now();
    for (let i = 0; i < n; i++) tideLeg(X, M6, p => w.currentAt(p), run, wet);
    const ms = (performance.now() - t0) / n;
    (globalThis as any).process.stderr.write(`tideLeg: ${ms.toFixed(2)} ms a call\n`);
    expect(ms).toBeLessThan(5);
  });
});
