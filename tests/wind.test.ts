import { describe, expect, it } from 'vitest';
import { OPEN_WATER, Puffs, breezeAt, windTerrain } from '../src/environment/wind';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { LL } from '../src/geo/geo';
import { makeRng } from '../src/core/rng';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { World } from '../src/sim/world';

const at = (date: string, time: string, day: 0 | 1 | 2 = 1) => breezeAt(sfLocalToUtcMin(date, time), day);

describe('the afternoon westerly (NOAA records at Crissy Field, 2021–2025)', () => {
  it('in summer it fills in through the day: stronger at 16:00 than at 11:00', () => {
    expect(at('2027-07-10', '16:00').kt).toBeGreaterThan(at('2027-07-10', '11:00').kt + 3);
  });
  it('summer afternoons are windier than winter ones', () => {
    expect(at('2027-07-10', '15:00').kt).toBeGreaterThan(at('2026-11-14', '15:00').kt + 3);
  });
  it('a westerly blows on nearly every July afternoon, about half of November ones', () => {
    expect(at('2027-07-10', '15:00').west).toBeGreaterThan(0.9);
    expect(at('2026-11-14', '15:00').west).toBeLessThan(0.75);
  });
  it('it comes from the WSW, through the Golden Gate', () => {
    const d = at('2027-07-10', '15:00').from;
    expect(d).toBeGreaterThan(235); expect(d).toBeLessThan(275);
  });
  it('light, typical and windy days are the 25th, 50th and 75th percentile', () => {
    const [l, t, w] = ([0, 1, 2] as const).map(d => at('2027-07-10', '15:00', d).kt);
    expect(l).toBeLessThan(t); expect(t).toBeLessThan(w);
  });
});

describe('where it blows harder', () => {
  it('more wind in the slot between the Gate and Alcatraz than close to the Cityfront shore', () => {
    const slot = windTerrain(LL(37.8235, -122.448)), shore = windTerrain(LL(37.8065, -122.444));
    expect(slot).toBeGreaterThan(1.1); expect(shore).toBeLessThan(0.95);
  });
  it('the field agrees with the station at the station (Crissy Field shore)', () => {
    const k = windTerrain(LL(37.8063, -122.4659)) * OPEN_WATER;
    expect(k).toBeGreaterThan(0.85); expect(k).toBeLessThan(1.2);
  });
});

describe('puffs and lulls', () => {
  it('drift downwind', () => {
    const p = new Puffs(makeRng(3), { x: 0, y: 0 }), c = p.cells[0], x0 = c.x, y0 = c.y, age0 = c.age;
    p.step(1, { from: 270, kt: 15 }); // wind from the west: puffs move east
    if (c.age > age0) { expect(c.x).toBeGreaterThan(x0 + 5); expect(Math.abs(c.y - y0)).toBeLessThan(0.01); }
  });
  it('a puff is stronger and veered; a lull is lighter', () => {
    const p = new Puffs(makeRng(5), { x: 0, y: 0 });
    p.cells.length = 0;
    p.cells.push({ x: 0, y: 0, r: 100, amp: 0.25, age: 50, life: 100 }, { x: 1000, y: 0, r: 100, amp: -0.2, age: 50, life: 100 });
    const puff = p.at({ x: 0, y: 0 }), lull = p.at({ x: 1000, y: 0 }), none = p.at({ x: 500, y: 500 });
    expect(puff.k).toBeGreaterThan(1.15); expect(puff.veer).toBeGreaterThan(3);
    expect(lull.k).toBeLessThan(0.85);
    expect(none).toEqual({ k: 1, veer: 0 });
  });
  it('same seed, same puffs', () => {
    const a = new Puffs(makeRng(9), { x: 0, y: 0 }), b = new Puffs(makeRng(9), { x: 0, y: 0 });
    for (let i = 0; i < 100; i++) { a.step(0.5, { from: 250, kt: 14 }); b.step(0.5, { from: 250, kt: 14 }); }
    expect(a.cells).toEqual(b.cells);
  });
});

describe('in the race', () => {
  it('boats in different places feel different wind', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2027-07-10', tideTime: '15:00', fleet: 5 }, 2);
    for (let i = 0; i < 600; i++) w.step();
    const kts = w.boats.map(b => b.ww.kt.toFixed(2));
    expect(new Set(kts).size).toBeGreaterThan(2);
  });
  it('the westerly builds during a summer race', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2027-07-10', tideTime: '13:00', fleet: 0 }, 2);
    const k0 = w.windModel.kt;
    for (let i = 0; i < 60 * 60 * 45; i++) w.step(); // ~45 minutes
    expect(w.windModel.kt).toBeGreaterThan(k0 + 1);
  }, 30000);
});
