// The call-off's ways home are worked out a slice a step (ai.ts homeCourse, HOME_SLICES), the half-done work kept beside
// the World, not in it (a generator is no state the page's mirror can hold, sim/sync.ts). The same race every time: two
// Worlds sailed side by side give the same ways and the same boats; and a boat whose half-done way is lost (her object
// replaced, as a World rebuilt from its state would have it) starts hers afresh, the same in every copy, and gets home.
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { landAlong } from '../src/geo/shore';
import { PLACES } from '../src/sim/places';

/** A fleet of 7 called off 300 m east of Emeryville, the course's harbor Berkeley: the slowest ways home measured (~400 ms
 * a step for the fleet, worked out at once). */
function calledOff() {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 7, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'stock:6', 'stock:7'], windKind: 'west', windKt: 22 } as Settings, 3);
  while (w.t < 60) w.step(DT);
  const c = PLACES.find(p => p.id === 'emeryville')!.p;
  (w.C as { center: { x: number; y: number } }).center = c;
  w.boats.filter(b => !b.isUser).forEach((b, k) => { b.x = c.x + 300 + (k % 4) * 60; b.y = c.y + Math.floor(k / 4) * 80 - 40; });
  w.step(DT);
  w.cancelled = { t: w.t, kt: 24, up: ['N', 'A'], say: '' };
  return w;
}
const state = (w: World) => JSON.stringify(w.boats.map(b => [b.x.toFixed(6), b.y.toFixed(6), b.h.toFixed(6), b.ai?.home?.route.map(p => [p.x.toFixed(3), p.y.toFixed(3)]) ?? null]));
const homed = (w: World) => w.boats.filter(b => b.ai?.home).length;

describe("the call-off's ways home, a slice a step", () => {
  it('two Worlds sailed side by side: the same ways home, the same boats, and not all on the first step', () => {
    const a = calledOff(), b = calledOff();
    a.step(DT); b.step(DT);
    expect(homed(a), 'some still working hers out after the first step').toBeLessThan(a.boats.filter(o => !o.isUser && !o.finished).length);
    for (let k = 0; k < 900; k++) { a.step(DT); b.step(DT); }
    expect(state(a)).toBe(state(b));
    // (every boat sailing home, not spinning a penalty, has hers within 15 s of the call-off)
    const due = a.boats.filter(o => !o.isUser && !o.finished && !o.penalty);
    expect(due.length).toBeGreaterThan(0);
    expect(due.filter(o => !o.ai?.home).map(o => o.name)).toEqual([]);
  }, 120_000);

  it('her half-done way lost: she starts it afresh, the same in every copy, and it keeps off the land', () => {
    const lose = (w: World) => { for (let k = 0; k < 40; k++) w.step(DT); w.boats = w.boats.map(o => (o.isUser || o.ai?.home ? o : Object.assign(Object.create(Object.getPrototypeOf(o)), o))); };
    const a = calledOff(), b = calledOff();
    lose(a); lose(b);
    for (let k = 0; k < 900; k++) { a.step(DT); b.step(DT); }
    expect(state(a)).toBe(state(b));
    const ai = a.boats.filter(o => !o.isUser && o.ai?.home);
    expect(ai.length).toBeGreaterThan(0);
    for (const o of ai) { const r = o.ai!.home!.route; expect(r.slice(1).every((p, i) => landAlong(r[i], p) === Infinity), `${o.name}: ${JSON.stringify(r)}`).toBe(true); }
  }, 120_000);
});
