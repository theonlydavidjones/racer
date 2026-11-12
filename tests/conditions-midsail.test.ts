import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

/** The conditions changed mid-sail, at once (the owner's #8 (2)): the boats, the clock, the course and the log carry on. */
const base: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 8, windTurn: 0, mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', tideDate: '2026-11-14', current: 'slack', sea: 'real' };

describe('changing the conditions mid-sail', () => {
  it('cruising: a fresher, turned wind, a flood and flat water, at once; she, the clock and the destination carry on', () => {
    const w = new World(COURSES[0], base, 1, { freeSail: true }), u = w.user;
    u.v = 2; for (let i = 0; i < 60 * 20; i++) w.step(DT);
    const t = w.t, at = { x: u.x, y: u.y, h: u.h }, dest = w.dest, from0 = w.wind.from;
    expect(w.wind.kt).toBeLessThan(11);
    w.applyConditions({ ...base, windKt: 18, windTurn: 20, current: 'flood', sea: 'flat' });
    expect(w.t).toBe(t); expect(u.x).toBe(at.x); expect(u.y).toBe(at.y); expect(u.h).toBe(at.h); expect(w.dest).toBe(dest);
    expect(w.wind.kt).toBeGreaterThan(14); expect(w.wind.kt).toBeLessThan(23);
    expect(Math.abs(((w.wind.from - from0 - 20 + 540) % 360) - 180)).toBeLessThan(12); // (turned about 20°, give or take the shifts)
    expect(w.cur.id).toBe('flood'); expect(w.sea.flat).toBe(true);
    expect(w.settings.windKt).toBe(18); expect(w.settings.sailTo).toBe('alcatraz'); // (only the conditions change)
    for (let i = 0; i < 60 * 10; i++) w.step(DT);
    expect(Number.isFinite(u.x) && Number.isFinite(w.wind.kt)).toBe(true);
    expect(w.wind.kt).toBeGreaterThan(13); // (it stays changed)
  });
  it('racing: the fleet and the laid marks stay; everyone sails in the new wind', () => {
    const S: Settings = { ...base, mode: 'race', fleet: 1, opponents: DEFAULT_SETTINGS.opponents.slice(0, 1) };
    const w = new World(COURSES[0], S, 1);
    for (let i = 0; i < 60 * 20; i++) w.step(DT);
    const marks = w.C.marks.map(m => ({ ...m.p })), n = w.boats.length, t = w.t;
    w.applyConditions({ ...S, windKt: 16 });
    expect(w.boats.length).toBe(n); expect(w.t).toBe(t); expect(w.C.marks.map(m => m.p)).toEqual(marks);
    for (let i = 0; i < 60 * 5; i++) w.step(DT);
    for (const b of w.boats) expect(b.ww.kt).toBeGreaterThan(10);
  }, 30000);
  it('racing, a big turn: which legs are beats, reaches and runs goes with the new wind (rule 18.1(a), laylines); the marks stay put', () => {
    const S: Settings = { ...base, mode: 'race', fleet: 1, opponents: DEFAULT_SETTINGS.opponents.slice(0, 1), windTurn: -30 };
    const w = new World(COURSES[0], S, 1);
    for (let i = 0; i < 60 * 5; i++) w.step(DT);
    const legs0 = w.C.marks.map(m => m.leg), at = w.C.marks.map(m => ({ ...m.p }));
    w.applyConditions({ ...S, windKind: 'north' });
    const from = w.windModel.base, brg = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
    for (const m of w.C.marks) {
      const off = Math.abs(((from - brg(m.prev, m.p) + 540) % 360) - 180);
      expect(m.leg).toBe(off < 55 ? 'beat' : off > 125 ? 'run' : 'reach'); expect(m.beat).toBe(off < 55);
    }
    expect(w.C.marks.map(m => m.leg)).not.toEqual(legs0); // (a westerly's beat is no beat in a northerly)
    expect(w.C.marks.map(m => m.p)).toEqual(at); expect(w.committeeFrom).toBe(from);
  }, 30000);
  it('a sea breeze changed for another day: its sea is grown from the new day\'s wind, not the old one\'s', () => {
    const S: Settings = { ...base, windKt: 0, windDay: 0, sea: 'real' };
    const w = new World(COURSES[0], S, 1, { freeSail: true });
    for (let i = 0; i < 60 * 20; i++) w.step(DT);
    const next = { ...S, windDay: 2 as const };
    w.applyConditions(next);
    const fresh = new World(COURSES[0], next, 1, { freeSail: true });
    expect(w.seaBreeze).toBe(true);
    expect(w.sea.duration).toBeCloseTo(fresh.seaDurationAt(w.clockUtc), 3);
  });
});
