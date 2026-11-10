import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { adjust, engage, standby, tack } from '../src/boat/autopilot';
import { place } from '../src/sim/places';
import { dist, n360, wrap } from '../src/core/math';

const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', ...o });
const run = (w: World, s: number, each?: () => void) => { for (let i = 0; i < s * 60; i++) { w.step(DT); each?.(); } };

describe('the tiller pilot', () => {
  it('Auto holds a compass course on a reach in a seaway, working the tiller no faster than the ram can', () => {
    const w = new World(COURSES[0], S({ sea: 'real' }), 4, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 90); u.v = 2.5; // a beam reach on port tack
    engage(u, w.pilot, 'auto'); const set = w.pilot.course;
    let worst = 0, last = u.tiller, fastest = 0;
    run(w, 120, () => {
      if (w.t > 20) worst = Math.max(worst, Math.abs(wrap(u.h - set)));
      fastest = Math.max(fastest, Math.abs(u.tiller - last) / DT); last = u.tiller;
    });
    expect(worst).toBeLessThan(8);
    expect(fastest).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('AutoTrim learns her standing weather helm, so she holds her course close-hauled in a breeze', () => {
    const w = new World(COURSES[0], S({ windKt: 20, sea: 'flat' }), 5, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 45); u.v = 2.5;
    engage(u, w.pilot, 'auto'); const set = w.pilot.course;
    let err = 0, n = 0;
    run(w, 120, () => { if (w.t > 60) { err += wrap(u.h - set); n++; } });
    expect(Math.abs(err / n)).toBeLessThan(2); // no standing error: the trim carries the helm she needs
  });

  it('Wind holds the apparent wind angle, and Tack puts it on the other side', () => {
    const w = new World(COURSES[0], S({ sea: 'flat' }), 6, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 50); u.v = 2.5;
    run(w, 10);
    engage(u, w.pilot, 'wind'); w.pilot.awa = 30; // wind 30° on the starboard bow... and she's on port tack: she'll come up to it
    w.pilot.awa = u.arel > 0 ? 30 : -30;
    run(w, 60);
    expect(Math.abs(u.arel - w.pilot.awa)).toBeLessThan(6);
    const before = u.tack;
    tack(u, w.pilot); run(w, 40);
    expect(u.tack).not.toBe(before);
    expect(Math.abs(u.arel - w.pilot.awa)).toBeLessThan(8);
  });

  it('the buttons turn the set course, and Standby leaves the tiller to you', () => {
    const w = new World(COURSES[0], S(), 7, { freeSail: true }), u = w.user;
    engage(u, w.pilot, 'auto'); const c = w.pilot.course;
    adjust(u, w.pilot, 10); expect(wrap(w.pilot.course - c)).toBeCloseTo(10);
    standby(w.pilot); u.tiller = 0.3; run(w, 1); expect(u.tiller).toBe(0.3);
  });

  it('Nav beats to a waypoint upwind, tacking on the layline, and holds her heading when she gets there', () => {
    const w = new World(COURSES[0], S({ sea: 'flat' }), 8, { freeSail: true }), u = w.user;
    const to = place('crissy')!; w.setDest(to.p, to.name);
    engage(u, w.pilot, 'nav');
    let tacks = 0, lastTack = u.tack;
    for (let i = 0; i < 60 * 60 * 25 && w.arrivedT == null; i++) { w.step(DT); if (u.tack !== lastTack) { tacks++; lastTack = u.tack; } }
    expect(w.arrivedT, `still ${Math.round(dist(u, to.p))} m away`).not.toBeNull();
    expect(tacks).toBeGreaterThanOrEqual(1);
    expect(w.pilot.mode).toBe('auto');
  }, 120_000);
});
