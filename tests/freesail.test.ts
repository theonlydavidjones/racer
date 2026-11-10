import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { PLACES, place } from '../src/sim/places';
import { dist } from '../src/core/math';
import { onLand } from '../src/geo/shore';
import { laylinesFor } from '../src/sim/laylines';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, mode: 'sail', windKt: 12, current: 'slack', tideDate: '2026-11-14', ...o });
const sail = (o: Partial<Settings>) => new World(COURSES[0], settings(o), 1, { freeSail: true });

describe('Just sail: where from and where to', () => {
  it('every place is on open water', () => {
    for (const p of PLACES) expect(onLand(p.p), p.id).toBe(false);
  });

  it('starts you at the place you chose, on a reach with open water ahead', () => {
    for (const id of ['sausalito', 'clipper', 'raccoon', 'gate']) {
      const w = sail({ sailFrom: id }), u = w.user;
      expect(dist(u, place(id)!.p), id).toBeLessThan(1);
      const twa = Math.abs(((w.wind.from - u.h + 540) % 360) - 180);
      expect(twa, id).toBeGreaterThan(70);
      expect(twa, id).toBeLessThan(110);
    }
  });

  it('the destination is what the dials measure to, and laylines point at it on a beat', () => {
    const w = sail({ sailFrom: 'pier39', sailTo: 'm-16' }); // Blackaller, well to windward of Pier 39
    expect(w.nextMark(w.user)?.name).toMatch(/Blackaller/);
    w.step(DT);
    const L = laylinesFor(w, w.user);
    expect(L?.kind).toBe('up');
    expect(L?.mark.name).toMatch(/Blackaller/);
  });

  it('no destination: nothing to measure to', () => {
    const w = sail({ sailFrom: 'cityfront', sailTo: '' });
    expect(w.dest).toBeNull();
    expect(w.nextMark(w.user)).toBeNull();
  });

  it('tells you when you get there', () => {
    const w = sail({ sailFrom: 'cityfront', sailTo: 'm-A' }), u = w.user;
    u.x = w.dest!.p.x + 30; u.y = w.dest!.p.y; w.step(DT);
    expect(w.arrivedT).not.toBeNull();
    expect(w.drainEvents().some(e => e.type === 'toast' && /Arrived/.test(e.msg))).toBe(true);
    expect(w.nextMark(u)).toBeNull();
  });
});
