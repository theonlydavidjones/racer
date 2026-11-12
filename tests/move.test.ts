import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { place as getPlace } from '../src/sim/places';
import { LL } from '../src/geo/geo';

/** Cruising, "Move her here" on the chart: a new start without ending the cruise. */
const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', tideDate: '2026-11-14', current: 'slack' };

describe('Move her here (cruising)', () => {
  it('she\'s put there, stopped, on her heading; the clock, the destination and the distance sailed carry on', () => {
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    u.v = 2.5; for (let i = 0; i < 60 * 30; i++) w.step(DT);
    const t = w.t, sailed = w.sailedM, h = u.h, dest = w.dest, to = getPlace('raccoon')!.p;
    expect(sailed).toBeGreaterThan(10);
    expect(w.moveHere(to, 'Raccoon Strait')).toBe(true);
    expect(u.x).toBe(to.x); expect(u.y).toBe(to.y); expect(u.v).toBe(0); expect(u.h).toBe(h);
    expect(w.t).toBe(t); expect(w.dest).toBe(dest); expect(w.sailedM).toBe(sailed);
    w.step(DT); expect(w.sailedM - sailed).toBeLessThan(0.1); // (the move isn't sailed distance)
    expect(Math.hypot(u.x - to.x, u.y - to.y)).toBeLessThan(1);
  });
  it('not onto land, and not in a race (that would be a restart)', () => {
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user, x = u.x;
    expect(w.moveHere(LL(37.8000, -122.4400), 'the Marina District')).toBe(false); expect(u.x).toBe(x);
    const r = new World(COURSES[0], { ...S, mode: 'race' }, 1);
    expect(r.moveHere(getPlace('raccoon')!.p, 'Raccoon Strait')).toBe(false);
  });
  it('from her slip, made fast: she\'s cast off and put there', () => {
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    u.docked = { slip: 'west-harbor:671' }; u.pilotSteers = false;
    expect(w.moveHere(getPlace('crissy')!.p, 'Off Crissy Field')).toBe(true);
    expect(u.docked).toBeUndefined(); for (let i = 0; i < 60; i++) w.step(DT);
    expect(Math.hypot(u.x - getPlace('crissy')!.p.x, u.y - getPlace('crissy')!.p.y)).toBeLessThan(5);
  });
});
