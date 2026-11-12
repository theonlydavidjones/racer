import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { dist } from '../src/core/math';
import { passageNow, passagePlan } from '../src/sim/navigator';

// the owner: "a realistic course estimate on the cruise chart: not only the navigator's route round land, but the
// course she'd actually sail, with the tacks (or gybes) on legs that are upwind or dead downwind ... the sailed
// distance and an ETA", the in-game navigator and the chart agreeing.
const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: 'crissy', tideDate: '2026-07-11', tideTime: '12:00', current: 'real', sea: 'flat', ...o });
const at = (o: Partial<Settings>) => new World(COURSES[0], S(o), 7, { freeSail: true });

describe('the passage she would sail leaving now', () => {
  it('is the one the passage plan is worked from (one passage for the plan, the chart and the tide graph)', () => {
    const w = at({}), pn = passageNow(w)!, pl = passagePlan(w)!;
    expect(pl.route).toEqual(pn.route); expect(pl.track).toEqual(pn.track);
    expect(passageNow(w)).toBe(pn); // (worked out once, while nothing's changed)
  });

  it('beats to a mark upwind: tacks on the way, sails further than the straight line, and arrives when the track does', () => {
    const w = at({}), pn = passageNow(w)!; // (the Cityfront to off Crissy Field: west, into the westerly)
    expect(pn.ok).toBe(true);
    expect(pn.legs.some(l => l.kind === 'beat')).toBe(true);
    expect(pn.tacks.length).toBeGreaterThan(0);
    const straight = dist({ x: w.user.x, y: w.user.y }, w.dest!.p);
    expect(pn.sailedM).toBeGreaterThan(straight * 1.2); // (a beat at about 45° each side: √2 the distance, less the current's help)
    expect(pn.eta).toBeCloseTo(pn.track[pn.track.length - 1].t, 6); expect(pn.eta! - pn.leave).toBeCloseTo(pn.minutes, 6);
    // each tack is on her track
    for (const q of pn.tacks) expect(Math.min(...pn.track.map(r => dist(r.p, q)))).toBeLessThan(60);
  });

  it('runs to a mark downwind and reaches across: no tacks on a reach', () => {
    const run = passageNow(at({ sailFrom: 'crissy', sailTo: 'cityfront' }))!;
    expect(run.ok).toBe(true); expect(run.legs.every(l => l.kind !== 'beat')).toBe(true); expect(run.tacks.length).toBe(0);
  });

  it('takes the current: the same passage at slack water and on the real tide arrives at different times', () => {
    const real = passageNow(at({ tideTime: '15:00' }))!, slack = passageNow(at({ tideTime: '15:00', current: 'slack' }))!;
    expect(real.ok && slack.ok).toBe(true);
    expect(Math.abs(real.minutes - slack.minutes)).toBeGreaterThan(0.5);
  });
});
