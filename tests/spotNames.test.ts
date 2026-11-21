import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { destMark, latLon, place, spotId, spotLabel } from '../src/sim/places';

/**
 * r270, the owner's rule for places: never coordinates. A spot picked on open water reaches the sim by its position
 * (the chart sends latLon's form), so whatever the sim writes about it (the toast, the log, the destination's name) once
 * said numbers. Now the sim names it by the nearest place (spotLabel) and flags it (CourseMark.spot), and the 3D view
 * and the HUD give it a plain pin by that flag.
 */
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', ...o });

describe('a spot on open water is never named by its coordinates in the sim (r270)', () => {
  const q = { ...place('alcatraz')!.p }; q.x += 900; q.y -= 600;
  it('a saved spot ("at:…") is named by the nearest place, with no coordinates', () => {
    const pl = place(spotId(q))!;
    expect(pl.name).not.toMatch(/°|′|\d\.\d/); // (no coordinates: a place may have a number in its name, Pier 39)
    expect(pl.name).toBe(spotLabel(q));
  });
  it('destMark flags a spot (a saved one, or one picked on the chart) and leaves a mark or place unflagged', () => {
    expect(destMark(place(spotId(q)))!.spot).toBe(true);
    expect(destMark({ id: 'pick', name: latLon(q), group: 'Spots', p: q })!.spot).toBe(true);
    const m = place('m-A')!;
    expect(destMark(m)!.spot).toBeUndefined();
    expect(destMark({ id: 'pick', name: m.name, group: 'Spots', p: m.p })!.spot).toBeUndefined(); // (a mark clicked on the chart)
  });
  it('a cruise sent to a spot by its position: a bare name, the spot flag, and a toast without coordinates', () => {
    const w = new World(COURSES[0], S(), 4, { freeSail: true });
    w.events.length = 0; w.setDest(q, latLon(q));
    const toasts = w.events.flatMap(e => e.type === 'toast' ? [e.msg] : []);
    expect(w.dest!.name).toBe(spotLabel(q));
    expect(w.dest!.name).not.toMatch(/°|′|\d\.\d/);
    expect(w.dest!.spot).toBe(true);
    expect(toasts).toHaveLength(1); expect(toasts[0]).not.toMatch(/°|′|\d\.\d/);
    const m = place('m-A')!; w.setDest(m.p, m.name);
    expect(w.dest!.name).toBe(m.name); expect(w.dest!.spot).toBeUndefined();
  });
});
